import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, SenderType, type Role, type Prisma } from "@prisma/client";
import {
  sendTextMessage,
  sendAudioMessage,
  uploadMedia,
  downloadMedia,
  WhatsAppApiError,
} from "@/lib/meta/whatsapp";
import type { WhatsAppCredentials, WhatsAppRecipient } from "@/lib/meta/whatsapp";
import type {
  UnsupportedMediaType,
  ArchivedMediaKind,
  StructuredKind,
} from "@/lib/meta/whatsapp-inbound";
import { MEDIA_NOTICES } from "@/lib/meta/inbound";
import { uploadPatientMedia } from "@/lib/supabase/storage";
import { transcribeAudio } from "./transcription";
import { synthesizeSpeech } from "./tts";
import { describeImage } from "./vision";
import type {
  VoiceMessageMetadata,
  MediaAttachmentMetadata,
  StructuredMessageMetadata,
} from "@/agent/types";
import { showTypingIndicator } from "./whatsappTyping";
import {
  runAgentStream,
  runAgentToText,
  DEFAULT_MODEL,
  type AgentContext,
  type PriorMessage,
} from "@/agent";
import type { AgentStreamEvent } from "@/agent";
import type { ToolCallRecord } from "@/agent/types";
import {
  getOrCreateWebConversation,
  resolveActiveSession,
  getSessionMessages,
  persistUserMessage,
  persistAgentMessage,
  isSessionAiEnabled,
  type SessionMessage,
} from "./agentSession";
import {
  getClinicAiStatus,
  chargeUsage,
  chargeTranscription,
  chargeTts,
  chargeExtraction,
  isDuplicateChargeError,
  ensureOpenEscalation,
  escalateMessage,
  notifyUnitAlert,
} from "./aiCredit";
import { getOrCreatePatientByPhone } from "./patients";
import type { TokenUsage } from "@/agent/types";

const FALLBACK_REPLY = "تم تنفيذ طلبك.";

/**
 * How a WhatsApp contact is identified on an inbound message: a phone (classic)
 * and/or a Business-Scoped User ID (`userId`, present when the phone is hidden
 * behind a username). At least one is non-null. Used both to reply and to match
 * the contact to a Profile.
 */
export interface WhatsAppContact {
  phone: string | null;
  userId: string | null;
}

/** A label for logs when a contact has no phone. */
const contactLabel = (c: WhatsAppContact) => c.phone ?? c.userId ?? "unknown";

/** Arabic placeholder shown in the thread for a stored, unreadable attachment. */
function mediaPlaceholder(kind: ArchivedMediaKind | "image"): string {
  switch (kind) {
    case "image":
      return MEDIA_NOTICES.image.placeholder;
    case "video":
      return MEDIA_NOTICES.video.placeholder;
    case "document":
      return MEDIA_NOTICES.file.placeholder;
    case "sticker":
      return MEDIA_NOTICES.sticker.placeholder;
  }
}

/**
 * Sends a reply over the Cloud API without letting a delivery failure escape.
 *
 * The reply is already persisted, and the admin inbox offers a retry, so
 * throwing would only make the webhook treat an already-handled message as
 * unprocessed and record the inbound text a second time. A closed 24-hour
 * window (code 131047) is the expected failure — free-form text can't reach a
 * contact who's been silent, and an approved template is the only option.
 */
async function deliverReply(
  contact: WhatsAppContact,
  reply: string,
  creds: WhatsAppCredentials
): Promise<void> {
  const to = contactLabel(contact);
  // Reach a hidden-phone contact by their BSUID; everyone else by phone.
  const recipient: WhatsAppRecipient = {
    phone: contact.phone,
    userId: contact.userId,
  };
  try {
    console.log(`[wa-debug] deliverReply → sending to ${to} (${reply.length} chars)`);
    await sendTextMessage(recipient, reply, creds);
    console.log(`[wa-debug] deliverReply → SENT to ${to}`);
  } catch (err) {
    if (err instanceof WhatsAppApiError && err.isOutsideServiceWindow) {
      console.error(
        `[whatsapp] reply not delivered to ${to}: the 24-hour service window has closed — only an approved template can reach this contact`
      );
      console.error(
        `[wa-debug] NOT DELIVERED to ${to}: 24h window closed (Meta 131047) — reply is in DB/dashboard but WhatsApp rejected it`
      );
      return;
    }
    console.error(`[whatsapp] reply not delivered to ${to}:`, err);
    const code = err instanceof WhatsAppApiError ? err.code : undefined;
    console.error(
      `[wa-debug] NOT DELIVERED to ${to}: Cloud API error code=${code} — reply is in DB/dashboard but WhatsApp did not accept it:`,
      err
    );
  }
}

function toPrior(messages: SessionMessage[]): PriorMessage[] {
  return messages.map((m) => {
    // An image the agent was allowed to read was described once and the text
    // stored on the message; inject it here so the agent "sees" the image on the
    // arrival turn AND reuses the same description on every later turn — the image
    // itself is never re-sent (issue #52).
    const analysis = m.metadata?.media?.analysis;
    const content = analysis
      ? `${m.content}\n\n[صورة أرسلها العميل — وصفها: ${analysis}]`
      : m.content;
    return {
      senderType: m.senderType,
      content,
      toolCalls: m.metadata?.toolCalls,
    };
  });
}

/**
 * The clinic-level gate, checked after the per-session `isSessionAiEnabled`
 * pause and before running the agent. Returns true (agent must NOT reply) when
 * the clinic has turned its AI off or has spent all its units — the only two
 * ways the agent can be stopped. In both cases the already-persisted user
 * message is surfaced to a human via an escalation.
 */
async function clinicGateBlocks(
  clinicId: string,
  conversationId: string,
  sessionId: string
): Promise<boolean> {
  const status = await getClinicAiStatus(clinicId);
  if (!status.aiEnabled) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "clinic_disabled");
    return true;
  }
  if (!status.sufficient) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "insufficient_units");
    return true;
  }
  return false;
}

/**
 * Meters one reply: a unit off the clinic's meter and its real cost off the USD
 * balance (one transaction — see chargeUsage). Called only from the three points
 * where an AGENT message has just been persisted, which is why a human admin's
 * reply from the inbox never costs a unit.
 *
 * Kept off the reply's critical path: a duplicate charge (webhook redelivery) is
 * expected and swallowed, and any other failure is logged — never allowed to
 * crash delivery of an already-sent reply.
 */
async function chargeReply(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  try {
    const alert = await chargeUsage(args);
    // Sent after the billing transaction commits, and only on the turn that
    // actually crossed the line — chargeUsage claims the alert under the row
    // lock, so this fires once per crossing rather than once per reply.
    if (alert) await notifyUnitAlert(args.clinicId, alert);
  } catch (err) {
    if (isDuplicateChargeError(err)) return;
    console.error("[aiCredit] failed to charge usage", err);
  }
}

/**
 * Web channel: persists the user message, streams the agent (SSE events),
 * then persists the AGENT reply with its tool-call metadata. Yields events for
 * the route to forward to the browser.
 */
export async function* streamWebAgent(
  userId: string,
  userText: string
): AsyncGenerator<AgentStreamEvent> {
  const membership = await prisma.clinicMember.findFirst({
    where: { userId, clinic: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      clinicId: true,
      clinic: { select: { slug: true } },
      user: { select: { fullName: true } },
    },
  });
  if (!membership) throw new Error("No clinic membership for user");

  const conversationId = await getOrCreateWebConversation(userId, membership.clinicId);
  const sessionId = await resolveActiveSession(conversationId, membership.clinicId);
  await persistUserMessage(conversationId, sessionId, membership.clinicId, userText, userId);

  yield* streamWebReply(membership, conversationId, sessionId, userId);
}

/** The web membership shape both web entrypoints resolve. */
interface WebMembership {
  role: Role;
  clinicId: string;
  clinic: { slug: string };
  user: { fullName: string };
}

async function resolveWebMembership(userId: string): Promise<WebMembership> {
  const membership = await prisma.clinicMember.findFirst({
    where: { userId, clinic: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      clinicId: true,
      clinic: { select: { slug: true } },
      user: { select: { fullName: true } },
    },
  });
  if (!membership) throw new Error("No clinic membership for user");
  return membership;
}

/** What `streamWebReply` returns after the stream finishes (null if it never
 *  produced a reply — handoff / gate). Lets the voice entrypoint synthesize the
 *  final text to speech. */
interface WebReplyOutcome {
  agentMessageId: string;
  replyText: string;
  toolCalls: ToolCallRecord[];
}

/**
 * Shared web reply tail: gates, streams the agent, persists + charges the reply.
 * The user message has already been persisted into `sessionId`. Used by both the
 * text and voice web entrypoints. Returns the persisted reply (for TTS) or null.
 */
async function* streamWebReply(
  membership: WebMembership,
  conversationId: string,
  sessionId: string,
  userId: string
): AsyncGenerator<AgentStreamEvent, WebReplyOutcome | null> {
  if (!(await isSessionAiEnabled(sessionId))) {
    yield { type: "handoff" };
    return null;
  }

  if (await clinicGateBlocks(membership.clinicId, conversationId, sessionId)) {
    yield { type: "handoff" };
    return null;
  }

  const prior = await getSessionMessages(sessionId);

  const ctx: AgentContext = {
    actorId: userId,
    role: membership.role,
    clinicId: membership.clinicId,
    clinicSlug: membership.clinic.slug,
    contactPhone: null,
    channel: Channel.WEB,
    conversationId,
    sessionId,
    actorName: membership.user.fullName,
  };

  let finalText = "";
  let toolCalls: ToolCallRecord[] = [];
  let usage: TokenUsage | null = null;

  for await (const ev of runAgentStream(ctx, toPrior(prior))) {
    if (ev.type === "done") {
      finalText = ev.text;
      toolCalls = ev.toolCalls;
      usage = ev.usage;
    }
    yield ev;
  }

  const replyText = finalText || FALLBACK_REPLY;
  const agentMsg = await persistAgentMessage(
    conversationId,
    sessionId,
    membership.clinicId,
    replyText,
    {
      toolCalls,
    }
  );

  // Unconditional: the unit is owed because the agent answered, not because the
  // provider sent token metadata back. `runAgentStream` always ends with a
  // `done` event (a mid-stream throw never reaches this line, so no reply is
  // persisted and nothing is charged) — but on the rare turn that reports no
  // usage we still bill the clinic its one unit and let the USD side compute to
  // zero, rather than handing out a free reply.
  await chargeReply({
    clinicId: membership.clinicId,
    sessionId,
    messageId: agentMsg.id,
    usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, model: DEFAULT_MODEL },
  });

  return { agentMessageId: agentMsg.id, replyText, toolCalls };
}

/**
 * Web channel, voice note (issue #49): stores the recorded audio, transcribes
 * it, persists the user message (transcript + voice metadata), charges
 * transcription as its own ledger line, then streams the agent reply exactly
 * like a text turn. Emits a `transcript` event so the widget can show what was
 * understood. When the clinic has `voiceReplyEnabled`, the final reply is also
 * synthesized (TTS) and an `audio` event is emitted so the widget can play it —
 * mirroring the patient's voice modality.
 */
export async function* streamWebVoiceAgent(
  userId: string,
  audio: { bytes: Buffer; mimeType: string }
): AsyncGenerator<AgentStreamEvent> {
  const membership = await resolveWebMembership(userId);
  const conversationId = await getOrCreateWebConversation(userId, membership.clinicId);
  const sessionId = await resolveActiveSession(conversationId, membership.clinicId);

  let transcript = "";
  let durationSec: number | null = null;
  let sttModel = "";
  let voiceMeta: VoiceMessageMetadata | null = null;
  try {
    const stored = await uploadPatientMedia({
      clinicId: membership.clinicId,
      conversationId,
      bytes: audio.bytes,
      contentType: audio.mimeType,
    });
    const result = await transcribeAudio({ bytes: audio.bytes, mimeType: audio.mimeType });
    transcript = result.text;
    durationSec = result.durationSec;
    sttModel = result.model;
    voiceMeta = {
      storagePath: stored.path,
      mimeType: stored.contentType,
      durationSec,
      transcript,
      model: sttModel,
      status: transcript ? "transcribed" : "failed",
    };
  } catch (err) {
    console.error("[web] voice storage/transcription failed:", err);
  }

  const content = transcript || "[رسالة صوتية]";
  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    membership.clinicId,
    content,
    userId,
    voiceMeta ? { voice: voiceMeta } : null
  );

  if (sttModel) {
    await chargeTranscriptionSafe({
      clinicId: membership.clinicId,
      sessionId,
      messageId: userMsg.id,
      model: sttModel,
      audioSeconds: durationSec,
    });
  }

  yield { type: "transcript", text: content };

  if (!transcript) {
    yield { type: "error", message: VOICE_FAILED_NOTICE };
    return;
  }

  const outcome = yield* streamWebReply(membership, conversationId, sessionId, userId);

  // Voice-out: the patient spoke, so speak back — but only if the clinic opted in.
  if (!outcome) return;
  const status = await getClinicAiStatus(membership.clinicId);
  if (!status.voiceReplyEnabled) return;

  const tts = await synthesizeSpeech(outcome.replyText);
  if (!tts) return;

  try {
    const stored = await uploadPatientMedia({
      clinicId: membership.clinicId,
      conversationId,
      bytes: tts.bytes,
      contentType: tts.mimeType,
    });
    // Attach the spoken audio to the reply message (preserving its tool calls)
    // so /api/agent/media/<id> can stream it, live and after reload.
    const replyVoice: VoiceMessageMetadata = {
      storagePath: stored.path,
      mimeType: stored.contentType,
      durationSec: tts.durationSec,
      transcript: "",
      model: tts.model,
      status: "spoken",
    };
    await prisma.message.update({
      where: { id: outcome.agentMessageId },
      data: {
        metadata: {
          toolCalls: outcome.toolCalls,
          voice: replyVoice,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await chargeTtsSafe({
      clinicId: membership.clinicId,
      sessionId,
      messageId: outcome.agentMessageId,
      model: tts.model,
      characters: tts.characters,
      audioSeconds: tts.durationSec,
    });
    yield { type: "audio", messageId: outcome.agentMessageId };
  } catch (err) {
    console.error("[web] failed to attach TTS reply audio:", err);
  }
}

/**
 * WhatsApp channel, unknown/unsupported type: records that something arrived so
 * the admin sees the gap in the thread, escalates it to a human, and sends the
 * soft ack. No bytes to store for an unknown type — just the placeholder.
 */
export async function handleUnsupportedWhatsAppMessage(
  clinicId: string,
  conversationId: string,
  contact: WhatsAppContact,
  media: UnsupportedMediaType,
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) return;
  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);

  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    media.placeholder,
    profile?.id ?? null
  );

  await escalateMessage(clinicId, conversationId, sessionId, userMsg.id, "media_needs_review");
}

/** A conversation's clinic-scoped fields the handlers need. */
interface ConvInfo {
  whatsappName: string | null;
  clinicId: string;
  clinic: { slug: string };
}

/** Loads the conversation row both WhatsApp handlers open with. */
async function loadConversation(conversationId: string): Promise<ConvInfo | null> {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      whatsappName: true,
      clinicId: true,
      clinic: { select: { slug: true } },
    },
  });
}

/**
 * Matches (or eagerly provisions) the Profile behind a WhatsApp contact and
 * links it to the conversation. Shared by the text and voice handlers.
 *
 * Profiles are keyed by phone; a hidden-phone (username) contact can't be
 * matched that way, so it runs info-only until it registers in-chat. Eager
 * onboarding provisions a brand-new visible number as a PATIENT the moment it
 * writes in (when WhatsApp gave a usable name), so the PATIENT tools are bound
 * on that very message. Idempotent + best-effort — never blocks the reply.
 */
async function resolveProfileAndLink(
  clinicId: string,
  conversationId: string,
  conv: ConvInfo,
  contact: WhatsAppContact
): Promise<{ id: string; fullName: string | null } | null> {
  const { phone, userId } = contact;
  let profile = phone
    ? await prisma.profile.findUnique({
        where: { phone },
        select: { id: true, fullName: true },
      })
    : null;

  const name = conv.whatsappName?.trim() ?? "";
  const usableName = name && name !== phone && name !== userId ? name : "";
  if (!profile && usableName && phone) {
    try {
      const { profileId } = await getOrCreatePatientByPhone({ clinicId, phone, name: usableName });
      profile = { id: profileId, fullName: usableName };
    } catch (err) {
      console.error("[whatsapp] eager patient provisioning failed:", err);
    }
  }

  if (profile) {
    await prisma.conversation
      .update({ where: { id: conversationId }, data: { userId: profile.id } })
      .catch(() => {}); // ignore unique clashes (already linked elsewhere)
  }
  return profile;
}

/** Meters a transcription charge off the reply's critical path (dup-safe). */
async function chargeTranscriptionSafe(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  model: string;
  audioSeconds: number | null;
}): Promise<void> {
  try {
    await chargeTranscription(args);
  } catch (err) {
    if (isDuplicateChargeError(err)) return;
    console.error("[aiCredit] failed to charge transcription", err);
  }
}

/** Meters a TTS charge off the reply's critical path (dup-safe). */
async function chargeTtsSafe(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  model: string;
  characters: number;
  audioSeconds: number | null;
}): Promise<void> {
  try {
    await chargeTts(args);
  } catch (err) {
    if (isDuplicateChargeError(err)) return;
    console.error("[aiCredit] failed to charge tts", err);
  }
}

/** Meters the one-time image-extraction (vision) charge, dup-safe. */
async function chargeExtractionSafe(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  try {
    await chargeExtraction(args);
  } catch (err) {
    if (isDuplicateChargeError(err)) return;
    console.error("[aiCredit] failed to charge extraction", err);
  }
}

/**
 * Sends a synthesized voice reply: uploads the OGG/Opus bytes to the clinic's
 * WhatsApp number, then sends an audio message. Returns true on success; on any
 * failure (closed 24h window, upload error) it returns false so the caller can
 * fall back to text. Never throws — an already-persisted reply must not crash.
 */
async function deliverVoiceReply(
  contact: WhatsAppContact,
  bytes: Buffer,
  mimeType: string,
  creds: WhatsAppCredentials
): Promise<boolean> {
  const to = contactLabel(contact);
  const recipient: WhatsAppRecipient = { phone: contact.phone, userId: contact.userId };
  try {
    const mediaId = await uploadMedia(creds, bytes, mimeType);
    await sendAudioMessage(recipient, mediaId, creds);
    console.log(`[wa-debug] deliverVoiceReply → SENT audio to ${to}`);
    return true;
  } catch (err) {
    const code = err instanceof WhatsAppApiError ? err.code : undefined;
    console.error(
      `[wa-debug] voice reply NOT delivered to ${to} (code=${code}) — will fall back to text:`,
      err
    );
    return false;
  }
}

/**
 * Shared reply path for both text and voice inbound: gates, runs the agent,
 * persists + delivers the reply, and meters cost. The inbound user message has
 * already been persisted into `sessionId` (so it's in the loaded history).
 *
 * When `wasVoice` and the clinic has `voiceReplyEnabled`, the reply is spoken
 * (TTS) — mirroring the patient's modality. Text-in always yields text-out.
 */
async function respondAndReply(args: {
  conversationId: string;
  clinicId: string;
  clinicSlug: string;
  sessionId: string;
  whatsappName: string | null;
  profile: { id: string; fullName: string | null } | null;
  contact: WhatsAppContact;
  /** Meta message id of the inbound — for read receipt + typing indicator. */
  metaMessageId: string;
  creds: WhatsAppCredentials;
  wasVoice: boolean;
}): Promise<void> {
  const {
    conversationId,
    clinicId,
    clinicSlug,
    sessionId,
    whatsappName,
    profile,
    contact,
    metaMessageId,
    creds,
    wasVoice,
  } = args;

  if (!(await isSessionAiEnabled(sessionId))) {
    console.log(`[wa-debug] no reply: AI disabled for session ${sessionId} (human handoff)`);
    return;
  }

  const status = await getClinicAiStatus(clinicId);
  if (!status.aiEnabled) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "clinic_disabled");
    console.log(`[wa-debug] no reply: clinic AI disabled clinicId=${clinicId}`);
    return;
  }
  if (!status.sufficient) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "insufficient_units");
    console.log(`[wa-debug] no reply: clinic out of AI units clinicId=${clinicId}`);
    return;
  }

  const prior = await getSessionMessages(sessionId);

  // The contact's role is per-clinic; resolve it in this conversation's clinic.
  let role: Role | null = null;
  if (profile) {
    const m = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId: profile.id, clinicId } },
      select: { role: true },
    });
    role = m?.role ?? null;
  }

  const ctx: AgentContext = {
    actorId: profile?.id ?? null,
    role,
    clinicId,
    clinicSlug,
    contactPhone: contact.phone ?? "",
    channel: Channel.WHATSAPP,
    conversationId,
    sessionId,
    actorName: profile?.fullName ?? whatsappName ?? "",
  };

  // Buffered agent (no token streaming here), so show "typing…". Meta clears it
  // when the reply lands.
  showTypingIndicator(metaMessageId, creds);

  const { text, toolCalls, usage } = await runAgentToText(ctx, toPrior(prior));
  const reply = text || FALLBACK_REPLY;

  // Voice reply only when the clinic opted in AND the patient spoke.
  let voiceMeta: VoiceMessageMetadata | null = null;
  let ttsCharacters = 0;
  let ttsModel = "";
  if (wasVoice && status.voiceReplyEnabled) {
    const tts = await synthesizeSpeech(reply);
    if (tts) {
      ttsCharacters = tts.characters;
      ttsModel = tts.model;
      // Store the spoken reply so the dashboard can play it back too.
      try {
        const stored = await uploadPatientMedia({
          clinicId,
          conversationId,
          bytes: tts.bytes,
          contentType: tts.mimeType,
        });
        voiceMeta = {
          storagePath: stored.path,
          mimeType: stored.contentType,
          durationSec: tts.durationSec,
          transcript: "",
          model: tts.model,
          status: "spoken",
        };
      } catch (err) {
        console.error("[whatsapp] failed to store TTS reply audio:", err);
      }
      // Deliver as voice; fall back to text if WhatsApp rejects the audio.
      const sent = await deliverVoiceReply(contact, tts.bytes, tts.mimeType, creds);
      const agentMsg = await persistAgentMessage(conversationId, sessionId, clinicId, reply, {
        toolCalls,
        ...(voiceMeta ? { voice: voiceMeta } : {}),
      });
      if (!sent) await deliverReply(contact, reply, creds);
      await chargeReply({ clinicId, sessionId, messageId: agentMsg.id, usage });
      if (ttsModel) {
        await chargeTtsSafe({
          clinicId,
          sessionId,
          messageId: agentMsg.id,
          model: ttsModel,
          characters: ttsCharacters,
          audioSeconds: tts.durationSec,
        });
      }
      return;
    }
    // TTS unavailable — fall through to a plain text reply.
    console.log("[wa-debug] voice reply requested but TTS unavailable — sending text");
  }

  const agentMsg = await persistAgentMessage(conversationId, sessionId, clinicId, reply, {
    toolCalls,
  });
  await deliverReply(contact, reply, creds);
  await chargeReply({ clinicId, sessionId, messageId: agentMsg.id, usage });
}

/**
 * WhatsApp channel: resolves the session, persists the user message, runs the
 * agent (non-streaming), persists + sends the reply. Phone is matched to a
 * profile — unknown numbers get an info-only agent (no actions).
 */
export async function handleWhatsAppMessage(
  conversationId: string,
  contact: WhatsAppContact,
  userText: string,
  /** Meta message id — enables read receipts and the typing indicator. */
  messageId: string,
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  // The conversation was just created/updated by the webhook, so this is defensive.
  if (!conv) {
    console.warn(
      `[wa-debug] DROP: conversation ${conversationId} not found in handleWhatsAppMessage — user message NOT stored`
    );
    return;
  }
  console.log(`[wa-debug] handleWhatsAppMessage start convId=${conversationId}`);
  const clinicId = conv.clinicId;

  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);

  const sessionId = await resolveActiveSession(conversationId, clinicId);
  await persistUserMessage(conversationId, sessionId, clinicId, userText, profile?.id ?? null);
  console.log(
    `[wa-debug] user message STORED convId=${conversationId} sessionId=${sessionId} profileId=${profile?.id ?? "none"}`
  );

  await respondAndReply({
    conversationId,
    clinicId,
    clinicSlug: conv.clinic.slug,
    sessionId,
    whatsappName: conv.whatsappName,
    profile,
    contact,
    metaMessageId: messageId,
    creds,
    wasVoice: false,
  });
}

/** Arabic notice when a voice note can't be transcribed. */
const VOICE_FAILED_NOTICE =
  "عذراً، لم نتمكن من فهم رسالتك الصوتية. هل يمكنك إعادة إرسالها أو كتابة طلبك نصاً؟ 🙏";

/**
 * WhatsApp channel, voice note (issue #49): downloads the audio, stores it in
 * the private bucket, transcribes it, then feeds the transcript to the agent as
 * an ordinary text turn (reusing `respondAndReply`). Transcription is charged as
 * its own ledger line, separate from the reply.
 *
 * On transcription failure the audio is still stored, the message is recorded
 * (so the admin sees it), and the contact gets a graceful notice + an
 * escalation — the agent is not run on an empty transcript.
 */
export async function handleWhatsAppVoiceMessage(
  conversationId: string,
  contact: WhatsAppContact,
  voice: { mediaId: string; mimeType: string },
  messageId: string,
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) {
    console.warn(
      `[wa-debug] DROP: conversation ${conversationId} not found in handleWhatsAppVoiceMessage`
    );
    return;
  }
  console.log(`[wa-debug] handleWhatsAppVoiceMessage start convId=${conversationId}`);
  const clinicId = conv.clinicId;

  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);

  // Download → store → transcribe. Any step can fail; we degrade gracefully.
  let transcript = "";
  let durationSec: number | null = null;
  let sttModel = "";
  let voiceMeta: VoiceMessageMetadata | null = null;
  try {
    const media = await downloadMedia(voice.mediaId, creds.accessToken);
    const stored = await uploadPatientMedia({
      clinicId,
      conversationId,
      bytes: media.bytes,
      contentType: media.mimeType,
    });
    const result = await transcribeAudio({ bytes: media.bytes, mimeType: media.mimeType });
    transcript = result.text;
    durationSec = result.durationSec;
    sttModel = result.model;
    voiceMeta = {
      storagePath: stored.path,
      mimeType: stored.contentType,
      durationSec,
      transcript,
      model: sttModel,
      status: transcript ? "transcribed" : "failed",
    };
  } catch (err) {
    console.error("[whatsapp] voice download/transcription failed:", err);
  }

  // Record the inbound: transcript as content when we have it, else a placeholder.
  const content = transcript || "[رسالة صوتية]";
  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    content,
    profile?.id ?? null,
    voiceMeta ? { voice: voiceMeta } : null
  );

  // Charge transcription (its own ledger line) whenever a model actually ran.
  if (sttModel) {
    await chargeTranscriptionSafe({
      clinicId,
      sessionId,
      messageId: userMsg.id,
      model: sttModel,
      audioSeconds: durationSec,
    });
  }

  if (!transcript) {
    // Couldn't understand the audio — notify + escalate, don't run the agent.
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "voice_transcription_failed");
    await persistAgentMessage(conversationId, sessionId, clinicId, VOICE_FAILED_NOTICE, null);
    await deliverReply(contact, VOICE_FAILED_NOTICE, creds);
    return;
  }

  await respondAndReply({
    conversationId,
    clinicId,
    clinicSlug: conv.clinic.slug,
    sessionId,
    whatsappName: conv.whatsappName,
    profile,
    contact,
    metaMessageId: messageId,
    creds,
    wasVoice: true,
  });
}

/**
 * WhatsApp channel, image (issue #52): downloads and ARCHIVES the photo (always,
 * so the clinic keeps a record independent of WhatsApp), then — only if the clinic
 * enabled image analysis and the AI gates are open — reads it ONCE with the vision
 * model, stores that description on the message, and answers from it.
 *
 * When analysis is off (or unavailable), the image is still archived and a human
 * is escalated to review it; the agent only answers a caption if one was sent.
 */
export async function handleWhatsAppImageMessage(
  conversationId: string,
  contact: WhatsAppContact,
  image: { mediaId: string; mimeType: string; caption?: string },
  messageId: string,
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) {
    console.warn(`[wa-debug] DROP: conversation ${conversationId} not found in image handler`);
    return;
  }
  const clinicId = conv.clinicId;
  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);

  // Download + archive (ALWAYS — regardless of the analysis toggle).
  let bytes: Buffer | null = null;
  let stored: { path: string; contentType: string; size: number } | null = null;
  try {
    const media = await downloadMedia(image.mediaId, creds.accessToken);
    bytes = media.bytes;
    stored = await uploadPatientMedia({
      clinicId,
      conversationId,
      bytes: media.bytes,
      contentType: media.mimeType,
    });
  } catch (err) {
    console.error("[whatsapp] image download/store failed:", err);
  }

  // Only read (and pay for) the image when it will actually feed a reply: the
  // clinic opted in, the AI is on for this session + clinic, and units remain.
  const status = await getClinicAiStatus(clinicId);
  const gatesOpen = (await isSessionAiEnabled(sessionId)) && status.aiEnabled && status.sufficient;
  const wantAnalysis = gatesOpen && status.imageAnalysisEnabled && !!bytes;

  let analysis = "";
  let extractionUsage: TokenUsage | null = null;
  if (wantAnalysis && bytes) {
    try {
      const result = await describeImage({ bytes, mimeType: image.mimeType });
      analysis = result.description;
      extractionUsage = result.usage;
    } catch (err) {
      console.error("[whatsapp] image description failed:", err);
    }
  }

  const mediaMeta: MediaAttachmentMetadata | null = stored
    ? {
        kind: "image",
        storagePath: stored.path,
        mimeType: stored.contentType,
        sizeBytes: stored.size,
        ...(image.caption ? { caption: image.caption } : {}),
        ...(analysis ? { analysis, analysisModel: extractionUsage?.model } : {}),
      }
    : null;

  // Content = the patient's caption (their words) or a "[صورة]" placeholder.
  const content = image.caption?.trim() || mediaPlaceholder("image");
  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    content,
    profile?.id ?? null,
    mediaMeta ? { media: mediaMeta } : null
  );

  // The one-time vision call is its own USD-only ledger line.
  if (extractionUsage) {
    await chargeExtractionSafe({
      clinicId,
      sessionId,
      messageId: userMsg.id,
      usage: extractionUsage,
    });
  }

  // Analysis succeeded → answer from the (now stored) description. respondAndReply
  // rebuilds context, and toPrior injects the description as text for this turn.
  if (analysis) {
    await respondAndReply({
      conversationId,
      clinicId,
      clinicSlug: conv.clinic.slug,
      sessionId,
      whatsappName: conv.whatsappName,
      profile,
      contact,
      metaMessageId: messageId,
      creds,
      wasVoice: false,
    });
    return;
  }

  // No analysis (toggle off, gated, or vision failed): the agent can't see the
  // image, so escalate for a human to review it (never disables the AI).
  await escalateMessage(
    clinicId,
    conversationId,
    sessionId,
    userMsg.id,
    status.imageAnalysisEnabled ? "image_needs_review" : "image_analysis_disabled"
  );

  // Still answer a caption as ordinary text if one was sent (respondAndReply
  // gates + escalates on its own if the clinic is off/out of units).
  if (image.caption?.trim()) {
    await respondAndReply({
      conversationId,
      clinicId,
      clinicSlug: conv.clinic.slug,
      sessionId,
      whatsappName: conv.whatsappName,
      profile,
      contact,
      metaMessageId: messageId,
      creds,
      wasVoice: false,
    });
    return;
  }

  // Image with no caption → the agent stays silent; the escalation above lets a
  // human take it.
}

/**
 * WhatsApp channel, downloadable media the agent can't read (video, document,
 * sticker): archives the bytes and escalates to a human. The AI never acts on it.
 */
export async function handleWhatsAppMediaMessage(
  conversationId: string,
  contact: WhatsAppContact,
  media: {
    mediaKind: ArchivedMediaKind;
    mediaId: string;
    mimeType: string;
    filename?: string;
    caption?: string;
  },
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) return;
  const clinicId = conv.clinicId;
  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);

  let stored: { path: string; contentType: string; size: number } | null = null;
  try {
    const dl = await downloadMedia(media.mediaId, creds.accessToken);
    stored = await uploadPatientMedia({
      clinicId,
      conversationId,
      bytes: dl.bytes,
      contentType: dl.mimeType,
    });
  } catch (err) {
    console.error(`[whatsapp] ${media.mediaKind} download/store failed:`, err);
  }

  const mediaMeta: MediaAttachmentMetadata | null = stored
    ? {
        kind: media.mediaKind,
        storagePath: stored.path,
        mimeType: stored.contentType,
        sizeBytes: stored.size,
        ...(media.filename ? { filename: media.filename } : {}),
        ...(media.caption ? { caption: media.caption } : {}),
      }
    : null;

  const placeholder = mediaPlaceholder(media.mediaKind);
  const content = media.caption?.trim()
    ? `${placeholder} ${media.caption.trim()}`
    : media.filename?.trim()
      ? `${placeholder} ${media.filename.trim()}`
      : placeholder;
  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    content,
    profile?.id ?? null,
    mediaMeta ? { media: mediaMeta } : null
  );

  await escalateMessage(clinicId, conversationId, sessionId, userMsg.id, "media_needs_review");
}

/**
 * WhatsApp channel, structured message (location, contact card, order): there is
 * no file to download, so the raw payload is kept for the record and a readable
 * summary is the message content. Archive-only — a human is escalated.
 */
export async function handleWhatsAppStructuredMessage(
  conversationId: string,
  contact: WhatsAppContact,
  structured: { structuredKind: StructuredKind; data: unknown; summary: string },
  creds: WhatsAppCredentials
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) return;
  const clinicId = conv.clinicId;
  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);

  const structuredMeta: StructuredMessageMetadata = {
    kind: structured.structuredKind,
    data: structured.data,
  };
  const userMsg = await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    structured.summary,
    profile?.id ?? null,
    { structured: structuredMeta }
  );

  await escalateMessage(clinicId, conversationId, sessionId, userMsg.id, "media_needs_review");
}

/**
 * WhatsApp channel, emoji reaction: archived so the thread stays complete, with
 * no reply and no escalation — a reaction carries no request to answer.
 */
export async function handleWhatsAppReaction(
  conversationId: string,
  contact: WhatsAppContact,
  emoji: string
): Promise<void> {
  const conv = await loadConversation(conversationId);
  if (!conv) return;
  const clinicId = conv.clinicId;
  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, contact);
  const sessionId = await resolveActiveSession(conversationId, clinicId);
  await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    `[تفاعل] ${emoji}`,
    profile?.id ?? null
  );
}

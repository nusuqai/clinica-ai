import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, SenderType, MessageDelivery, type Role, type Prisma } from "@prisma/client";
import { downloadMedia } from "@/lib/meta/whatsapp";
import type { WhatsAppCredentials } from "@/lib/meta/whatsapp";
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
  AgentMessageMetadata,
} from "@/agent/types";
import { showTypingIndicator } from "./whatsappTyping";
import { runAgentToText, DEFAULT_MODEL, type AgentContext, type PriorMessage } from "@/agent";
import type { ToolCallRecord } from "@/agent/types";
import {
  resolveActiveSession,
  getSessionMessages,
  persistUserMessage,
  persistAgentMessage,
  setMessageWhatsappId,
  isSessionAiEnabled,
  getUnprocessedUserMessages,
  findUndeliveredAgentReply,
  markAgentDelivery,
  type SessionMessage,
} from "./agentSession";
import {
  armDebounce,
  markMessagesProcessed,
  finalizeIdle,
  finalizeIdleOrRequeue,
  scheduleRetryOrFail,
  type ClaimedConversation,
} from "./debounce";
import { getChannelAdapter, type ChannelAdapter, type ChannelRecipient } from "./channels";
import { whatsappAdapter } from "./channels/whatsapp";
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
export async function chargeReply(args: {
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

/** A conversation's clinic-scoped fields the handlers + processor need. */
interface ConvInfo {
  whatsappName: string | null;
  whatsappPhone: string | null;
  whatsappUserId: string | null;
  channel: Channel;
  clinicId: string;
  clinic: { slug: string; debounceSeconds: number };
}

/** Loads the conversation row the WhatsApp handlers + debounce processor open with. */
async function loadConversation(conversationId: string): Promise<ConvInfo | null> {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      whatsappName: true,
      whatsappPhone: true,
      whatsappUserId: true,
      channel: true,
      clinicId: true,
      clinic: { select: { slug: true, debounceSeconds: true } },
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
export async function chargeTranscriptionSafe(args: {
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
export async function chargeTtsSafe(args: {
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

/** Outcome of a debounced reply attempt — see {@link deliverPushReply}. */
/** What the common brain produces. On "skipped" a gate was closed; on "reply"
 *  the agent answered and the caller persists/delivers (web returns it in the
 *  HTTP response; push channels hand it to an adapter). */
export type AgentReply =
  | { kind: "skipped"; reason: "handoff" | "clinic_disabled" | "insufficient_units" }
  | {
      kind: "reply";
      text: string;
      toolCalls: ToolCallRecord[];
      usage: TokenUsage | null;
      /** Clinic opted into spoken replies — the deliver step may synthesize TTS. */
      voiceReplyEnabled: boolean;
    };

/**
 * THE COMMON AGENT BRAIN — channel-agnostic. Applies the gates (per-session AI
 * pause, clinic AI switch, unit balance), loads the session, and runs the agent.
 * Returns the reply text (does NOT persist, charge, or send — the caller owns
 * delivery, which is what differs per channel). Throws only if the agent itself
 * fails, so a caller can distinguish "gated" (skipped) from "error" (retry).
 *
 * The caller builds the AgentContext (role/actor differ by channel), so this is
 * identical for WhatsApp, web, Instagram, Messenger, …
 */
export async function generateAgentReply(ctx: AgentContext): Promise<AgentReply> {
  const { clinicId, conversationId, sessionId } = ctx;

  if (!(await isSessionAiEnabled(sessionId))) {
    return { kind: "skipped", reason: "handoff" };
  }
  const status = await getClinicAiStatus(clinicId);
  if (!status.aiEnabled) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "clinic_disabled");
    return { kind: "skipped", reason: "clinic_disabled" };
  }
  if (!status.sufficient) {
    await ensureOpenEscalation(clinicId, conversationId, sessionId, "insufficient_units");
    return { kind: "skipped", reason: "insufficient_units" };
  }

  const prior = await getSessionMessages(sessionId);
  // Throws on agent failure → caller decides (web surfaces an error; push retries).
  const { text, toolCalls, usage } = await runAgentToText(ctx, toPrior(prior));
  return {
    kind: "reply",
    text: text || FALLBACK_REPLY,
    toolCalls,
    usage,
    voiceReplyEnabled: status.voiceReplyEnabled,
  };
}

/** Builds the per-clinic role into an AgentContext for a push (WhatsApp/IG/…)
 *  conversation. Web builds its own context (member/guest). */
async function pushAgentContext(args: {
  conversationId: string;
  clinicId: string;
  clinicSlug: string;
  sessionId: string;
  channel: Channel;
  profile: { id: string; fullName: string | null } | null;
  whatsappName: string | null;
  recipient: ChannelRecipient;
}): Promise<AgentContext> {
  let role: Role | null = null;
  if (args.profile) {
    const m = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId: args.profile.id, clinicId: args.clinicId } },
      select: { role: true },
    });
    role = m?.role ?? null;
  }
  return {
    actorId: args.profile?.id ?? null,
    role,
    clinicId: args.clinicId,
    clinicSlug: args.clinicSlug,
    contactPhone: args.recipient.phone ?? "",
    channel: args.channel,
    conversationId: args.conversationId,
    sessionId: args.sessionId,
    actorName: args.profile?.fullName ?? args.whatsappName ?? "",
  };
}

type ReplyOutcome =
  /** A gate was closed (AI off / human handoff / no units) — no reply, no charge. */
  | { kind: "skipped" }
  /** The agent ran, the reply was persisted + charged; `delivered` is whether the
   *  channel accepted it (false → it's QUEUED/FAILED for a send retry). */
  | { kind: "replied"; delivered: boolean };

/**
 * Push-channel reply: runs the common brain, persists the reply as a checkpoint,
 * meters cost, then delivers it through the channel ADAPTER (so this is identical
 * for WhatsApp, Instagram, Messenger, …).
 *
 * Checkpoint order is deliberate: persist QUEUED + mark the consolidated inbound
 * processed (+ charge) BEFORE sending, so a send failure only re-delivers this
 * saved reply next tick — the agent never re-runs and AI is never re-charged. A
 * thrown error means the agent failed (nothing persisted) → caller retries.
 *
 * When `wasVoice`, the clinic opted in, AND the adapter supports voice, the reply
 * is spoken (TTS); otherwise text. A voice send that fails falls back to text.
 */
async function deliverPushReply<T>(args: {
  ctx: AgentContext;
  adapter: ChannelAdapter<T>;
  transport: T;
  recipient: ChannelRecipient;
  wasVoice: boolean;
  /** The inbound message ids consolidated into this reply — marked processed once
   *  the reply is persisted (race-safe: mid-run arrivals aren't in here). */
  processedIds: string[];
}): Promise<ReplyOutcome> {
  const { ctx, adapter, transport, recipient, wasVoice, processedIds } = args;
  const { clinicId, conversationId, sessionId } = ctx;

  const gen = await generateAgentReply(ctx);
  if (gen.kind === "skipped") return { kind: "skipped" };
  const { text: reply, toolCalls, voiceReplyEnabled } = gen;
  // On the rare turn with no usage metadata, still bill the one unit (USD side
  // computes to zero) rather than hand out a free reply — same as the web path.
  const usage = gen.usage ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: DEFAULT_MODEL,
  };

  // Spoken reply only when the patient spoke, the clinic opted in, and the channel
  // can carry audio.
  if (wasVoice && voiceReplyEnabled && adapter.capabilities.voiceReply && adapter.sendVoice) {
    const tts = await synthesizeSpeech(reply);
    if (tts) {
      let voiceMeta: VoiceMessageMetadata | null = null;
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
        console.error("[agent] failed to store TTS reply audio:", err);
      }
      const agentMsg = await persistAgentMessage(
        conversationId,
        sessionId,
        clinicId,
        reply,
        { toolCalls, ...(voiceMeta ? { voice: voiceMeta } : {}) },
        MessageDelivery.QUEUED
      );
      await markMessagesProcessed(processedIds);
      await chargeReply({ clinicId, sessionId, messageId: agentMsg.id, usage });
      if (tts.model) {
        await chargeTtsSafe({
          clinicId,
          sessionId,
          messageId: agentMsg.id,
          model: tts.model,
          characters: tts.characters,
          audioSeconds: tts.durationSec,
        });
      }
      const voiceOut = await adapter.sendVoice(transport, recipient, {
        bytes: tts.bytes,
        mimeType: tts.mimeType,
      });
      const textOut = voiceOut.delivered
        ? null
        : await adapter.sendText(transport, recipient, reply);
      const delivered = voiceOut.delivered || (textOut?.delivered ?? false);
      await markAgentDelivery(
        agentMsg.id,
        delivered ? MessageDelivery.SENT : MessageDelivery.FAILED,
        {
          whatsappMessageId: voiceOut.providerMessageId ?? textOut?.providerMessageId ?? null,
          incrementAttempts: true,
        }
      );
      return { kind: "replied", delivered };
    }
    console.log("[agent] voice reply requested but TTS unavailable — sending text");
  }

  const agentMsg = await persistAgentMessage(
    conversationId,
    sessionId,
    clinicId,
    reply,
    { toolCalls },
    MessageDelivery.QUEUED
  );
  await markMessagesProcessed(processedIds);
  await chargeReply({ clinicId, sessionId, messageId: agentMsg.id, usage });
  const out = await adapter.sendText(transport, recipient, reply);
  await markAgentDelivery(
    agentMsg.id,
    out.delivered ? MessageDelivery.SENT : MessageDelivery.FAILED,
    {
      whatsappMessageId: out.providerMessageId,
      incrementAttempts: true,
    }
  );
  return { kind: "replied", delivered: out.delivered };
}

/**
 * Answers one debounced conversation — the unit of work the pg_cron processor
 * fans out over. CHANNEL-AGNOSTIC: it resolves the adapter from the conversation's
 * `channel`, so WhatsApp / Instagram / Messenger / … all share this path.
 *
 *  1. RESUME — if a prior reply was generated but never delivered, re-send that
 *     exact reply (no agent re-run, no re-charge).
 *  2. Otherwise consolidate the unanswered inbound burst into ONE agent reply.
 *
 * Every exit transitions the ConversationProcessing row: IDLE on success/skip,
 * PENDING (with backoff) on a retryable failure, FAILED + escalation once
 * attempts are exhausted. Never throws — a bad conversation must not abort the
 * rest of the batch.
 */
export async function processDebouncedConversation(row: ClaimedConversation): Promise<void> {
  const { conversationId, clinicId, retryCount } = row;

  const conv = await loadConversation(conversationId);
  if (!conv) {
    await finalizeIdle(conversationId);
    return;
  }

  // Pick the send adapter for this conversation's channel. WEB has none (it is
  // synchronous — it never arms the debounce), so a WEB row here is a no-op.
  const adapter = getChannelAdapter(conv.channel);
  if (!adapter) {
    console.warn(`[debounce] no send adapter for channel ${conv.channel} — idling`);
    await finalizeIdle(conversationId);
    return;
  }
  const transport = await adapter.getTransport(clinicId);
  if (!transport) {
    console.warn(`[debounce] clinic ${clinicId} has no ${conv.channel} transport — idling`);
    await finalizeIdle(conversationId);
    return;
  }
  const recipient = adapter.recipientOf(conv);

  // 1) RESUME an undelivered reply — re-send only, never re-run/charge the agent.
  const pending = await findUndeliveredAgentReply(conversationId);
  if (pending) {
    const out = await adapter.sendText(transport, recipient, pending.content);
    if (out.delivered) {
      await markAgentDelivery(pending.id, MessageDelivery.SENT, {
        whatsappMessageId: out.providerMessageId,
        incrementAttempts: true,
      });
      // A newer message may have arrived before this claim — requeue if so.
      await finalizeIdleOrRequeue(conversationId);
    } else {
      await markAgentDelivery(pending.id, MessageDelivery.FAILED, { incrementAttempts: true });
      const result = await scheduleRetryOrFail(conversationId, retryCount, "send_failed");
      if (result === "failed" && pending.sessionId) {
        await ensureOpenEscalation(
          clinicId,
          conversationId,
          pending.sessionId,
          "reply_delivery_failed"
        );
      }
    }
    return;
  }

  // 2) Snapshot the burst to consolidate. Messages that arrive after this read
  //    stay unprocessed and get their own reply on a later tick.
  const unprocessed = await getUnprocessedUserMessages(conversationId);
  if (unprocessed.length === 0) {
    await finalizeIdle(conversationId);
    return;
  }
  const sessionId = unprocessed[unprocessed.length - 1].sessionId;
  const processedIds = unprocessed.map((m) => m.id);
  if (!sessionId) {
    // Degenerate (a message with no session) — mark processed so we don't loop.
    await markMessagesProcessed(processedIds);
    await finalizeIdle(conversationId);
    return;
  }

  const profile = await resolveProfileAndLink(clinicId, conversationId, conv, {
    phone: recipient.phone ?? null,
    userId: recipient.userId ?? null,
  });
  const ctx = await pushAgentContext({
    conversationId,
    clinicId,
    clinicSlug: conv.clinic.slug,
    sessionId,
    channel: conv.channel,
    profile,
    whatsappName: conv.whatsappName,
    recipient,
  });

  try {
    const outcome = await deliverPushReply({
      ctx,
      adapter,
      transport,
      recipient,
      wasVoice: row.lastInboundWasVoice,
      processedIds,
    });

    if (outcome.kind === "skipped") {
      // Gate closed (AI off / human handoff / no units): the gate already
      // escalated; mark the burst processed so the debounce doesn't re-fire.
      await markMessagesProcessed(processedIds);
      await finalizeIdle(conversationId);
      return;
    }

    if (outcome.delivered) {
      await finalizeIdle(conversationId);
    } else {
      // Reply persisted + charged, but the send failed → retry delivery only.
      const result = await scheduleRetryOrFail(conversationId, retryCount, "send_failed");
      if (result === "failed") {
        await ensureOpenEscalation(clinicId, conversationId, sessionId, "reply_delivery_failed");
      }
    }
  } catch (err) {
    // Agent failed before anything was persisted/charged → safe to retry wholesale.
    console.error(`[debounce] agent failed for conv ${conversationId}:`, err);
    const result = await scheduleRetryOrFail(conversationId, retryCount, String(err));
    if (result === "failed") {
      await ensureOpenEscalation(clinicId, conversationId, sessionId, "agent_failed");
    }
  }
}

/**
 * WhatsApp channel: resolves the session, persists the user message, then ARMS
 * the debounce (the pg_cron processor answers the burst once the window elapses
 * — see processDebouncedConversation). Phone is matched to a profile at ingest.
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
  await persistUserMessage(
    conversationId,
    sessionId,
    clinicId,
    userText,
    profile?.id ?? null,
    null,
    messageId
  );
  console.log(
    `[wa-debug] user message STORED convId=${conversationId} sessionId=${sessionId} profileId=${profile?.id ?? "none"}`
  );

  // Defer the reply: arm the debounce so a rapid burst collapses into one answer.
  await armDebounce(conversationId, clinicId, false, conv.clinic.debounceSeconds);
}

/** Arabic notice when a voice note can't be transcribed. */
export const VOICE_FAILED_NOTICE =
  "عذراً، لم نتمكن من فهم رسالتك الصوتية. هل يمكنك إعادة إرسالها أو كتابة طلبك نصاً؟ 🙏";

/**
 * WhatsApp channel, voice note (issue #49): downloads the audio, stores it in
 * the private bucket, transcribes it, persists the transcript as a user turn,
 * then arms the debounce (the processor answers the burst — speaking the reply
 * when the clinic has voiceReplyEnabled). Transcription is charged as its own
 * ledger line, separate from the reply.
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
    voiceMeta ? { voice: voiceMeta } : null,
    messageId
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
    await whatsappAdapter.sendText(
      creds,
      { phone: contact.phone, userId: contact.userId },
      VOICE_FAILED_NOTICE
    );
    return;
  }

  // Defer the reply: arm the debounce (wasVoice → the processor may answer with
  // speech when the clinic has voiceReplyEnabled).
  await armDebounce(conversationId, clinicId, true, conv.clinic.debounceSeconds);
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

  // Two image controllers (per-clinic, ClinicAiCredit):
  //  - imageAnalysisEnabled = whether to OCR/read the image at all.
  //  - imageAutoReplyEnabled = when reading, let the agent answer (extract-and-
  //    respond) vs. just store the extraction for the call-centre team and
  //    escalate (extract-only).
  const status = await getClinicAiStatus(clinicId);
  const sessionAi = await isSessionAiEnabled(sessionId);
  const replyGatesOpen = sessionAi && status.aiEnabled && status.sufficient;
  // Extract-and-respond pays for vision only when a reply can actually use it
  // (same gate as before). Extract-only is for humans, so it only needs the clinic
  // feature + master AI switch — it still runs when the session is paused / low on
  // units, which is exactly when a human needs the text.
  const canExtract =
    !!bytes &&
    status.imageAnalysisEnabled &&
    (status.imageAutoReplyEnabled ? replyGatesOpen : status.aiEnabled);

  let extractedText = "";
  let extractionUsage: TokenUsage | null = null;
  if (canExtract && bytes) {
    try {
      const result = await describeImage({ bytes, mimeType: image.mimeType });
      extractedText = result.description;
      extractionUsage = result.usage;
    } catch (err) {
      console.error("[whatsapp] image description failed:", err);
    }
  }

  // Where the extraction is stored decides who sees it: `analysis` is injected
  // into the agent context by toPrior (extract-and-respond); `extraction` is shown
  // only in the admin inbox (extract-only) so the agent never answers the image.
  const respondToImage = status.imageAutoReplyEnabled && !!extractedText;
  const mediaMeta: MediaAttachmentMetadata | null = stored
    ? {
        kind: "image",
        storagePath: stored.path,
        mimeType: stored.contentType,
        sizeBytes: stored.size,
        ...(image.caption ? { caption: image.caption } : {}),
        ...(extractedText
          ? respondToImage
            ? { analysis: extractedText, analysisModel: extractionUsage?.model }
            : { extraction: extractedText, extractionModel: extractionUsage?.model }
          : {}),
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
    mediaMeta ? { media: mediaMeta } : null,
    messageId
  );

  // The one-time vision call is its own USD-only ledger line (either mode).
  if (extractionUsage) {
    await chargeExtractionSafe({
      clinicId,
      sessionId,
      messageId: userMsg.id,
      usage: extractionUsage,
    });
  }

  // EXTRACT-AND-RESPOND: the description is stored as `analysis`; arm the debounce
  // so the agent answers it (processor re-checks gates, injects it via toPrior).
  if (respondToImage) {
    await armDebounce(conversationId, clinicId, false, conv.clinic.debounceSeconds);
    return;
  }

  // Not answering the image itself (OFF, extract-only, vision failed, or gated):
  // store nothing in `analysis`, so escalate for a human to review it.
  await escalateMessage(
    clinicId,
    conversationId,
    sessionId,
    userMsg.id,
    extractedText
      ? "image_extracted_for_review" // extract-only: OCR is on the message for staff
      : status.imageAnalysisEnabled
        ? "image_needs_review"
        : "image_analysis_disabled"
  );

  // A caption is the patient's own text — answer it as an ordinary message (the
  // image itself stays with the human). In extract-only mode the agent still
  // won't see the image, because the extraction is kept out of `analysis`.
  if (image.caption?.trim()) {
    await armDebounce(conversationId, clinicId, false, conv.clinic.debounceSeconds);
    return;
  }

  // Uncaptioned image with no AI reply → mark it processed so the debounce never
  // fires for it alone; the escalation above lets a human take it.
  await markMessagesProcessed([userMsg.id]);
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
  messageId: string,
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
    mediaMeta ? { media: mediaMeta } : null,
    messageId
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
  messageId: string,
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
    { structured: structuredMeta },
    messageId
  );

  await escalateMessage(clinicId, conversationId, sessionId, userMsg.id, "media_needs_review");
}

/**
 * WhatsApp channel, emoji reaction: attaches the emoji to the message it reacts
 * to (matched by wamid) rather than storing a separate bubble. An empty emoji is
 * a removal (clears the chip). If the reacted message isn't one we stored (e.g.
 * it predates wamid tracking), the reaction is dropped silently.
 */
export async function handleWhatsAppReaction(
  conversationId: string,
  targetWamid: string,
  emoji: string
): Promise<void> {
  const target = await prisma.message.findFirst({
    where: { conversationId, whatsappMessageId: targetWamid },
    select: { id: true, metadata: true },
  });
  if (!target) {
    console.log(`[wa-debug] reaction for unknown wamid ${targetWamid} — dropped`);
    return;
  }

  const meta = { ...((target.metadata as AgentMessageMetadata | null) ?? {}) };
  if (emoji) meta.reaction = emoji;
  else delete meta.reaction;

  await prisma.message.update({
    where: { id: target.id },
    data: { metadata: meta as unknown as Prisma.InputJsonValue },
  });
}

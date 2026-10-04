import "server-only";
import { Channel, type Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL, type AgentContext } from "@/agent";
import type { ToolCallRecord, VoiceMessageMetadata } from "@/agent/types";
import {
  resolveActiveSession,
  persistUserMessage,
  persistAgentMessage,
  getOrCreateWebConversation,
  getOrCreateGuestWebConversation,
} from "../agentSession";
import { getClinicAiStatus } from "../aiCredit";
import { transcribeAudio } from "../transcription";
import { synthesizeSpeech } from "../tts";
import { uploadPatientMedia } from "@/lib/supabase/storage";
import {
  generateAgentReply,
  chargeReply,
  chargeTranscriptionSafe,
  chargeTtsSafe,
  VOICE_FAILED_NOTICE,
} from "../agentRunner";

/**
 * WEB channel.
 *
 * Unlike the push channels (WhatsApp, Instagram, …), web is SYNChronous: the reply
 * is returned in the HTTP response the browser is already awaiting, so there is no
 * "send" step and web does NOT implement the push `ChannelAdapter` (it is absent
 * from the adapter registry). These entrypoints run the shared agent brain
 * (`generateAgentReply`) and return the reply as plain data for the route to JSON.
 */

/** A synchronous web reply (no SSE). `reply` is null on a handoff/gate. */
export interface WebReplyResult {
  conversationId: string;
  reply: string | null;
  toolCalls: ToolCallRecord[];
  /** True when the agent didn't answer (human handoff / AI off / no units). */
  handoff: boolean;
}

/** A synchronous web voice reply: adds what was transcribed + an optional spoken
 *  reply (client plays /api/agent/media/<audioMessageId>). */
export interface WebVoiceResult extends WebReplyResult {
  transcript: string;
  audioMessageId: string | null;
}

/** The clinic a guest (no account) web turn runs against — resolved by the API
 *  route from the request host, since a guest has no membership to resolve it. */
export interface GuestClinic {
  id: string;
  slug: string;
}

/** The web membership shape both member entrypoints resolve. */
interface WebMembership {
  role: Role;
  clinicId: string;
  clinic: { slug: string };
  user: { fullName: string };
}

/** What `runWebReplyCore` returns after persisting the reply (null when the agent
 *  didn't answer — handoff / gate). Lets the voice turn synthesize TTS from it. */
interface WebReplyOutcome {
  agentMessageId: string;
  replyText: string;
  toolCalls: ToolCallRecord[];
}

/**
 * Web channel (identified member): persists the user message, runs the common
 * agent brain, persists + charges the reply, and RETURNS it (no SSE — the route
 * sends it back as JSON).
 */
export async function webAgentReply(userId: string, userText: string): Promise<WebReplyResult> {
  const membership = await resolveWebMembership(userId);
  const conversationId = await getOrCreateWebConversation(userId, membership.clinicId);
  const sessionId = await resolveActiveSession(conversationId, membership.clinicId);
  await persistUserMessage(conversationId, sessionId, membership.clinicId, userText, userId);

  const tail = await finishWebTextReply(
    memberWebContext(membership, userId, conversationId, sessionId)
  );
  return { conversationId, ...tail };
}

/**
 * Web channel, anonymous guest (no account). Resolves/creates the guest's
 * unclaimed WEB conversation from the browser-held `conversationId`, then runs the
 * reply with a role-null context (info tools only, GUEST_WEB_GUIDE prompt). The
 * returned `conversationId` is what the browser persists to reload history /
 * receive admin replies.
 */
export async function guestWebAgentReply(
  clinic: GuestClinic,
  conversationId: string | null,
  userText: string
): Promise<WebReplyResult> {
  const convId = await getOrCreateGuestWebConversation(conversationId, clinic.id);
  const sessionId = await resolveActiveSession(convId, clinic.id);
  await persistUserMessage(convId, sessionId, clinic.id, userText, null);

  const tail = await finishWebTextReply(guestWebContext(clinic, convId, sessionId));
  return { conversationId: convId, ...tail };
}

/**
 * Web channel, voice note (identified member): stores + transcribes the audio,
 * persists the user message, runs the common brain, and RETURNS the reply (no SSE).
 * When the clinic has `voiceReplyEnabled`, a spoken reply is synthesized and its
 * `audioMessageId` is returned so the widget can play /api/agent/media/<id>.
 */
export async function webVoiceReply(
  userId: string,
  audio: { bytes: Buffer; mimeType: string }
): Promise<WebVoiceResult> {
  const membership = await resolveWebMembership(userId);
  const conversationId = await getOrCreateWebConversation(userId, membership.clinicId);
  const sessionId = await resolveActiveSession(conversationId, membership.clinicId);

  const tail = await finishWebVoiceReply(
    memberWebContext(membership, userId, conversationId, sessionId),
    audio
  );
  return { conversationId, ...tail };
}

/** Web channel, anonymous guest voice note. Role-null context (info tools only). */
export async function guestWebVoiceReply(
  clinic: GuestClinic,
  conversationId: string | null,
  audio: { bytes: Buffer; mimeType: string }
): Promise<WebVoiceResult> {
  const convId = await getOrCreateGuestWebConversation(conversationId, clinic.id);
  const sessionId = await resolveActiveSession(convId, clinic.id);

  const tail = await finishWebVoiceReply(guestWebContext(clinic, convId, sessionId), audio);
  return { conversationId: convId, ...tail };
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

/** Builds the web AgentContext for an identified clinic member. */
function memberWebContext(
  membership: WebMembership,
  userId: string,
  conversationId: string,
  sessionId: string
): AgentContext {
  return {
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
}

/** Builds the web AgentContext for an anonymous guest (no account, role null).
 *  With no role, `getToolsForRole` hands the agent only info tools, and the
 *  prompt uses GUEST_WEB_GUIDE — so booking is structurally impossible and the
 *  guest is told to sign in / register first. */
function guestWebContext(
  clinic: GuestClinic,
  conversationId: string,
  sessionId: string
): AgentContext {
  return {
    actorId: null,
    role: null,
    clinicId: clinic.id,
    clinicSlug: clinic.slug,
    contactPhone: null,
    channel: Channel.WEB,
    conversationId,
    sessionId,
    actorName: "",
  };
}

/**
 * Shared web reply core: runs the common agent brain, then persists + charges the
 * reply (SENT — web delivers it in the HTTP response). The user message is already
 * in `ctx.sessionId`. Returns the persisted reply (for TTS) or null when the agent
 * didn't answer (handoff / gate).
 */
async function runWebReplyCore(ctx: AgentContext): Promise<WebReplyOutcome | null> {
  const gen = await generateAgentReply(ctx);
  if (gen.kind === "skipped") return null;

  const agentMsg = await persistAgentMessage(
    ctx.conversationId,
    ctx.sessionId,
    ctx.clinicId,
    gen.text,
    {
      toolCalls: gen.toolCalls,
    }
  );
  // Unconditional: the unit is owed because the agent answered. On the rare turn
  // with no usage metadata we still bill the one unit (USD side computes to zero).
  await chargeReply({
    clinicId: ctx.clinicId,
    sessionId: ctx.sessionId,
    messageId: agentMsg.id,
    usage: gen.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: DEFAULT_MODEL,
    },
  });
  return { agentMessageId: agentMsg.id, replyText: gen.text, toolCalls: gen.toolCalls };
}

/** Text-reply tail for the web entrypoints → the JSON the route returns. */
async function finishWebTextReply(
  ctx: AgentContext
): Promise<{ reply: string | null; toolCalls: ToolCallRecord[]; handoff: boolean }> {
  const outcome = await runWebReplyCore(ctx);
  if (!outcome) return { reply: null, toolCalls: [], handoff: true };
  return { reply: outcome.replyText, toolCalls: outcome.toolCalls, handoff: false };
}

/**
 * Shared web voice turn (member or guest): stores + transcribes the audio, persists
 * the user message (transcript + voice metadata), charges transcription, runs the
 * common brain, and optionally synthesizes a spoken reply. Returns everything the
 * route needs to answer the browser in one JSON response.
 */
async function finishWebVoiceReply(
  ctx: AgentContext,
  audio: { bytes: Buffer; mimeType: string }
): Promise<Omit<WebVoiceResult, "conversationId">> {
  const { clinicId, conversationId, sessionId, actorId } = ctx;

  let transcript = "";
  let durationSec: number | null = null;
  let sttModel = "";
  let voiceMeta: VoiceMessageMetadata | null = null;
  try {
    const stored = await uploadPatientMedia({
      clinicId,
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
    clinicId,
    content,
    actorId,
    voiceMeta ? { voice: voiceMeta } : null
  );

  if (sttModel) {
    await chargeTranscriptionSafe({
      clinicId,
      sessionId,
      messageId: userMsg.id,
      model: sttModel,
      audioSeconds: durationSec,
    });
  }

  // Couldn't understand the audio — return a graceful notice, don't run the agent.
  if (!transcript) {
    return {
      transcript: content,
      reply: VOICE_FAILED_NOTICE,
      toolCalls: [],
      handoff: false,
      audioMessageId: null,
    };
  }

  const outcome = await runWebReplyCore(ctx);
  if (!outcome) {
    return { transcript: content, reply: null, toolCalls: [], handoff: true, audioMessageId: null };
  }

  // Voice-out: the patient spoke, so speak back — but only if the clinic opted in.
  let audioMessageId: string | null = null;
  const status = await getClinicAiStatus(clinicId);
  if (status.voiceReplyEnabled) {
    const tts = await synthesizeSpeech(outcome.replyText);
    if (tts) {
      try {
        const stored = await uploadPatientMedia({
          clinicId,
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
          clinicId,
          sessionId,
          messageId: outcome.agentMessageId,
          model: tts.model,
          characters: tts.characters,
          audioSeconds: tts.durationSec,
        });
        audioMessageId = outcome.agentMessageId;
      } catch (err) {
        console.error("[web] failed to attach TTS reply audio:", err);
      }
    }
  }

  return {
    transcript: content,
    reply: outcome.replyText,
    toolCalls: outcome.toolCalls,
    handoff: false,
    audioMessageId,
  };
}

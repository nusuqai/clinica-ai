import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, SenderType, type Role } from "@prisma/client";
import { sendTextMessage, WhatsAppApiError } from "@/lib/meta/whatsapp";
import type { WhatsAppCredentials } from "@/lib/meta/whatsapp";
import type { UnsupportedMediaType } from "@/lib/meta/whatsapp-inbound";
import { showTypingIndicator } from "./whatsappTyping";
import {
  runAgentStream,
  runAgentToText,
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
  isDuplicateChargeError,
  ensureOpenEscalation,
} from "./aiCredit";
import type { TokenUsage } from "@/agent/types";

const FALLBACK_REPLY = "تم تنفيذ طلبك.";

const UNSUPPORTED_PREFIX = "عذراً، لا يمكننا استقبال";
const unsupportedReply = (noun: string) =>
  `${UNSUPPORTED_PREFIX} ${noun}. الرجاء إرسال رسالتك كنص فقط. 🙏`;

/** Media usually arrives in bursts (a photo album, a voice note plus a file),
 *  so the notice is repeated at most once per window. */
const UNSUPPORTED_NOTICE_COOLDOWN_MS = 60_000;

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
  phone: string,
  reply: string,
  creds: WhatsAppCredentials,
): Promise<void> {
  try {
    await sendTextMessage(phone, reply, creds);
  } catch (err) {
    if (err instanceof WhatsAppApiError && err.isOutsideServiceWindow) {
      console.error(
        `[whatsapp] reply not delivered to ${phone}: the 24-hour service window has closed — only an approved template can reach this contact`,
      );
      return;
    }
    console.error(`[whatsapp] reply not delivered to ${phone}:`, err);
  }
}

function toPrior(messages: SessionMessage[]): PriorMessage[] {
  return messages.map((m) => ({
    senderType: m.senderType,
    content: m.content,
    toolCalls: m.metadata?.toolCalls,
  }));
}

/**
 * The clinic-level gate, checked after the per-session `isSessionAiEnabled`
 * pause and before running the agent. Returns true (agent must NOT reply) when
 * the clinic has turned its AI off or has run out of credit; in both cases the
 * already-persisted user message is surfaced to a human via an escalation.
 */
async function clinicGateBlocks(
  clinicId: string,
  conversationId: string,
  sessionId: string,
): Promise<boolean> {
  const status = await getClinicAiStatus(clinicId);
  if (!status.aiEnabled) {
    await ensureOpenEscalation(conversationId, sessionId, "clinic_disabled");
    return true;
  }
  if (!status.sufficient) {
    await ensureOpenEscalation(
      conversationId,
      sessionId,
      "insufficient_credit",
    );
    return true;
  }
  return false;
}

/**
 * Meters the cost of a reply against the clinic balance. Kept off the reply's
 * critical path: a duplicate charge (webhook redelivery) is expected and
 * swallowed, and any other failure is logged — never allowed to crash delivery
 * of an already-sent reply.
 */
async function chargeReply(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  try {
    await chargeUsage(args);
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
  userText: string,
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

  const conversationId = await getOrCreateWebConversation(
    userId,
    membership.clinicId,
  );
  const sessionId = await resolveActiveSession(conversationId);
  await persistUserMessage(conversationId, sessionId, userText, userId);

  if (!(await isSessionAiEnabled(sessionId))) {
    yield { type: "handoff" };
    return;
  }

  if (await clinicGateBlocks(membership.clinicId, conversationId, sessionId)) {
    yield { type: "handoff" };
    return;
  }

  const prior = await getSessionMessages(sessionId);

  const ctx: AgentContext = {
    actorId: userId,
    role: membership.role,
    clinicId: membership.clinicId,
    clinicSlug: membership.clinic.slug,
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

  const agentMsg = await persistAgentMessage(
    conversationId,
    sessionId,
    finalText || FALLBACK_REPLY,
    {
      toolCalls,
    },
  );

  if (usage) {
    await chargeReply({
      clinicId: membership.clinicId,
      sessionId,
      messageId: agentMsg.id,
      usage,
    });
  }
}

/**
 * WhatsApp channel, non-text message: records that something arrived so the
 * admin can see the gap in the thread, and tells the contact we only take text.
 *
 * The notice is sent whether or not the AI is enabled — it reports a hard
 * limitation of the channel (nobody, human or agent, can read the attachment),
 * not an agent opinion.
 */
export async function handleUnsupportedWhatsAppMessage(
  conversationId: string,
  phone: string,
  media: UnsupportedMediaType,
  creds: WhatsAppCredentials,
): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { phone },
    select: { id: true },
  });

  const sessionId = await resolveActiveSession(conversationId);
  // Always recorded, even when the notice below is suppressed, so the admin
  // sees every item the contact actually sent.
  await persistUserMessage(
    conversationId,
    sessionId,
    media.placeholder,
    profile?.id ?? null,
  );

  const recentReply = await prisma.message.findFirst({
    where: {
      conversationId,
      senderType: SenderType.AGENT,
      createdAt: { gte: new Date(Date.now() - UNSUPPORTED_NOTICE_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  if (recentReply?.content.startsWith(UNSUPPORTED_PREFIX)) return;

  const reply = unsupportedReply(media.noun);
  await persistAgentMessage(conversationId, sessionId, reply, null);
  await deliverReply(phone, reply, creds);
}

/**
 * WhatsApp channel: resolves the session, persists the user message, runs the
 * agent (non-streaming), persists + sends the reply. Phone is matched to a
 * profile — unknown numbers get an info-only agent (no actions).
 */
export async function handleWhatsAppMessage(
  conversationId: string,
  phone: string,
  userText: string,
  /** Meta message id — enables read receipts and the typing indicator. */
  messageId: string,
  creds: WhatsAppCredentials,
): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { phone },
    select: { id: true, fullName: true },
  });

  // Link the conversation to the matched account so the admin inbox + role
  // gating stay consistent.
  if (profile) {
    await prisma.conversation
      .update({ where: { id: conversationId }, data: { userId: profile.id } })
      .catch(() => {}); // ignore unique clashes (already linked elsewhere)
  }

  const sessionId = await resolveActiveSession(conversationId);
  await persistUserMessage(
    conversationId,
    sessionId,
    userText,
    profile?.id ?? null,
  );

  if (!(await isSessionAiEnabled(sessionId))) return;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      whatsappName: true,
      clinicId: true,
      clinic: { select: { slug: true } },
    },
  });
  // The conversation was just created/updated above, so this is defensive.
  if (!conv) return;
  const clinicId = conv.clinicId;

  if (await clinicGateBlocks(clinicId, conversationId, sessionId)) return;

  const prior = await getSessionMessages(sessionId);

  // The contact's role is per-clinic; resolve it in this conversation's clinic.
  let role: Role | null = null;
  if (profile) {
    const m = await prisma.clinicMember.findUnique({
      where: {
        userId_clinicId: { userId: profile.id, clinicId: conv.clinicId },
      },
      select: { role: true },
    });
    role = m?.role ?? null;
  }

  const ctx: AgentContext = {
    actorId: profile?.id ?? null,
    role,
    clinicId,
    clinicSlug: conv.clinic.slug,
    channel: Channel.WHATSAPP,
    conversationId,
    sessionId,
    actorName: profile?.fullName ?? conv?.whatsappName ?? "",
  };

  // The agent is fully buffered (no token streaming on this channel), so show
  // "typing…" instead of leaving the contact in silence. Meta clears it when
  // the reply lands, so there is nothing to stop afterwards.
  showTypingIndicator(messageId, creds);

  const { text, toolCalls, usage } = await runAgentToText(ctx, toPrior(prior));
  const reply = text || FALLBACK_REPLY;

  const agentMsg = await persistAgentMessage(conversationId, sessionId, reply, {
    toolCalls,
  });
  await deliverReply(phone, reply, creds);
  await chargeReply({ clinicId, sessionId, messageId: agentMsg.id, usage });
}

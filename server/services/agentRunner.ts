import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, SenderType, type Role } from "@prisma/client";
import { DEFAULT_CLINIC_ID } from "@/lib/tenant";
import { sendTextMessage } from "@/lib/evolution";
import type { UnsupportedMediaType } from "@/lib/whatsapp-inbound";
import { startTypingIndicator } from "./whatsappTyping";
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
  getOrCreateGuestWebConversation,
  resolveActiveSession,
  getSessionMessages,
  persistUserMessage,
  persistAgentMessage,
  isSessionAiEnabled,
  type SessionMessage,
} from "./agentSession";

const FALLBACK_REPLY = "تم تنفيذ طلبك.";

const UNSUPPORTED_PREFIX = "عذراً، لا يمكننا استقبال";
const unsupportedReply = (noun: string) =>
  `${UNSUPPORTED_PREFIX} ${noun}. الرجاء إرسال رسالتك كنص فقط. 🙏`;

/** Media usually arrives in bursts (a photo album, a voice note plus a file),
 *  so the notice is repeated at most once per window. */
const UNSUPPORTED_NOTICE_COOLDOWN_MS = 60_000;

function toPrior(messages: SessionMessage[]): PriorMessage[] {
  return messages.map((m) => ({
    senderType: m.senderType,
    content: m.content,
    toolCalls: m.metadata?.toolCalls,
  }));
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
    select: { role: true, clinicId: true, user: { select: { fullName: true } } },
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

  const prior = await getSessionMessages(sessionId);

  const ctx: AgentContext = {
    actorId: userId,
    role: membership.role,
    clinicId: membership.clinicId,
    channel: Channel.WEB,
    conversationId,
    sessionId,
    actorName: membership.user.fullName,
  };

  let finalText = "";
  let toolCalls: ToolCallRecord[] = [];

  for await (const ev of runAgentStream(ctx, toPrior(prior))) {
    if (ev.type === "done") {
      finalText = ev.text;
      toolCalls = ev.toolCalls;
    }
    yield ev;
  }

  await persistAgentMessage(
    conversationId,
    sessionId,
    finalText || FALLBACK_REPLY,
    {
      toolCalls,
    },
  );
}

/**
 * Web channel, no account: mirrors the WhatsApp "unknown contact" flow —
 * `role: null` limits the agent to `commonTools()` (info only, no booking).
 * `conversationId` comes from the browser (localStorage), reused across
 * messages if it's still a valid, unclaimed guest conversation; a fresh one
 * is created otherwise and reported back via an `init` event so the browser
 * can remember it.
 */
export async function* streamGuestWebAgent(
  conversationId: string | null,
  userText: string,
): AsyncGenerator<AgentStreamEvent | { type: "init"; conversationId: string }> {
  const resolvedConversationId = await getOrCreateGuestWebConversation(
    conversationId,
    DEFAULT_CLINIC_ID,
  );
  yield { type: "init", conversationId: resolvedConversationId };

  const sessionId = await resolveActiveSession(resolvedConversationId);
  await persistUserMessage(resolvedConversationId, sessionId, userText, null);

  if (!(await isSessionAiEnabled(sessionId))) {
    yield { type: "handoff" };
    return;
  }

  const prior = await getSessionMessages(sessionId);

  const ctx: AgentContext = {
    actorId: null,
    role: null,
    clinicId: DEFAULT_CLINIC_ID,
    channel: Channel.WEB,
    conversationId: resolvedConversationId,
    sessionId,
    actorName: "زائر",
  };

  let finalText = "";
  let toolCalls: ToolCallRecord[] = [];

  for await (const ev of runAgentStream(ctx, toPrior(prior))) {
    if (ev.type === "done") {
      finalText = ev.text;
      toolCalls = ev.toolCalls;
    }
    yield ev;
  }

  await persistAgentMessage(
    resolvedConversationId,
    sessionId,
    finalText || FALLBACK_REPLY,
    { toolCalls },
  );
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
  await sendTextMessage(phone, reply);
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

  const prior = await getSessionMessages(sessionId);

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { whatsappName: true, clinicId: true },
  });

  // The contact's role is per-clinic; resolve it in this conversation's clinic.
  let role: Role | null = null;
  if (profile && conv) {
    const m = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId: profile.id, clinicId: conv.clinicId } },
      select: { role: true },
    });
    role = m?.role ?? null;
  }

  const ctx: AgentContext = {
    actorId: profile?.id ?? null,
    role,
    clinicId: conv?.clinicId ?? DEFAULT_CLINIC_ID,
    channel: Channel.WHATSAPP,
    conversationId,
    sessionId,
    actorName: profile?.fullName ?? conv?.whatsappName ?? "",
  };

  // The agent is fully buffered (no token streaming on this channel), so show
  // "typing…" for the whole run instead of leaving the contact in silence.
  const stopTyping = startTypingIndicator(phone);
  let text: string;
  let toolCalls: ToolCallRecord[];
  try {
    ({ text, toolCalls } = await runAgentToText(ctx, toPrior(prior)));
  } finally {
    // Stop before persisting/sending so the indicator overlaps the reply as
    // little as possible.
    stopTyping();
  }
  const reply = text || FALLBACK_REPLY;

  await persistAgentMessage(conversationId, sessionId, reply, { toolCalls });
  await sendTextMessage(phone, reply);
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/evolution";
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
  type SessionMessage,
} from "./agentSession";

const FALLBACK_REPLY = "تم تنفيذ طلبك.";

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
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true, fullName: true },
  });
  if (!profile) throw new Error("Profile not found");

  const conversationId = await getOrCreateWebConversation(userId);
  const sessionId = await resolveActiveSession(conversationId);
  await persistUserMessage(conversationId, sessionId, userText, userId);
  const prior = await getSessionMessages(sessionId);

  const ctx: AgentContext = {
    actorId: userId,
    role: profile.role,
    channel: "WEB",
    conversationId,
    sessionId,
    actorName: profile.fullName,
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
    select: { id: true, role: true, fullName: true },
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
  const prior = await getSessionMessages(sessionId);

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { whatsappName: true },
  });

  const ctx: AgentContext = {
    actorId: profile?.id ?? null,
    role: profile?.role ?? null,
    channel: "WHATSAPP",
    conversationId,
    sessionId,
    actorName: profile?.fullName ?? conv?.whatsappName ?? "",
  };

  const { text, toolCalls } = await runAgentToText(ctx, toPrior(prior));
  const reply = text || FALLBACK_REPLY;

  await persistAgentMessage(conversationId, sessionId, reply, { toolCalls });
  await sendTextMessage(phone, reply);
}

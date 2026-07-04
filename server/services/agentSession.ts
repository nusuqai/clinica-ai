import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AgentMessageMetadata } from "@/agent/types";

/** Fixed session window: 30 min from the session's first message. */
export const SESSION_MINUTES = 30;

export interface SessionMessage {
  id: string;
  content: string;
  senderType: "USER" | "ADMIN" | "AGENT";
  metadata: AgentMessageMetadata | null;
  createdAt: Date;
}

/**
 * Returns the active session for a conversation, creating one if none is live.
 * A session is live while `expiresAt > now`; otherwise a fresh 30-min window
 * starts. `thread_id` for the agent = this session id.
 */
export async function resolveActiveSession(
  conversationId: string,
): Promise<string> {
  const now = new Date();
  const live = await prisma.chatSession.findFirst({
    where: { conversationId, expiresAt: { gt: now } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (live) return live.id;

  const session = await prisma.chatSession.create({
    data: {
      conversationId,
      startedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MINUTES * 60_000),
    },
    select: { id: true },
  });
  return session.id;
}

/** Prior messages of a session, oldest first, for LLM context. */
export async function getSessionMessages(
  sessionId: string,
): Promise<SessionMessage[]> {
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderType: m.senderType as SessionMessage["senderType"],
    metadata: (m.metadata as AgentMessageMetadata | null) ?? null,
    createdAt: m.createdAt,
  }));
}

export async function persistUserMessage(
  conversationId: string,
  sessionId: string,
  content: string,
  senderId: string | null,
): Promise<SessionMessage> {
  const m = await prisma.message.create({
    data: {
      conversationId,
      sessionId,
      senderType: "USER",
      senderId,
      content,
      isRead: true,
    },
  });
  await touchConversation(conversationId);
  return {
    id: m.id,
    content: m.content,
    senderType: "USER",
    metadata: null,
    createdAt: m.createdAt,
  };
}

export async function persistAgentMessage(
  conversationId: string,
  sessionId: string,
  content: string,
  metadata: AgentMessageMetadata | null,
): Promise<SessionMessage> {
  const m = await prisma.message.create({
    data: {
      conversationId,
      sessionId,
      senderType: "AGENT",
      content,
      isRead: true,
      metadata: metadata
        ? (metadata as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
  await touchConversation(conversationId);
  return {
    id: m.id,
    content: m.content,
    senderType: "AGENT",
    metadata,
    createdAt: m.createdAt,
  };
}

async function touchConversation(conversationId: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

/** The single WEB conversation for a logged-in user (created on first use). */
export async function getOrCreateWebConversation(
  userId: string,
): Promise<string> {
  const existing = await prisma.conversation.findUnique({
    where: { userId_channel: { userId, channel: "WEB" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({
    data: { userId, channel: "WEB" },
    select: { id: true },
  });
  return created.id;
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, SenderType, MessageDelivery, type Prisma } from "@prisma/client";
import type { AgentMessageMetadata } from "@/agent/types";

/**
 * Session window in minutes, measured from the session's first message.
 * Configurable via the SESSION_MINUTES env var; defaults to 30.
 *
 * Note: a new session starts the agent "cold" — `getSessionMessages` only loads
 * the current session — until session compaction (a summary of the previous
 * session fed into the next) lands. See #29.
 */
const envSessionMinutes = Number(process.env.SESSION_MINUTES);
export const SESSION_MINUTES =
  Number.isFinite(envSessionMinutes) && envSessionMinutes > 0 ? envSessionMinutes : 30;

export interface SessionMessage {
  id: string;
  content: string;
  senderType: SenderType;
  metadata: AgentMessageMetadata | null;
  createdAt: Date;
  clinicId: string;
}

/**
 * Returns the active session for a conversation, creating one if none is live.
 * A session is live while `expiresAt > now`; otherwise a fresh window starts
 * (SESSION_MINUTES). `thread_id` for the agent = this session id.
 */
export async function resolveActiveSession(
  conversationId: string,
  clinicId: string
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
      clinicId: clinicId,
    },
    select: { id: true },
  });
  return session.id;
}

/** Whether AI auto-reply is currently on for this session. */
export async function isSessionAiEnabled(sessionId: string): Promise<boolean> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { aiEnabled: true },
  });
  return session?.aiEnabled ?? true;
}

/** Prior messages of a session, oldest first, for LLM context. */
export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
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
    clinicId: m.clinicId,
  }));
}

export async function persistUserMessage(
  conversationId: string,
  sessionId: string,
  clinicId: string,
  content: string,
  senderId: string | null,
  /** Optional metadata — e.g. `{ voice }` for a transcribed voice note. */
  metadata: AgentMessageMetadata | null = null,
  /** The inbound WhatsApp message id (wamid), so a later reaction can attach. */
  whatsappMessageId: string | null = null
): Promise<SessionMessage> {
  const m = await prisma.message.create({
    data: {
      conversationId,
      sessionId,
      senderType: SenderType.USER,
      senderId,
      content,
      isRead: false,
      metadata: metadata ? (metadata as unknown as Prisma.InputJsonValue) : undefined,
      whatsappMessageId,
      clinicId,
    },
  });
  await touchConversation(conversationId);
  return {
    id: m.id,
    content: m.content,
    senderType: SenderType.USER,
    metadata,
    createdAt: m.createdAt,
    clinicId: m.clinicId,
  };
}

export async function persistAgentMessage(
  conversationId: string,
  sessionId: string,
  clinicId: string,
  content: string,
  metadata: AgentMessageMetadata | null,
  /**
   * Delivery lifecycle. Defaults to SENT (the inline web/voice-notice paths send
   * immediately). The debounce processor passes QUEUED: it persists the reply as
   * a checkpoint BEFORE sending, so a send failure re-delivers this same row
   * without re-running or re-charging the agent.
   */
  deliveryStatus: MessageDelivery = MessageDelivery.SENT
): Promise<SessionMessage> {
  const m = await prisma.message.create({
    data: {
      conversationId,
      sessionId,
      senderType: SenderType.AGENT,
      content,
      isRead: true,
      metadata: metadata ? (metadata as unknown as Prisma.InputJsonValue) : undefined,
      clinicId,
      deliveryStatus,
    },
  });
  await touchConversation(conversationId);
  return {
    id: m.id,
    content: m.content,
    senderType: SenderType.AGENT,
    metadata,
    createdAt: m.createdAt,
    clinicId: m.clinicId,
  };
}

/**
 * The unprocessed inbound user messages of a conversation, oldest first — the
 * burst the debounce processor is about to consolidate. Their shared `sessionId`
 * is the live session to answer in (a <15s window can't cross a 30-min session).
 */
export async function getUnprocessedUserMessages(
  conversationId: string
): Promise<{ id: string; sessionId: string | null }[]> {
  return prisma.message.findMany({
    where: { conversationId, senderType: SenderType.USER, processedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, sessionId: true },
  });
}

/**
 * An already-generated agent reply that never reached the patient (a prior send
 * failed, or crashed between persist and send). The processor re-delivers this
 * instead of re-running the agent — so a send retry never re-charges AI.
 */
export async function findUndeliveredAgentReply(conversationId: string): Promise<{
  id: string;
  sessionId: string | null;
  clinicId: string;
  content: string;
  sendAttempts: number;
} | null> {
  return prisma.message.findFirst({
    where: {
      conversationId,
      senderType: SenderType.AGENT,
      deliveryStatus: { in: [MessageDelivery.QUEUED, MessageDelivery.FAILED] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, sessionId: true, clinicId: true, content: true, sendAttempts: true },
  });
}

/** Marks an outbound agent reply delivered (records the wamid) or failed. */
export async function markAgentDelivery(
  messageId: string,
  status: MessageDelivery,
  opts: { whatsappMessageId?: string | null; incrementAttempts?: boolean } = {}
): Promise<void> {
  await prisma.message
    .update({
      where: { id: messageId },
      data: {
        deliveryStatus: status,
        ...(opts.whatsappMessageId ? { whatsappMessageId: opts.whatsappMessageId } : {}),
        ...(opts.incrementAttempts ? { sendAttempts: { increment: 1 } } : {}),
      },
    })
    .catch((err) => console.error("[debounce] failed to update agent delivery:", err));
}

/** Records the WhatsApp wamid on an already-persisted message (agent/staff
 *  replies get their wamid only after the send returns). Best-effort. */
export async function setMessageWhatsappId(
  messageId: string,
  whatsappMessageId: string | null
): Promise<void> {
  if (!whatsappMessageId) return;
  await prisma.message
    .update({ where: { id: messageId }, data: { whatsappMessageId } })
    .catch((err) => console.error("[wa] failed to store wamid:", err));
}

async function touchConversation(conversationId: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

/** The single WEB conversation for a logged-in user in a clinic (created on
 * first use). */
export async function getOrCreateWebConversation(
  userId: string,
  clinicId: string
): Promise<string> {
  const existing = await prisma.conversation.findUnique({
    where: { clinicId_userId_channel: { clinicId, userId, channel: Channel.WEB } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.conversation.create({
    data: { clinicId, userId, channel: Channel.WEB },
    select: { id: true },
  });
  return created.id;
}

/**
 * Resolves a guest (no account) WEB conversation. Reuses `conversationId` if
 * it's still a valid, unclaimed guest conversation (channel WEB, no userId —
 * this scopes it away from any logged-in user's conversation); otherwise
 * creates a fresh one. The browser is the only place the id is stored, same
 * pattern as a guest cart id.
 */
export async function getOrCreateGuestWebConversation(
  conversationId: string | null,
  clinicId: string
): Promise<string> {
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, channel: Channel.WEB, userId: null },
      select: { id: true },
    });
    if (existing) return existing.id;
  }
  const created = await prisma.conversation.create({
    data: { clinicId, channel: Channel.WEB },
    select: { id: true },
  });
  return created.id;
}

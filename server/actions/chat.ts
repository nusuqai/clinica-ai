"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateWebConversation,
  getSessionMessages,
} from "@/server/services/agentSession";
import type { AgentMessageMetadata } from "@/agent/types";

export interface WebChatMessage {
  id: string;
  content: string;
  senderType: "USER" | "ADMIN" | "AGENT";
  metadata: AgentMessageMetadata | null;
  createdAt: string;
}

export interface WebChatState {
  conversationId: string;
  messages: WebChatMessage[];
}

/**
 * Loads the caller's WEB conversation id (for realtime) and the messages of the
 * currently-active session (empty if the last session has expired — a new one
 * begins on the next message).
 */
export async function getWebChatMessages(): Promise<WebChatState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const conversationId = await getOrCreateWebConversation(user.id);

  const activeSession = await prisma.chatSession.findFirst({
    where: { conversationId, expiresAt: { gt: new Date() } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  const messages = activeSession
    ? await getSessionMessages(activeSession.id)
    : [];

  return {
    conversationId,
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderType: m.senderType,
      metadata: m.metadata,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Loads history for a guest (no account) WEB conversation. `conversationId`
 * comes from the browser's localStorage — deliberately unauthenticated, but
 * scoped to `channel: WEB, userId: null` so it can never read a logged-in
 * user's conversation even if a guest id were guessed.
 */
export async function getGuestChatMessages(
  conversationId: string,
): Promise<WebChatState | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, channel: "WEB", userId: null },
    select: { id: true },
  });
  if (!conversation) return null;

  const activeSession = await prisma.chatSession.findFirst({
    where: { conversationId, expiresAt: { gt: new Date() } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  const messages = activeSession
    ? await getSessionMessages(activeSession.id)
    : [];

  return {
    conversationId,
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderType: m.senderType,
      metadata: m.metadata,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

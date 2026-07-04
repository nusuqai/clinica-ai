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

"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/** Raw shape of a `messages` row as delivered by Supabase Realtime. */
export interface RealtimeMessageRow {
  id: string;
  conversationId: string;
  sessionId: string | null;
  senderType: "USER" | "ADMIN" | "AGENT";
  senderId: string | null;
  content: string;
  metadata: unknown;
  isRead: boolean;
  createdAt: string;
}

export function useRealtimeMessages(
  conversationId: string | null,
  onNewMessage: (row: RealtimeMessageRow) => void,
) {
  const callbackRef = useRef(onNewMessage);
  callbackRef.current = onNewMessage;

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          callbackRef.current(payload.new as unknown as RealtimeMessageRow);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}

export function useRealtimeConversations(onUpdate: () => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("conversations:all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => callbackRef.current(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => callbackRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

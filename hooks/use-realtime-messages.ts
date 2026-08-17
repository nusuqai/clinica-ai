"use client";

import { useEffect, useRef } from "react";
import type { SenderType } from "@prisma/client";
import { createClient } from "@/lib/supabase/client";

/** Raw shape of a `messages` row as delivered by Supabase Realtime. */
export interface RealtimeMessageRow {
  id: string;
  conversationId: string;
  sessionId: string | null;
  senderType: SenderType;
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
          const row = payload.new as unknown as RealtimeMessageRow;
          if (row.conversationId !== conversationId) return;
          callbackRef.current(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}

/** Raw shape of an `escalations` row as delivered by Supabase Realtime. */
export interface RealtimeEscalationRow {
  id: string;
  conversationId: string;
  sessionId: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function useRealtimeEscalations(
  onInsert: (row: RealtimeEscalationRow) => void,
  onResolve: (row: RealtimeEscalationRow) => void,
) {
  const insertRef = useRef(onInsert);
  insertRef.current = onInsert;
  const resolveRef = useRef(onResolve);
  resolveRef.current = onResolve;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("escalations:all")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "escalations" },
        (payload) => {
          insertRef.current(payload.new as unknown as RealtimeEscalationRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "escalations" },
        (payload) => {
          const row = payload.new as unknown as RealtimeEscalationRow;
          if (row.resolvedAt) resolveRef.current(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

export function useRealtimeConversations(
  onNewMessage: (row: RealtimeMessageRow) => void,
) {
  const messageRef = useRef(onNewMessage);
  messageRef.current = onNewMessage;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-inbox-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          // no conversation_id filter — this admin needs every conversation's
          // inserts to keep the sidebar accurate; the callback decides what
          // to do with each row based on the currently open thread
        },
        (payload) => {
          messageRef.current(payload.new as unknown as RealtimeMessageRow);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // subscribe once, never tear down/rebuild on activeId change
}
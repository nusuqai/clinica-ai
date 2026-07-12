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

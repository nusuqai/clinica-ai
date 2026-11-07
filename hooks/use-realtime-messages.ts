"use client";

import { useEffect, useRef } from "react";
import type { SenderType } from "@prisma/client";
import { createClient } from "@/lib/supabase/client";

/**
 * Parses a timestamp from a realtime row. Prisma `DateTime` columns are
 * `timestamp(3)` WITHOUT time zone, holding UTC — so realtime sends them with
 * no offset ("2026-11-08T08:00:00.123"), which `new Date()` would read as the
 * browser's LOCAL time (2h off in Cairo) and sort the row into the past.
 */
export function parseDbTimestamp(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value.replace(" ", "T")}Z`);
}

/** Raw shape of a `messages` row as delivered by Supabase Realtime. */
export interface RealtimeMessageRow {
  id: string;
  conversationId: string;
  sessionId: string | null;
  senderType: SenderType;
  senderId: string | null;
  aiAgentId: string | null;
  /** The message this one quotes, if any. */
  replyToId: string | null;
  content: string;
  metadata: unknown;
  isRead: boolean;
  createdAt: string;
  clinicId: string;
}

export function useRealtimeMessages(
  conversationId: string | null,
  onNewMessage: (row: RealtimeMessageRow) => void
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
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as unknown as RealtimeMessageRow;
          if (row.conversationId !== conversationId) return;
          callbackRef.current(row);
        }
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

/** Raw shape of a `staff_alerts` row (a colleague escalation / assignment
 *  addressed to one team member) as delivered by Supabase Realtime. */
export interface RealtimeStaffAlertRow {
  id: string;
  conversationId: string;
  messageId: string | null;
  recipientId: string;
  actorId: string | null;
  kind: "ESCALATION" | "ASSIGNMENT";
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function useRealtimeEscalations(
  onInsert: (row: RealtimeEscalationRow) => void,
  onResolve: (row: RealtimeEscalationRow) => void,
  clinicId: string,
  /** Staff alerts ride the SAME channel, filtered to the signed-in member. */
  staffAlerts?: {
    userId: string;
    onAlert: (row: RealtimeStaffAlertRow, event: "insert" | "update") => void;
  }
) {
  const insertRef = useRef(onInsert);
  insertRef.current = onInsert;
  const resolveRef = useRef(onResolve);
  resolveRef.current = onResolve;
  const alertRef = useRef(staffAlerts?.onAlert);
  alertRef.current = staffAlerts?.onAlert;
  const alertUserId = staffAlerts?.userId;

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase
      .channel("escalations:all")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "escalations",
          filter: `clinicId=eq.${clinicId}`,
        },
        (payload) => {
          insertRef.current(payload.new as unknown as RealtimeEscalationRow);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "escalations",
          filter: `clinicId=eq.${clinicId}`,
        },
        (payload) => {
          const row = payload.new as unknown as RealtimeEscalationRow;
          if (row.resolvedAt) resolveRef.current(row);
        }
      );
    if (alertUserId) {
      channel = channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "staff_alerts",
            filter: `recipientId=eq.${alertUserId}`,
          },
          (payload) => {
            const row = payload.new as unknown as RealtimeStaffAlertRow;
            // Belt and braces: never surface someone else's alert.
            if (row.recipientId === alertUserId) alertRef.current?.(row, "insert");
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "staff_alerts",
            filter: `recipientId=eq.${alertUserId}`,
          },
          (payload) => {
            const row = payload.new as unknown as RealtimeStaffAlertRow;
            if (row.recipientId === alertUserId) alertRef.current?.(row, "update");
          }
        );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertUserId]);
}

/** Raw shape of an `internal_notes` row (staff-only message) from Realtime. */
export interface RealtimeInternalNoteRow {
  id: string;
  conversationId: string;
  clinicId: string;
  authorId: string | null;
  content: string;
  createdAt: string;
}

/** Raw shape of a `message_notes` row as delivered by Supabase Realtime. */
export interface RealtimeMessageNoteRow {
  id: string;
  conversationId: string;
  messageId: string;
  authorId: string;
  content: string;
  visibility: "PRIVATE" | "CLINIC";
  createdAt: string;
}

/** Live staff-only notes for the open conversation: thread notes
 *  (`internal_notes`) and notes pinned to a message (`message_notes`). */
export function useRealtimeInternalNotes(
  conversationId: string | null,
  onInsert: (row: RealtimeInternalNoteRow) => void,
  onDelete?: (id: string) => void,
  messageNotes?: {
    onInsert: (row: RealtimeMessageNoteRow) => void;
    onDelete: (id: string) => void;
  }
) {
  const insertRef = useRef(onInsert);
  insertRef.current = onInsert;
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;
  const messageNotesRef = useRef(messageNotes);
  messageNotesRef.current = messageNotes;

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`internal-notes:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_notes",
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as unknown as RealtimeMessageNoteRow;
          if (row.conversationId === conversationId) messageNotesRef.current?.onInsert(row);
        }
      )
      .on(
        "postgres_changes",
        // DELETE payloads carry only the primary key, so no filter is possible —
        // removing an unknown id is a no-op.
        { event: "DELETE", schema: "public", table: "message_notes" },
        (payload) => {
          const id = (payload.old as { id?: string } | null)?.id;
          if (id) messageNotesRef.current?.onDelete(id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_notes",
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as unknown as RealtimeInternalNoteRow;
          if (row.conversationId === conversationId) insertRef.current(row);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "internal_notes" },
        (payload) => {
          const id = (payload.old as { id?: string } | null)?.id;
          if (id) deleteRef.current?.(id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}

export function useRealtimeConversations(
  clinicId: string,
  onNewMessage: (row: RealtimeMessageRow) => void,
  /** Fired when an existing message row changes — e.g. a TTS agent reply gets
   *  its `metadata.voice` attached after the row was first inserted, so the
   *  admin sees the audio player without a reload. */
  onUpdateMessage?: (row: RealtimeMessageRow) => void
) {
  const messageRef = useRef(onNewMessage);
  messageRef.current = onNewMessage;
  const updateRef = useRef(onUpdateMessage);
  updateRef.current = onUpdateMessage;

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
          filter: `clinicId=eq.${clinicId}`,

          // no conversation_id filter — this admin needs every conversation's
          // inserts to keep the sidebar accurate; the callback decides what
          // to do with each row based on the currently open thread
        },
        (payload) => {
          messageRef.current(payload.new as unknown as RealtimeMessageRow);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `clinicId=eq.${clinicId}`,
        },
        (payload) => {
          updateRef.current?.(payload.new as unknown as RealtimeMessageRow);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // subscribe once, never tear down/rebuild on activeId change
}

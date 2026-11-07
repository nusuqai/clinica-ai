"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useRealtimeEscalations,
  RealtimeEscalationRow,
  RealtimeStaffAlertRow,
} from "@/hooks/use-realtime-messages";
import { playEscalationSound } from "@/lib/notification-sound";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { fetchNeedsMeCount } from "@/server/actions/conversations";
import { fetchMyOpenReminders } from "@/server/actions/inbox";

interface EscalationAlertsValue {
  hasUnresolved: boolean;
  /** Increments on every insert/resolve event — subscribe to it to react
   * to escalation changes without opening a second realtime channel. */
  eventTick: number;
  /** Conversations waiting on the signed-in member ("needs my response"). */
  needsMeCount: number;
  /** Re-reads the counter (after a reply, an assignment, a reminder change…). */
  refreshNeedsMe: () => void;
  /** Re-arms the reminder timers (after creating / completing a reminder). */
  refreshReminders: () => void;
}

const EscalationContext = createContext<EscalationAlertsValue>({
  hasUnresolved: false,
  eventTick: 0,
  needsMeCount: 0,
  refreshNeedsMe: () => {},
  refreshReminders: () => {},
});

export const useEscalationAlerts = () => useContext(EscalationContext);

interface EscalationProviderProps {
  /** Conversation IDs that already have an unresolved escalation on load. */
  initialConversationIds: string[];
  children: React.ReactNode;
  clinicId: string;
  /** The signed-in team member — their colleague alerts + reminders. */
  userId: string;
  initialNeedsMeCount?: number;
}

// setTimeout overflows past ~24.8 days; re-arm later reminders on the next load.
const MAX_TIMER_MS = 2 ** 31 - 1;

function openConversation(router: ReturnType<typeof useRouter>, conversationId: string) {
  router.push(`/admin/messages?id=${conversationId}`);
}

export default function EscalationProvider({
  initialConversationIds,
  children,
  clinicId,
  userId,
  initialNeedsMeCount = 0,
}: EscalationProviderProps) {
  const router = useRouter();
  // conversationId -> number of unresolved escalations on it
  const countsRef = useRef(new Map<string, number>());
  const [hasUnresolved, setHasUnresolved] = useState(initialConversationIds.length > 0);
  const [eventTick, setEventTick] = useState(0);
  const [needsMeCount, setNeedsMeCount] = useState(initialNeedsMeCount);

  useEffect(() => {
    const counts = countsRef.current;
    counts.clear();
    for (const id of initialConversationIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    setHasUnresolved(counts.size > 0);
    // Only re-seed when the server-provided snapshot actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationIds.join(",")]);

  // ── "Needs my response" counter ────────────────────────────────────────────
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshNeedsMe = useCallback(() => {
    // Coalesce bursts (several realtime events at once) into one request.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchNeedsMeCount()
        .then(setNeedsMeCount)
        .catch((err) => console.error("[inbox] needs-me count failed:", err));
    }, 400);
  }, []);
  useEffect(() => {
    refreshNeedsMe();
  }, [refreshNeedsMe]);

  const bump = (row: RealtimeEscalationRow, delta: 1 | -1) => {
    const counts = countsRef.current;
    const next = (counts.get(row.conversationId) ?? 0) + delta;
    if (next > 0) counts.set(row.conversationId, next);
    else counts.delete(row.conversationId);
    setHasUnresolved(counts.size > 0);
    setEventTick((t) => t + 1);
  };

  const handleStaffAlert = (row: RealtimeStaffAlertRow, event: "insert" | "update") => {
    setEventTick((t) => t + 1);
    refreshNeedsMe();
    if (event !== "insert") return;
    playEscalationSound();
    toast(row.kind === "ESCALATION" ? "تم تصعيد محادثة إليك" : "تم إسناد محادثة إليك", {
      description: row.note ?? undefined,
      duration: 10_000,
      action: { label: "فتح", onClick: () => openConversation(router, row.conversationId) },
    });
  };

  useRealtimeEscalations(
    (row) => {
      bump(row, 1);
      playEscalationSound();
      toast("طلب تصعيد جديد", {
        description: escalationReasonLabel(row.reason),
      });
    },
    (row) => {
      bump(row, -1);
    },
    clinicId,
    { userId, onAlert: handleStaffAlert }
  );

  // ── Reminder timers ────────────────────────────────────────────────────────
  // Each of the member's open reminders gets a timer; when it fires (only while
  // a dashboard tab is open) → toast + sound, and the conversation floats to the
  // top of their inbox. Reminders already due on load get one summary toast.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const firedRef = useRef(new Set<string>());
  const greetedRef = useRef(false);

  const armReminders = useCallback(async () => {
    let reminders: Awaited<ReturnType<typeof fetchMyOpenReminders>>;
    try {
      reminders = await fetchMyOpenReminders();
    } catch (err) {
      console.error("[inbox] reminders load failed:", err);
      return;
    }
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();

    const now = Date.now();
    const overdue = reminders.filter((r) => new Date(r.dueAt).getTime() <= now);
    if (!greetedRef.current && overdue.length > 0) {
      greetedRef.current = true;
      overdue.forEach((r) => firedRef.current.add(r.id));
      toast(`لديك ${overdue.length} تذكير مستحق`, {
        description: overdue[0].note ?? `مراجعة محادثة ${overdue[0].contactName}`,
        duration: 10_000,
        action: {
          label: "فتح",
          onClick: () => openConversation(router, overdue[0].conversationId),
        },
      });
    }
    greetedRef.current = true;

    for (const r of reminders) {
      const delay = new Date(r.dueAt).getTime() - now;
      if (delay <= 0 || delay > MAX_TIMER_MS || firedRef.current.has(r.id)) continue;
      const timer = setTimeout(() => {
        firedRef.current.add(r.id);
        timersRef.current.delete(r.id);
        playEscalationSound();
        toast(`تذكير: ${r.contactName}`, {
          description: r.note ?? "حان وقت مراجعة هذه المحادثة",
          duration: 15_000,
          action: { label: "فتح", onClick: () => openConversation(router, r.conversationId) },
        });
        setEventTick((t) => t + 1);
        refreshNeedsMe();
      }, delay);
      timersRef.current.set(r.id, timer);
    }
  }, [router, refreshNeedsMe]);

  useEffect(() => {
    void armReminders();
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [armReminders]);

  const refreshReminders = useCallback(() => {
    void armReminders();
    refreshNeedsMe();
  }, [armReminders, refreshNeedsMe]);

  return (
    <EscalationContext.Provider
      value={{ hasUnresolved, eventTick, needsMeCount, refreshNeedsMe, refreshReminders }}
    >
      {children}
    </EscalationContext.Provider>
  );
}

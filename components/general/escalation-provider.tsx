"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import {
  useRealtimeEscalations,
  RealtimeEscalationRow,
} from "@/hooks/use-realtime-messages";

interface EscalationAlertsValue {
  hasUnresolved: boolean;
  /** Increments on every insert/resolve event — subscribe to it to react
   * to escalation changes without opening a second realtime channel. */
  eventTick: number;
}

const EscalationContext = createContext<EscalationAlertsValue>({
  hasUnresolved: false,
  eventTick: 0,
});

export const useEscalationAlerts = () => useContext(EscalationContext);

interface EscalationProviderProps {
  /** Conversation IDs that already have an unresolved escalation on load. */
  initialConversationIds: string[];
  children: React.ReactNode;
}

export default function EscalationProvider({
  initialConversationIds,
  children,
}: EscalationProviderProps) {
  const router = useRouter();
  // conversationId -> number of unresolved escalations on it
  const countsRef = useRef(new Map<string, number>());
  const [hasUnresolved, setHasUnresolved] = useState(
    initialConversationIds.length > 0,
  );
  const [eventTick, setEventTick] = useState(0);

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

  const bump = (row: RealtimeEscalationRow, delta: 1 | -1) => {
    const counts = countsRef.current;
    const next = (counts.get(row.conversationId) ?? 0) + delta;
    if (next > 0) counts.set(row.conversationId, next);
    else counts.delete(row.conversationId);
    setHasUnresolved(counts.size > 0);
    setEventTick((t) => t + 1);
  };

  useRealtimeEscalations(
    (row) => {
      bump(row, 1);
      console.log("[escalation] insert payload", row);
      toast("طلب تصعيد جديد", {
        description: row.reason ?? "مستخدم يطلب التحدث مع موظف",
      });
    },
    (row) => {
      console.log("[escalation] resolve payload", row);
      bump(row, -1);
    },
  );

  return (
    <EscalationContext.Provider value={{ hasUnresolved, eventTick }}>
      <Toaster position="top-center" dir="rtl" richColors closeButton />
      {children}
    </EscalationContext.Provider>
  );
}

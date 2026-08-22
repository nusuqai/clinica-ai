"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronLeft, RefreshCw, Eye, EyeOff } from "lucide-react";
import {
  getDayQueueAction,
  advanceQueueAction,
  toggleQueueTrackingAction,
} from "@/server/actions/admin";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import type { AppointmentStatus } from "@prisma/client";

interface QueuePatient {
  id: string;
  orderNumber: number | null;
  patientName: string;
  phone: string | null;
  status: AppointmentStatus;
}
interface QueueData {
  id: string;
  date: string;
  branchName: string | null;
  currentOrder: number;
  nextOrder: number;
  dailyCap: number | null;
  trackCurrentOrder: boolean;
  patients: QueuePatient[];
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function QueuePanel({ doctorId }: { doctorId: string }) {
  const [date, setDate] = useState(todayInput());
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getDayQueueAction(doctorId, date);
    setQueue(res.queue as QueueData | null);
    setLoading(false);
  }, [doctorId, date]);

  useEffect(() => {
    load();
  }, [load]);

  function advance(to: number | null) {
    if (!queue) return;
    startTransition(async () => {
      const res = await advanceQueueAction(queue.id, to);
      if (res?.error) { setError(res.error); return; }
      await load();
    });
  }

  function toggleTracking() {
    if (!queue) return;
    startTransition(async () => {
      const res = await toggleQueueTrackingAction(queue.id, !queue.trackCurrentOrder);
      if (res?.error) { setError(res.error); return; }
      await load();
    });
  }

  const booked = queue ? queue.nextOrder - 1 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-foreground font-sans">اليوم</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          dir="ltr"
          className="border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium font-sans border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground font-sans">جارٍ التحميل...</p>
      ) : !queue ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <p className="text-muted-foreground font-sans">
            لا يوجد طابور دور لهذا اليوم. يظهر الطابور بعد أول حجز في قاعدة توفر بنظام الدور.
          </p>
        </div>
      ) : (
        <>
          {/* Summary + controls */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-wrap items-center gap-5">
            <div>
              <p className="text-xs text-muted-foreground font-sans">يُخدم الآن</p>
              <p className="text-3xl font-heading font-bold text-primary tabular-nums">
                {queue.currentOrder || "—"}
              </p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground font-sans">
                الحجوزات: <span className="text-foreground font-medium">{booked}</span>
                {queue.dailyCap != null && ` / ${queue.dailyCap}`}
              </p>
              {queue.branchName && (
                <p className="text-xs text-muted-foreground font-sans">{queue.branchName}</p>
              )}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <button
                onClick={toggleTracking}
                disabled={isPending}
                title={queue.trackCurrentOrder ? "إخفاء الدور الحالي عن المرضى" : "إظهار الدور الحالي للمرضى"}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium font-sans border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                {queue.trackCurrentOrder ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                {queue.trackCurrentOrder ? "التتبّع مفعّل" : "التتبّع متوقف"}
              </button>
              <button
                onClick={() => advance(null)}
                disabled={isPending || queue.currentOrder >= booked}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                المريض التالي
              </button>
            </div>
          </div>

          {/* Ordered patient list */}
          {queue.patients.length === 0 ? (
            <p className="text-sm text-muted-foreground font-sans">لا يوجد مرضى في الطابور.</p>
          ) : (
            <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
              {queue.patients.map((p) => {
                const isCurrent = p.orderNumber === queue.currentOrder;
                const isDone = p.orderNumber != null && p.orderNumber < queue.currentOrder;
                return (
                  <div
                    key={p.id}
                    className={[
                      "flex items-center justify-between gap-3 px-5 py-3",
                      isCurrent ? "bg-primary/5" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={[
                          "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold font-heading tabular-nums flex-shrink-0",
                          isCurrent
                            ? "bg-primary text-white"
                            : isDone
                              ? "bg-muted text-muted-foreground line-through"
                              : "bg-muted text-foreground",
                        ].join(" ")}
                      >
                        {p.orderNumber ?? "—"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground font-sans truncate">
                          {p.patientName}
                        </p>
                        {p.phone && (
                          <p className="text-xs text-muted-foreground font-sans" dir="ltr">
                            {p.phone}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AppointmentStatusBadge status={p.status} />
                      {p.orderNumber != null && !isDone && !isCurrent && (
                        <button
                          onClick={() => advance(p.orderNumber)}
                          disabled={isPending}
                          className="text-xs font-medium font-sans text-primary hover:underline disabled:opacity-50"
                        >
                          اجعله الحالي
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

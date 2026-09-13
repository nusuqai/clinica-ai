"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ChevronLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
  SkipForward,
  Undo2,
  CheckCircle2,
} from "lucide-react";
import {
  getDayQueueAction,
  toggleQueueTrackingAction,
  skipOrderAction,
  recallOrderAction,
  completeCurrentAndAdvanceAction,
} from "@/server/actions/admin";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import Modal from "@/components/admin/modal";
import type { AppointmentStatus } from "@prisma/client";

interface QueuePatient {
  id: string;
  orderNumber: number | null;
  patientName: string;
  phone: string | null;
  status: AppointmentStatus;
  skipped: boolean;
  expectedTime: string | null;
}
interface QueueData {
  id: string;
  date: string;
  branchName: string | null;
  currentOrder: number;
  nextOrder: number;
  serveNextOrder: number;
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
  const [confirmNext, setConfirmNext] = useState(false);
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

  // "Next patient": completes the patient being served and advances. If someone
  // is currently being served, confirm first (advancing = finishing their exam).
  function handleNextClick() {
    if (!queue) return;
    if (currentPatient) setConfirmNext(true);
    else performNext();
  }

  function performNext() {
    if (!queue) return;
    setConfirmNext(false);
    startTransition(async () => {
      const res = await completeCurrentAndAdvanceAction(queue.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  }

  function toggleTracking() {
    if (!queue) return;
    startTransition(async () => {
      const res = await toggleQueueTrackingAction(queue.id, !queue.trackCurrentOrder);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  }

  function skip(appointmentId: string) {
    startTransition(async () => {
      const res = await skipOrderAction(appointmentId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  }

  function recall(appointmentId: string) {
    startTransition(async () => {
      const res = await recallOrderAction(appointmentId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  }

  const booked = queue ? queue.nextOrder - 1 : 0;

  // The patient currently being served (order == currentOrder, still active).
  // A recalled patient can sit here while still carrying a skip flag, so don't
  // exclude skipped here.
  const currentPatient =
    queue?.patients.find(
      (p) =>
        p.orderNumber === queue.currentOrder && (p.status === "PENDING" || p.status === "CONFIRMED")
    ) ?? null;

  // Is there still a patient to call after the current one?
  const hasNext = queue ? queue.serveNextOrder <= booked : false;
  // Doctor started but no one is being served and nothing is left to call →
  // the queue is done for the day.
  const queueFinished = !!queue && queue.currentOrder > 0 && !currentPatient && !hasNext;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-sans text-sm font-medium text-foreground">اليوم</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          dir="ltr"
          className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-sans text-sm text-muted-foreground">جارٍ التحميل...</p>
      ) : !queue ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا يوجد طابور دور لهذا اليوم. يظهر الطابور بعد أول حجز في قاعدة توفر بنظام الدور.
          </p>
        </div>
      ) : (
        <>
          {/* Summary + controls */}
          <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="font-sans text-xs text-muted-foreground">يُخدم الآن</p>
              <p className="font-heading text-3xl font-bold tabular-nums text-primary">
                {currentPatient ? queue.currentOrder : "—"}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-muted-foreground">التالي</p>
              <p className="font-heading text-3xl font-bold tabular-nums text-muted-foreground">
                {queue.serveNextOrder <= booked ? queue.serveNextOrder : "—"}
              </p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="space-y-0.5">
              <p className="font-sans text-xs text-muted-foreground">
                الحجوزات: <span className="font-medium text-foreground">{booked}</span>
                {queue.dailyCap != null && ` / ${queue.dailyCap}`}
              </p>
              {queue.branchName && (
                <p className="font-sans text-xs text-muted-foreground">{queue.branchName}</p>
              )}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <button
                onClick={toggleTracking}
                disabled={isPending}
                title={
                  queue.trackCurrentOrder
                    ? "إخفاء الدور الحالي عن المرضى"
                    : "إظهار الدور الحالي للمرضى"
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                {queue.trackCurrentOrder ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {queue.trackCurrentOrder ? "التتبّع مفعّل" : "التتبّع متوقف"}
              </button>
              {queueFinished ? (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 font-sans text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  اكتمل الطابور — لا مزيد من المرضى
                </div>
              ) : (
                <>
                  {currentPatient && (
                    <button
                      onClick={() => skip(currentPatient.id)}
                      disabled={isPending}
                      title="تخطّي المريض الحالي مؤقتاً (غير حاضر)"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-2 font-sans text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                    >
                      <SkipForward className="h-4 w-4" />
                      تخطّي
                    </button>
                  )}
                  {(currentPatient || hasNext) && (
                    <button
                      onClick={handleNextClick}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {currentPatient
                        ? "إنهاء واستدعاء التالي"
                        : queue.currentOrder === 0
                          ? "بدء الكشف"
                          : "المريض التالي"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Ordered patient list */}
          {queue.patients.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">لا يوجد مرضى في الطابور.</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {queue.patients.map((p) => {
                const isCurrent = currentPatient?.id === p.id;
                const isDone =
                  !p.skipped && p.orderNumber != null && p.orderNumber < queue.currentOrder;
                // A recalled patient keeps its skip flag while being served; show
                // the "مؤجّل" state only when they're not the one being served.
                const showSkipped = p.skipped && !isCurrent;
                return (
                  <div
                    key={p.id}
                    className={[
                      "flex items-center justify-between gap-3 px-5 py-3",
                      isCurrent ? "bg-primary/5" : showSkipped ? "bg-amber-50/60" : "",
                    ].join(" ")}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={[
                          "inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold tabular-nums",
                          isCurrent
                            ? "bg-primary text-white"
                            : showSkipped
                              ? "bg-amber-100 text-amber-700"
                              : isDone
                                ? "bg-muted text-muted-foreground line-through"
                                : "bg-muted text-foreground",
                        ].join(" ")}
                      >
                        {p.orderNumber ?? "—"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-sans text-sm font-medium text-foreground">
                            {p.patientName}
                          </p>
                          {showSkipped && (
                            <span className="flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-px font-sans text-[10px] font-medium text-amber-700">
                              مؤجّل
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-sans text-xs text-muted-foreground">
                          {p.phone && <span dir="ltr">{p.phone}</span>}
                          {p.expectedTime && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              متوقع ~{p.expectedTime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <AppointmentStatusBadge status={p.status} />
                      {/* Recall is the only per-row action — skip/next live in the
                          controls above and act on the current patient. Not shown
                          for a recalled patient who is already being served. */}
                      {showSkipped && (
                        <button
                          onClick={() => recall(p.id)}
                          disabled={isPending}
                          title="إرجاع المريض ليُخدَم الآن"
                          className="inline-flex items-center gap-1 font-sans text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          إرجاع
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

      <Modal
        open={confirmNext}
        onClose={() => setConfirmNext(false)}
        title="إنهاء كشف المريض الحالي"
      >
        <div className="space-y-4">
          <p className="font-sans text-sm leading-relaxed text-foreground">
            هل أنهى المريض <span className="font-semibold">{currentPatient?.patientName}</span> (دور{" "}
            {currentPatient?.orderNumber}) الكشف؟ سيُعلَّم موعده كمكتمل وينتقل الدور إلى المريض
            التالي.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmNext(false)}
              disabled={isPending}
              className="rounded-xl border border-border px-4 py-2 font-sans text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              onClick={performNext}
              disabled={isPending}
              className="rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "جارٍ..." : "تأكيد الإنهاء والانتقال"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

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
  UserCheck,
} from "lucide-react";
import {
  getDayQueueAction,
  toggleQueueTrackingAction,
  skipOrderAction,
  recallOrderAction,
  completeCurrentAndAdvanceAction,
  markArrivedAction,
} from "@/server/actions/admin";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import type { AppointmentStatus, AvailabilityMode } from "@prisma/client";
import { Card } from "@/components/ui/card";

interface QueuePatient {
  id: string;
  orderNumber: number | null;
  patientName: string;
  phone: string | null;
  status: AppointmentStatus;
  skipped: boolean;
  arrived: boolean;
  expectedTime: string | null;
}
interface QueueData {
  id: string;
  date: string;
  mode: AvailabilityMode;
  branchName: string | null;
  currentOrder: number;
  nextOrder: number;
  nextArrival: number;
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

  // Arrival-priority: check a reserved patient in — hands out their arrival number.
  function markArrived(appointmentId: string) {
    startTransition(async () => {
      const res = await markArrivedAction(appointmentId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await load();
    });
  }

  const isArrival = queue?.mode === "ARRIVAL_BASED";
  // Reservations handed out (both modes cap on nextOrder).
  const booked = queue ? queue.nextOrder - 1 : 0;
  // Highest serving order handed out — the ceiling for "next patient" logic.
  // Order-based: same as booked. Arrival-based: only patients checked in so far.
  const assignedMax = queue ? (isArrival ? queue.nextArrival - 1 : queue.nextOrder - 1) : 0;

  // Arrival-priority reservations not yet checked in (no order number). Reception
  // hands out their number by clicking "وصل" as each patient arrives.
  const reservedPatients = queue
    ? queue.patients.filter(
        (p) => p.orderNumber == null && (p.status === "PENDING" || p.status === "CONFIRMED")
      )
    : [];
  // Patients already in the served order (assigned a number). For order-based
  // this is everyone; for arrival-based it's those who have arrived.
  const orderedPatients = queue ? queue.patients.filter((p) => p.orderNumber != null) : [];

  // The patient currently being served (order == currentOrder, still active).
  // A recalled patient can sit here while still carrying a skip flag, so don't
  // exclude skipped here.
  const currentPatient =
    queue?.patients.find(
      (p) =>
        p.orderNumber === queue.currentOrder && (p.status === "PENDING" || p.status === "CONFIRMED")
    ) ?? null;

  // Is there still a patient to call after the current one?
  const hasNext = queue ? queue.serveNextOrder <= assignedMax : false;
  // Doctor started but no one is being served and nothing is left to call →
  // the queue is done. In arrival mode, reserved patients who haven't arrived
  // yet mean the day isn't over — more numbers may still be handed out.
  const queueFinished =
    !!queue &&
    queue.currentOrder > 0 &&
    !currentPatient &&
    !hasNext &&
    reservedPatients.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="font-sans text-sm font-medium text-foreground">اليوم</Label>
        <FormField type="date" value={date} onValueChange={setDate} className="w-52" />
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          className="h-10 text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary [&_svg]:size-3.5"
        >
          <RefreshCw />
          تحديث
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-sans text-sm text-muted-foreground">جارٍ التحميل...</p>
      ) : !queue ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا يوجد طابور دور لهذا اليوم. يظهر الطابور بعد أول حجز في قاعدة توفر بنظام الدور.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary + controls */}
          <Card className="flex flex-wrap items-center gap-5 p-5">
            <div>
              <p className="font-sans text-xs text-muted-foreground">يُخدم الآن</p>
              <p className="font-heading text-3xl font-bold tabular-nums text-primary">
                {currentPatient ? queue.currentOrder : "—"}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-muted-foreground">التالي</p>
              <p className="font-heading text-3xl font-bold tabular-nums text-muted-foreground">
                {queue.serveNextOrder <= assignedMax ? queue.serveNextOrder : "—"}
              </p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="space-y-0.5">
              <p className="font-sans text-xs text-muted-foreground">
                الحجوزات: <span className="font-medium text-foreground">{booked}</span>
                {queue.dailyCap != null && ` / ${queue.dailyCap}`}
              </p>
              {isArrival && (
                <p className="font-sans text-xs text-muted-foreground">
                  وصلوا: <span className="font-medium text-foreground">{assignedMax}</span>
                  {reservedPatients.length > 0 && ` · بانتظار الوصول: ${reservedPatients.length}`}
                </p>
              )}
              {queue.branchName && (
                <p className="font-sans text-xs text-muted-foreground">{queue.branchName}</p>
              )}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTracking}
                disabled={isPending}
                title={
                  queue.trackCurrentOrder
                    ? "إخفاء الدور الحالي عن المرضى"
                    : "إظهار الدور الحالي للمرضى"
                }
                className="h-9 text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary [&_svg]:size-3.5"
              >
                {queue.trackCurrentOrder ? <Eye /> : <EyeOff />}
                {queue.trackCurrentOrder ? "التتبّع مفعّل" : "التتبّع متوقف"}
              </Button>
              {queueFinished ? (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 font-sans text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  اكتمل الطابور — لا مزيد من المرضى
                </div>
              ) : (
                <>
                  {currentPatient && (
                    <Button
                      variant="outline"
                      onClick={() => skip(currentPatient.id)}
                      disabled={isPending}
                      title="تخطّي المريض الحالي مؤقتاً (غير حاضر)"
                      className="border-amber-300 px-3 text-amber-700 hover:bg-amber-50"
                    >
                      <SkipForward />
                      تخطّي
                    </Button>
                  )}
                  {(currentPatient || hasNext) && (
                    <Button onClick={handleNextClick} disabled={isPending}>
                      <ChevronLeft />
                      {currentPatient
                        ? "إنهاء واستدعاء التالي"
                        : queue.currentOrder === 0
                          ? "بدء الكشف"
                          : "المريض التالي"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Arrival-priority: reserved patients not yet checked in. Reception
              clicks "وصل" as each arrives; that hands out their queue number by
              arrival order and moves them into the ordered list below. */}
          {isArrival && reservedPatients.length > 0 && (
            <Card className="overflow-hidden border-dashed">
              <div className="bg-muted/30 px-5 py-2.5 font-sans text-xs font-medium text-muted-foreground">
                بانتظار الوصول ({reservedPatients.length}) — سجّل وصول المريض ليأخذ رقم دوره حسب
                أسبقية الحضور
              </div>
              <div className="divide-y divide-border">
                {reservedPatients.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-bold text-muted-foreground">
                        —
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-sm font-medium text-foreground">
                          {p.patientName}
                        </p>
                        {p.phone && (
                          <span className="font-sans text-xs text-muted-foreground" dir="ltr">
                            {p.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => markArrived(p.id)}
                      disabled={isPending}
                      title="تسجيل وصول المريض وإعطاؤه رقم الدور"
                      className="shrink-0 px-3"
                    >
                      <UserCheck />
                      وصل
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Ordered patient list */}
          {orderedPatients.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">
              {isArrival && reservedPatients.length > 0
                ? "لم يصل أي مريض بعد."
                : "لا يوجد مرضى في الطابور."}
            </p>
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {orderedPatients.map((p) => {
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
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => recall(p.id)}
                          disabled={isPending}
                          title="إرجاع المريض ليُخدَم الآن"
                          className="h-auto gap-1 px-0 [&_svg]:size-3.5"
                        >
                          <Undo2 />
                          إرجاع
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
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
            <Button
              variant="outline"
              onClick={() => setConfirmNext(false)}
              disabled={isPending}
              className="text-muted-foreground"
            >
              إلغاء
            </Button>
            <Button onClick={performNext} loading={isPending}>
              {isPending ? "جارٍ..." : "تأكيد الإنهاء والانتقال"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

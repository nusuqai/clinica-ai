"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ListOrdered,
  Users,
} from "lucide-react";
import {
  toggleSlotBlockedAction,
  getDoctorDaySlotsAction,
  getDayQueueAction,
} from "@/server/actions/admin";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import type { ScheduleDaySummary } from "@/server/services/doctors";
import type { AppointmentStatus } from "@prisma/client";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface DaySlot {
  id: string;
  startTime: string;
  endTime: string;
  isBlocked: boolean;
  appointment: { status: AppointmentStatus; patientName: string } | null;
}

interface QueuePatient {
  id: string;
  orderNumber: number | null;
  patientName: string;
  phone: string | null;
  status: AppointmentStatus;
  notes: string | null;
  skipped: boolean;
  expectedTime: string | null;
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

interface SlotsTabProps {
  doctorId: string;
  days: ScheduleDaySummary[];
}

function slotCountsFrom(slots: DaySlot[]) {
  const c = { available: 0, booked: 0, blocked: 0 };
  for (const s of slots) {
    if (s.appointment) c.booked++;
    else if (s.isBlocked) c.blocked++;
    else c.available++;
  }
  return c;
}

export default function SlotsTab({ doctorId, days }: SlotsTabProps) {
  const [isPending, startTransition] = useTransition();
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Per-day lazy caches — a day's content is fetched only when it's first opened.
  const [daySlots, setDaySlots] = useState<Record<string, DaySlot[]>>({});
  const [dayQueue, setDayQueue] = useState<Record<string, QueueData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});

  async function loadSlotDay(date: string) {
    setLoading((m) => ({ ...m, [date]: true }));
    setError((m) => ({ ...m, [date]: "" }));
    try {
      const slots = await getDoctorDaySlotsAction(doctorId, date);
      setDaySlots((m) => ({ ...m, [date]: slots }));
    } catch {
      setError((m) => ({ ...m, [date]: "تعذّر تحميل المواعيد" }));
    } finally {
      setLoading((m) => ({ ...m, [date]: false }));
    }
  }

  async function loadQueueDay(date: string) {
    setLoading((m) => ({ ...m, [date]: true }));
    setError((m) => ({ ...m, [date]: "" }));
    try {
      const res = await getDayQueueAction(doctorId, date);
      if (!res.queue) {
        setError((m) => ({ ...m, [date]: "لا يوجد طابور لهذا اليوم" }));
      } else {
        setDayQueue((m) => ({ ...m, [date]: res.queue as QueueData }));
      }
    } catch {
      setError((m) => ({ ...m, [date]: "تعذّر تحميل الطابور" }));
    } finally {
      setLoading((m) => ({ ...m, [date]: false }));
    }
  }

  function toggleDay(day: ScheduleDaySummary) {
    const { date, mode } = day;
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    setOpenDate(date);
    // Already loaded or loading — nothing to fetch.
    const cached = mode === "ORDER_BASED" ? dayQueue[date] : daySlots[date];
    if (cached || loading[date]) return;
    if (mode === "ORDER_BASED") loadQueueDay(date);
    else loadSlotDay(date);
  }

  function handleToggleBlock(slotId: string, date: string) {
    startTransition(async () => {
      const res = await toggleSlotBlockedAction(slotId, doctorId);
      if (res?.error) {
        setError((m) => ({ ...m, [date]: res.error as string }));
        return;
      }
      await loadSlotDay(date); // refresh just this day's rows
    });
  }

  if (days.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl py-16 text-center">
        <p className="text-muted-foreground font-sans">
          لا توجد أيام متاحة. أضف قواعد توفر (مواعيد ثابتة أو نظام الدور) أولاً.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const { date, mode } = day;
        const isOpen = openDate === date;
        const isQueue = mode === "ORDER_BASED";
        const dateObj = new Date(date + "T00:00:00Z");

        // Slot header counts stay fresh after a block toggle by deriving from the
        // loaded rows when available, otherwise the server-provided summary.
        const counts = daySlots[date]
          ? slotCountsFrom(daySlots[date])
          : day.slotCounts;

        return (
          <div
            key={date}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            {/* Collapsible header */}
            <button
              onClick={() => toggleDay(day)}
              className="w-full flex items-center justify-between px-5 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-start"
            >
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="text-sm font-medium text-foreground font-sans">
                  {formatSlotDate(dateObj, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>

                {isQueue ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-px text-[10px] font-medium text-primary font-sans">
                    <ListOrdered className="w-3 h-3" />
                    نظام الدور
                    {day.queue && (
                      <span className="tabular-nums">
                        {" "}· {day.queue.booked} حجز
                        {day.queue.cap != null ? ` / ${day.queue.cap}` : ""}
                      </span>
                    )}
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {counts && counts.available > 0 && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-px rounded-full font-sans">
                        {counts.available} متاح
                      </span>
                    )}
                    {counts && counts.booked > 0 && (
                      <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-px rounded-full font-sans">
                        {counts.booked} محجوز
                      </span>
                    )}
                    {counts && counts.blocked > 0 && (
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-px rounded-full font-sans">
                        {counts.blocked} محظور
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {/* Lazy body */}
            {isOpen && (
              <div className="border-t border-border">
                {loading[date] && (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}

                {error[date] && !loading[date] && (
                  <p className="px-5 py-4 text-sm text-red-600 font-sans">
                    {error[date]}
                  </p>
                )}

                {/* Slot-based day → time slots */}
                {!loading[date] && !isQueue && daySlots[date] && (
                  <SlotList
                    slots={daySlots[date]}
                    isPending={isPending}
                    onToggleBlock={(slotId) => handleToggleBlock(slotId, date)}
                  />
                )}

                {/* Order-based day → who booked the queue */}
                {!loading[date] && isQueue && dayQueue[date] && (
                  <QueueList queue={dayQueue[date]} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Slot-based day: each generated slot with its booking / block state. */
function SlotList({
  slots,
  isPending,
  onToggleBlock,
}: {
  slots: DaySlot[];
  isPending: boolean;
  onToggleBlock: (slotId: string) => void;
}) {
  if (slots.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-muted-foreground font-sans">
        لا توجد مواعيد في هذا اليوم.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border">
      {slots.map((slot) => {
        const isBooked = !!slot.appointment;
        const isBlocked = slot.isBlocked;
        return (
          <div
            key={slot.id}
            className="flex items-center justify-between px-5 py-3 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-sans text-foreground" dir="ltr">
                {formatSlotTime(slot.startTime)} – {formatSlotTime(slot.endTime)}
              </span>
              {isBooked && (
                <div className="flex items-center gap-2 min-w-0">
                  <AppointmentStatusBadge status={slot.appointment!.status} />
                  <span className="text-sm text-muted-foreground font-sans truncate">
                    {slot.appointment!.patientName}
                  </span>
                </div>
              )}
              {!isBooked && !isBlocked && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-sans">
                  متاح
                </span>
              )}
              {isBlocked && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-sans">
                  محظور
                </span>
              )}
            </div>

            {!isBooked && (
              <button
                onClick={() => onToggleBlock(slot.id)}
                disabled={isPending}
                title={isBlocked ? "إتاحة الموعد" : "حظر الموعد"}
                className={[
                  "flex-shrink-0 p-1.5 rounded-lg transition-colors disabled:opacity-40",
                  isBlocked
                    ? "text-emerald-600 hover:bg-emerald-50"
                    : "text-muted-foreground hover:text-red-500 hover:bg-red-50",
                ].join(" ")}
              >
                {isBlocked ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Order-based day: the ordered list of patients who booked the queue. */
function QueueList({ queue }: { queue: QueueData }) {
  const booked = queue.nextOrder - 1;
  return (
    <div>
      {/* Day summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 bg-muted/20 text-xs text-muted-foreground font-sans">
        <span>
          الحجوزات:{" "}
          <span className="text-foreground font-medium tabular-nums">{booked}</span>
          {queue.dailyCap != null && ` / ${queue.dailyCap}`}
        </span>
        <span>
          يُخدم الآن:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {queue.currentOrder || "—"}
          </span>
        </span>
        {queue.branchName && <span>{queue.branchName}</span>}
        {!queue.trackCurrentOrder && <span>التتبّع متوقف</span>}
      </div>

      {queue.patients.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground font-sans">
          لا يوجد مرضى في الطابور.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {queue.patients.map((p) => {
            // A recalled patient sits at currentOrder while still flagged skipped;
            // treat them as current and don't show the "مؤجّل" state on them.
            const isCurrent = p.orderNumber === queue.currentOrder;
            const isDone =
              !p.skipped &&
              p.orderNumber != null &&
              p.orderNumber < queue.currentOrder;
            const showSkipped = p.skipped && !isCurrent;
            return (
              <div
                key={p.id}
                className={[
                  "flex items-start justify-between gap-3 px-5 py-3",
                  isCurrent ? "bg-primary/5" : showSkipped ? "bg-amber-50/60" : "",
                ].join(" ")}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={[
                      "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold font-heading tabular-nums flex-shrink-0",
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
                      <p className="text-sm font-medium text-foreground font-sans truncate">
                        {p.patientName}
                      </p>
                      {showSkipped && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-px rounded-full font-sans flex-shrink-0">
                          مؤجّل
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-sans">
                      {p.phone && <span dir="ltr">{p.phone}</span>}
                      {p.expectedTime && <span>متوقع ~{p.expectedTime}</span>}
                    </div>
                    {p.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground font-sans">
                        <span className="text-foreground/70">ملاحظة:</span>{" "}
                        {p.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <AppointmentStatusBadge status={p.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

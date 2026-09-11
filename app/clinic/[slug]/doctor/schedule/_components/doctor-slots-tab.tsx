"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toggleMySlotBlockedAction } from "@/server/actions/doctor";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import type { DoctorSlot } from "@/server/services/doctors";
import type { AppointmentStatus } from "@prisma/client";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

type FilterStatus = "all" | "available" | "blocked" | "booked";

const FILTER_LABELS: Record<FilterStatus, string> = {
  all: "الكل",
  available: "متاح",
  blocked: "محظور",
  booked: "محجوز",
};

interface DoctorSlotsTabProps {
  slots: DoctorSlot[];
}

export default function DoctorSlotsTab({ slots }: DoctorSlotsTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterStatus>("all");

  function handleToggle(slotId: string) {
    startTransition(async () => {
      const res = await toggleMySlotBlockedAction(slotId);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleCollapse(dateKey: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  function slotStatus(slot: DoctorSlot): FilterStatus {
    if (slot.appointment) return "booked";
    if (slot.isBlocked) return "blocked";
    return "available";
  }

  const grouped = useMemo(() => {
    return slots.reduce<Record<string, DoctorSlot[]>>((acc, slot) => {
      const dateKey = new Date(slot.date).toISOString().split("T")[0];
      (acc[dateKey] ??= []).push(slot);
      return acc;
    }, {});
  }, [slots]);

  const dateKeys = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(Object.keys(grouped).sort().slice(1))
  );

  const totalByStatus = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      all: slots.length,
      available: 0,
      blocked: 0,
      booked: 0,
    };
    for (const slot of slots) counts[slotStatus(slot)]++;
    return counts;
  }, [slots]);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_LABELS) as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors",
              filter === f
                ? "bg-primary text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            {FILTER_LABELS[f]}
            <span
              className={[
                "rounded-full px-1.5 py-px text-[10px] tabular-nums",
                filter === f ? "bg-white/20" : "bg-background",
              ].join(" ")}
            >
              {totalByStatus[f]}
            </span>
          </button>
        ))}
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد مواعيد متاحة. أضف قواعد توفر وقم بتوليد المواعيد أولاً.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {dateKeys.map((dateKey) => {
            const daySlots = grouped[dateKey];
            const filteredSlots =
              filter === "all" ? daySlots : daySlots.filter((s) => slotStatus(s) === filter);
            if (filteredSlots.length === 0) return null;

            const isOpen = !collapsed.has(dateKey);
            const date = new Date(dateKey + "T00:00:00Z");

            const dayCounts = { available: 0, blocked: 0, booked: 0 };
            for (const s of daySlots) dayCounts[slotStatus(s) as Exclude<FilterStatus, "all">]++;

            return (
              <div
                key={dateKey}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <button
                  onClick={() => toggleCollapse(dateKey)}
                  className="flex w-full items-center justify-between bg-muted/30 px-5 py-3 text-start transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-sans text-sm font-medium text-foreground">
                      {formatSlotDate(date, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {dayCounts.available > 0 && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-px font-sans text-[10px] font-medium text-emerald-600">
                          {dayCounts.available} متاح
                        </span>
                      )}
                      {dayCounts.blocked > 0 && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-px font-sans text-[10px] font-medium text-gray-500">
                          {dayCounts.blocked} محظور
                        </span>
                      )}
                      {dayCounts.booked > 0 && (
                        <span className="rounded-full bg-blue-50 px-1.5 py-px font-sans text-[10px] font-medium text-blue-600">
                          {dayCounts.booked} محجوز
                        </span>
                      )}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                </button>

                {isOpen && (
                  <div className="divide-y divide-border">
                    {filteredSlots.map((slot) => {
                      const isBooked = !!slot.appointment;
                      const isBlocked = slot.isBlocked;

                      return (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between gap-3 px-5 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="font-sans text-sm text-foreground" dir="ltr">
                              {formatSlotTime(slot.startTime)}
                              {" – "}
                              {formatSlotTime(slot.endTime)}
                            </span>
                            {isBooked && (
                              <div className="flex min-w-0 items-center gap-2">
                                <AppointmentStatusBadge
                                  status={slot.appointment!.status as AppointmentStatus}
                                />
                                <span className="truncate font-sans text-sm text-muted-foreground">
                                  {slot.appointment!.patient.fullName}
                                </span>
                              </div>
                            )}
                            {!isBooked && !isBlocked && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-sans text-xs font-medium text-emerald-600">
                                متاح
                              </span>
                            )}
                            {isBlocked && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-sans text-xs font-medium text-gray-500">
                                محظور
                              </span>
                            )}
                          </div>

                          {!isBooked && (
                            <button
                              onClick={() => handleToggle(slot.id)}
                              disabled={isPending}
                              title={isBlocked ? "إتاحة الموعد" : "حظر الموعد"}
                              className={[
                                "flex-shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40",
                                isBlocked
                                  ? "text-emerald-600 hover:bg-emerald-50"
                                  : "text-muted-foreground hover:bg-red-50 hover:text-red-500",
                              ].join(" ")}
                            >
                              {isBlocked ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

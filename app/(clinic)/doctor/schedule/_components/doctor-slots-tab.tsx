"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle } from "lucide-react";
import { toggleMySlotBlockedAction } from "@/server/actions/doctor";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DoctorSlot } from "@/server/services/doctors";
import type { AppointmentStatus } from "@prisma/client";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

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
        toast.error(res.error);
        return;
      }
      router.refresh();
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
      <ToggleGroup
        type="single"
        size="sm"
        value={filter}
        // Radix lets a single group deselect; keep one filter always active.
        onValueChange={(v) => v && setFilter(v as FilterStatus)}
        className="mb-4 flex-wrap justify-start gap-2"
      >
        {(Object.keys(FILTER_LABELS) as FilterStatus[]).map((f) => (
          <ToggleGroupItem
            key={f}
            value={f}
            className="rounded-lg bg-muted/60 px-3 text-xs text-muted-foreground"
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
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {slots.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد مواعيد متاحة. أضف قواعد توفر وقم بتوليد المواعيد أولاً.
          </p>
        </Card>
      ) : (
        <Accordion
          type="multiple"
          value={dateKeys.filter((k) => !collapsed.has(k))}
          onValueChange={(open) => setCollapsed(new Set(dateKeys.filter((k) => !open.includes(k))))}
          className="space-y-2"
        >
          {dateKeys.map((dateKey) => {
            const daySlots = grouped[dateKey];
            const filteredSlots =
              filter === "all" ? daySlots : daySlots.filter((s) => slotStatus(s) === filter);
            if (filteredSlots.length === 0) return null;

            const date = new Date(dateKey + "T00:00:00Z");

            const dayCounts = { available: 0, blocked: 0, booked: 0 };
            for (const s of daySlots) dayCounts[slotStatus(s) as Exclude<FilterStatus, "all">]++;

            return (
              <Card key={dateKey} asChild className="overflow-hidden">
                <AccordionItem value={dateKey}>
                  <AccordionTrigger className="gap-3 bg-muted/30 px-5 py-3 font-normal hover:bg-muted/50">
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
                          <Badge className="bg-emerald-50 px-1.5 py-px text-[10px] text-emerald-600">
                            {dayCounts.available} متاح
                          </Badge>
                        )}
                        {dayCounts.blocked > 0 && (
                          <Badge className="bg-gray-100 px-1.5 py-px text-[10px] text-gray-500">
                            {dayCounts.blocked} محظور
                          </Badge>
                        )}
                        {dayCounts.booked > 0 && (
                          <Badge className="bg-blue-50 px-1.5 py-px text-[10px] text-blue-600">
                            {dayCounts.booked} محجوز
                          </Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="divide-y divide-border p-0">
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
                              <Badge className="bg-emerald-50 px-2 text-emerald-600">متاح</Badge>
                            )}
                            {isBlocked && (
                              <Badge className="bg-gray-100 px-2 text-gray-500">محظور</Badge>
                            )}
                          </div>

                          {!isBooked && (
                            <Button
                              variant={isBlocked ? "ghost" : "ghost-destructive"}
                              size="icon"
                              onClick={() => handleToggle(slot.id)}
                              disabled={isPending}
                              title={isBlocked ? "إتاحة الموعد" : "حظر الموعد"}
                              className={
                                isBlocked
                                  ? "shrink-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600"
                                  : "shrink-0"
                              }
                            >
                              {isBlocked ? <CheckCircle /> : <Ban />}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              </Card>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

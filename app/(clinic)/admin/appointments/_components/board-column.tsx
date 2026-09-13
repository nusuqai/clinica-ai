"use client";

import { useDroppable } from "@dnd-kit/core";
import type { AppointmentStatus } from "@prisma/client";
import type { AdminAppointment } from "@/server/services/appointments";
import AppointmentCard from "./appointment-card";

const COLUMN_ACCENTS: Record<AppointmentStatus, string> = {
  PENDING: "border-t-amber-400",
  CONFIRMED: "border-t-blue-400",
  COMPLETED: "border-t-emerald-400",
  CANCELLED: "border-t-red-400",
  NO_SHOW: "border-t-gray-400",
};

interface BoardColumnProps {
  status: AppointmentStatus;
  label: string;
  appointments: AdminAppointment[];
  onOpenDetails: (appointment: AdminAppointment) => void;
}

export default function BoardColumn({
  status,
  label,
  appointments,
  onOpenDetails,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-72 flex-shrink-0 flex-col">
      <div
        className={`flex items-center justify-between rounded-t-xl border-t-4 bg-muted/40 px-3 py-2 ${COLUMN_ACCENTS[status]}`}
      >
        <h3 className="font-heading text-sm font-bold text-foreground">{label}</h3>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground">
          {appointments.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[200px] flex-1 flex-col gap-2 rounded-b-xl border border-t-0 border-border p-2 transition-colors",
          isOver ? "bg-primary/5" : "bg-muted/10",
        ].join(" ")}
      >
        {appointments.length === 0 && (
          <p className="py-6 text-center font-sans text-xs text-muted-foreground">لا توجد مواعيد</p>
        )}
        {appointments.map((appt) => (
          <AppointmentCard key={appt.id} appointment={appt} onOpenDetails={onOpenDetails} />
        ))}
      </div>
    </div>
  );
}

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
}

export default function BoardColumn({ status, label, appointments }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div
        className={`flex items-center justify-between px-3 py-2 border-t-4 bg-muted/40 rounded-t-xl ${COLUMN_ACCENTS[status]}`}
      >
        <h3 className="font-heading font-bold text-sm text-foreground">{label}</h3>
        <span className="text-xs font-sans font-medium text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
          {appointments.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex-1 flex flex-col gap-2 p-2 min-h-[200px] rounded-b-xl border border-t-0 border-border transition-colors",
          isOver ? "bg-primary/5" : "bg-muted/10",
        ].join(" ")}
      >
        {appointments.length === 0 && (
          <p className="text-xs text-muted-foreground font-sans text-center py-6">لا توجد مواعيد</p>
        )}
        {appointments.map((appt) => (
          <AppointmentCard key={appt.id} appointment={appt} />
        ))}
      </div>
    </div>
  );
}

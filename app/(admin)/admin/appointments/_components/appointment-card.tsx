"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { AdminAppointment } from "@/server/services/appointments";
import { getAllowedTransitions } from "@/lib/appointment-transitions";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface AppointmentCardProps {
  appointment: AdminAppointment;
}

export default function AppointmentCard({ appointment }: AppointmentCardProps) {
  const canMove = getAllowedTransitions(appointment.status).length > 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appointment.id,
    disabled: !canMove,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        touchAction: "none",
        position: "relative",
        zIndex: isDragging ? 10 : "auto",
      }}
      className={[
        "bg-card border border-border rounded-xl p-3 shadow-sm font-sans select-none",
        isDragging ? "opacity-40" : "opacity-100",
        canMove ? "cursor-grab active:cursor-grabbing" : "opacity-90",
      ].join(" ")}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground text-sm">{appointment.patient.fullName}</p>
        {canMove && <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        {appointment.doctor.profile.fullName} · {appointment.doctor.specialty}
      </p>

      <p className="text-xs text-muted-foreground mt-2">
        {formatSlotDate(appointment.slot.date)}
      </p>
      <p className="text-xs text-muted-foreground" dir="ltr">
        {formatSlotTime(appointment.slot.startTime)}
        {" – "}
        {formatSlotTime(appointment.slot.endTime)}
      </p>

      {appointment.cancellationReason && (
        <p
          className="text-xs text-red-600 mt-2 bg-red-50 rounded-lg px-2 py-1 line-clamp-2"
          title={appointment.cancellationReason}
        >
          {appointment.cancellationReason}
        </p>
      )}
    </div>
  );
}

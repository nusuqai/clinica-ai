"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { AdminAppointment } from "@/server/services/appointments";
import { getAllowedTransitions } from "@/lib/appointment-transitions";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface AppointmentCardProps {
  appointment: AdminAppointment;
  onOpenDetails: (appointment: AdminAppointment) => void;
}

export default function AppointmentCard({ appointment, onOpenDetails }: AppointmentCardProps) {
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
      // A click (no drag — the sensor needs 6px of movement to start dragging)
      // opens the details popup.
      onClick={() => {
        if (!isDragging) onOpenDetails(appointment);
      }}
      className={[
        "cursor-pointer select-none rounded-xl border border-border bg-card p-3 font-sans shadow-sm",
        isDragging ? "opacity-40" : "opacity-100",
        canMove ? "active:cursor-grabbing" : "opacity-90",
      ].join(" ")}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{appointment.patient.fullName}</p>
        {canMove && <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {appointment.doctor.profile.fullName} · {appointment.doctor.specialty}
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        {appointment.slot
          ? formatSlotDate(appointment.slot.date)
          : appointment.bookingDate
            ? formatSlotDate(appointment.bookingDate)
            : "—"}
      </p>
      {appointment.slot ? (
        <p className="text-xs text-muted-foreground" dir="ltr">
          {formatSlotTime(appointment.slot.startTime)}
          {" – "}
          {formatSlotTime(appointment.slot.endTime)}
        </p>
      ) : appointment.orderNumber != null ? (
        <p className="text-xs text-muted-foreground">دور رقم {appointment.orderNumber}</p>
      ) : null}

      {appointment.cancellationReason && (
        <p
          className="mt-2 line-clamp-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600"
          title={appointment.cancellationReason}
        >
          {appointment.cancellationReason}
        </p>
      )}
    </div>
  );
}

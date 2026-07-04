"use client";

import { useState, useTransition } from "react";
import type { AppointmentStatus } from "@prisma/client";
import { updateAppointmentStatusAction } from "@/server/actions/admin";

const statuses: { value: AppointmentStatus; label: string }[] = [
  { value: "PENDING",   label: "قيد الانتظار" },
  { value: "CONFIRMED", label: "مؤكد" },
  { value: "COMPLETED", label: "مكتمل" },
  { value: "CANCELLED", label: "ملغي" },
  { value: "NO_SHOW",   label: "لم يحضر" },
];

interface AppointmentStatusSelectProps {
  appointmentId: string;
  currentStatus: AppointmentStatus;
}

export default function AppointmentStatusSelect({
  appointmentId,
  currentStatus,
}: AppointmentStatusSelectProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(newStatus: AppointmentStatus) {
    let reason: string | undefined;
    if (newStatus === "CANCELLED") {
      reason = prompt("سبب الإلغاء (اختياري):") ?? undefined;
    }
    setStatus(newStatus);
    setError(null);
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(appointmentId, newStatus, reason);
      if (res?.error) { setError(res.error); setStatus(currentStatus); }
    });
  }

  return (
    <div>
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value as AppointmentStatus)}
        className="text-sm border border-border rounded-lg px-2 py-1 bg-background text-foreground font-sans disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 font-sans mt-1">{error}</p>}
    </div>
  );
}

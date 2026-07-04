"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle } from "lucide-react";
import { cancelAppointmentAction } from "@/server/actions/patient";
import type { AppointmentStatus } from "@prisma/client";

interface Props {
  appointmentId: string;
  status: AppointmentStatus;
}

const cancellable: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export function CancelAppointmentButton({ appointmentId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!cancellable.includes(status)) return null;

  if (!confirmed) {
    return (
      <button
        onClick={() => setConfirmed(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 font-sans"
      >
        <X className="h-3.5 w-3.5" />
        إلغاء الموعد
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setError("");
            startTransition(async () => {
              const res = await cancelAppointmentAction(appointmentId);
              if (!res.ok) setError(res.error ?? "حدث خطأ");
              else setConfirmed(false);
            });
          }}
          disabled={isPending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60 hover:opacity-90 font-sans"
        >
          {isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
        </button>
        <button
          onClick={() => setConfirmed(false)}
          disabled={isPending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted font-sans"
        >
          تراجع
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600 font-sans">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

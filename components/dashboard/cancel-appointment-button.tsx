"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle } from "lucide-react";
import { cancelAppointmentAction } from "@/server/actions/patient";
import { AppointmentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

interface Props {
  appointmentId: string;
  status: AppointmentStatus;
}

const cancellable: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

export function CancelAppointmentButton({ appointmentId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!cancellable.includes(status)) return null;

  if (!confirmed) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmed(true)}
        className="border-red-200 text-red-600 hover:bg-red-50 [&_svg]:size-3.5"
      >
        <X />
        إلغاء الموعد
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            setError("");
            startTransition(async () => {
              const res = await cancelAppointmentAction(appointmentId);
              if (!res.ok) setError(res.error ?? "حدث خطأ");
              else setConfirmed(false);
            });
          }}
          loading={isPending}
          className="bg-red-600 hover:bg-red-700"
        >
          {isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmed(false)}
          disabled={isPending}
          className="text-muted-foreground"
        >
          تراجع
        </Button>
      </div>
      {error && (
        <div className="flex items-center gap-1 font-sans text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

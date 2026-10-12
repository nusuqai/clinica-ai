"use client";

import { X } from "lucide-react";
import { cancelAppointmentAction } from "@/server/actions/patient";
import { AppointmentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
  appointmentId: string;
  status: AppointmentStatus;
}

const cancellable: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

export function CancelAppointmentButton({ appointmentId, status }: Props) {
  const confirm = useConfirm();

  if (!cancellable.includes(status)) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        confirm({
          title: "إلغاء الموعد",
          description: "هل تريد إلغاء هذا الموعد؟",
          warning: "سيُتاح الموعد لغيرك، وستحتاج إلى حجز جديد إن غيّرت رأيك.",
          confirmText: "إلغاء الموعد",
          cancelText: "تراجع",
          onConfirm: async () => {
            const res = await cancelAppointmentAction(appointmentId);
            if (!res.ok) return { error: res.error ?? "حدث خطأ" };
          },
        })
      }
      className="border-red-200 text-red-600 hover:bg-red-50 [&_svg]:size-3.5"
    >
      <X />
      إلغاء الموعد
    </Button>
  );
}

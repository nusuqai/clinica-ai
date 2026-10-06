"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ClipboardList, Check } from "lucide-react";
import {
  updateAppointmentStatusAsDoctorAction,
  updateDoctorNotesAction,
} from "@/server/actions/doctor";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { AppointmentStatus } from "@prisma/client";

interface AppointmentActionsProps {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  currentNotes: string | null;
}

export default function AppointmentActions({
  appointmentId,
  currentStatus,
  currentNotes,
}: AppointmentActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleStatus(status: AppointmentStatus, reason?: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateAppointmentStatusAsDoctorAction(appointmentId, status, reason);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  function handleSaveNotes() {
    setError(null);
    startTransition(async () => {
      const res = await updateDoctorNotesAction(appointmentId, notes);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setNotesOpen(false);
      router.refresh();
    });
  }

  const canConfirm = currentStatus === AppointmentStatus.PENDING;
  const canComplete =
    currentStatus === AppointmentStatus.CONFIRMED || currentStatus === AppointmentStatus.PENDING;
  const canCancel =
    currentStatus === AppointmentStatus.PENDING || currentStatus === AppointmentStatus.CONFIRMED;
  const canNoShow =
    currentStatus === AppointmentStatus.CONFIRMED || currentStatus === AppointmentStatus.PENDING;

  if (!canConfirm && !canComplete && !canCancel) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setNotesOpen(true)}
        className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      >
        <ClipboardList />
        ملاحظات
      </Button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {canConfirm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatus(AppointmentStatus.CONFIRMED)}
            disabled={isPending}
            title="تأكيد الموعد"
            className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 [&_svg]:size-3.5"
          >
            <Check />
            تأكيد
          </Button>
        )}
        {canComplete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatus(AppointmentStatus.COMPLETED)}
            disabled={isPending}
            title="تحديد كمكتمل"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 [&_svg]:size-3.5"
          >
            <CheckCircle />
            مكتمل
          </Button>
        )}
        {canNoShow && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatus(AppointmentStatus.NO_SHOW)}
            disabled={isPending}
            title="لم يحضر"
            className="border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 [&_svg]:size-3.5"
          >
            لم يحضر
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCancelOpen(true)}
            disabled={isPending}
            title="إلغاء الموعد"
            className="border-red-200 bg-red-50 text-red-600 hover:bg-red-100 [&_svg]:size-3.5"
          >
            <XCircle />
            إلغاء
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNotesOpen(true)}
          className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          <ClipboardList />
          ملاحظات
        </Button>
      </div>

      {error && <p className="mt-1 font-sans text-xs text-red-600">{error}</p>}

      {/* Cancel modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء الموعد"
        width="max-w-md"
      >
        <div className="space-y-4">
          <p className="font-sans text-sm text-muted-foreground">
            هل أنت متأكد من إلغاء هذا الموعد؟ يمكنك إضافة سبب للإلغاء.
          </p>
          <FormField
            type="textarea"
            label="سبب الإلغاء (اختياري)"
            value={cancelReason}
            onValueChange={setCancelReason}
            rows={3}
            placeholder="أدخل سبب الإلغاء..."
          />
          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={() => handleStatus(AppointmentStatus.CANCELLED, cancelReason || undefined)}
              loading={isPending}
              className="flex-1"
            >
              {isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
              تراجع
            </Button>
          </div>
        </div>
      </Modal>

      {/* Notes modal */}
      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="ملاحظات الطبيب"
        width="max-w-md"
      >
        <div className="space-y-4">
          <FormField
            type="textarea"
            label="ملاحظات الطبيب"
            value={notes}
            onValueChange={setNotes}
            rows={5}
            placeholder="أضف ملاحظاتك الطبية هنا..."
          />
          {error && <p className="font-sans text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={handleSaveNotes} loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setNotesOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

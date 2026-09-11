"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ClipboardList, Check } from "lucide-react";
import {
  updateAppointmentStatusAsDoctorAction,
  updateDoctorNotesAction,
} from "@/server/actions/doctor";
import Modal from "@/components/admin/modal";
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
      <button
        onClick={() => setNotesOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        ملاحظات
      </button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {canConfirm && (
          <button
            onClick={() => handleStatus(AppointmentStatus.CONFIRMED)}
            disabled={isPending}
            title="تأكيد الموعد"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-sans text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            تأكيد
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => handleStatus(AppointmentStatus.COMPLETED)}
            disabled={isPending}
            title="تحديد كمكتمل"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-sans text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            مكتمل
          </button>
        )}
        {canNoShow && (
          <button
            onClick={() => handleStatus(AppointmentStatus.NO_SHOW)}
            disabled={isPending}
            title="لم يحضر"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-sans text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            لم يحضر
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setCancelOpen(true)}
            disabled={isPending}
            title="إلغاء الموعد"
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 font-sans text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            إلغاء
          </button>
        )}
        <button
          onClick={() => setNotesOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          ملاحظات
        </button>
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
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              سبب الإلغاء (اختياري)
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الإلغاء..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleStatus(AppointmentStatus.CANCELLED, cancelReason || undefined)}
              disabled={isPending}
              className="flex-1 rounded-xl bg-red-500 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              تراجع
            </button>
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
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">ملاحظات الطبيب</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="أضف ملاحظاتك الطبية هنا..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {error && <p className="font-sans text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSaveNotes}
              disabled={isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
            </button>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

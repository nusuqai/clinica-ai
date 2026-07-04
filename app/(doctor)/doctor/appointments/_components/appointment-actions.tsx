"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ClipboardList, Check } from "lucide-react";
import {
  updateAppointmentStatusAsDoctorAction,
  updateDoctorNotesAction,
} from "@/server/actions/doctor";
import Modal from "@/components/admin/modal";
import type { AppointmentStatus } from "@prisma/client";

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
      const res = await updateAppointmentStatusAsDoctorAction(
        appointmentId,
        status,
        reason,
      );
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

  const canConfirm = currentStatus === "PENDING";
  const canComplete = currentStatus === "CONFIRMED" || currentStatus === "PENDING";
  const canCancel = currentStatus === "PENDING" || currentStatus === "CONFIRMED";
  const canNoShow = currentStatus === "CONFIRMED" || currentStatus === "PENDING";

  if (!canConfirm && !canComplete && !canCancel) {
    return (
      <button
        onClick={() => setNotesOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        ملاحظات
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {canConfirm && (
          <button
            onClick={() => handleStatus("CONFIRMED")}
            disabled={isPending}
            title="تأكيد الموعد"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            تأكيد
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => handleStatus("COMPLETED")}
            disabled={isPending}
            title="تحديد كمكتمل"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            مكتمل
          </button>
        )}
        {canNoShow && (
          <button
            onClick={() => handleStatus("NO_SHOW")}
            disabled={isPending}
            title="لم يحضر"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            لم يحضر
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setCancelOpen(true)}
            disabled={isPending}
            title="إلغاء الموعد"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            إلغاء
          </button>
        )}
        <button
          onClick={() => setNotesOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium font-sans border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          ملاحظات
        </button>
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-600 font-sans">{error}</p>
      )}

      {/* Cancel modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء الموعد"
        width="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-sans">
            هل أنت متأكد من إلغاء هذا الموعد؟ يمكنك إضافة سبب للإلغاء.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground font-sans">
              سبب الإلغاء (اختياري)
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الإلغاء..."
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleStatus("CANCELLED", cancelReason || undefined)}
              disabled={isPending}
              className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-red-600 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
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
            <label className="text-sm font-medium text-foreground font-sans">
              ملاحظات الطبيب
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="أضف ملاحظاتك الطبية هنا..."
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 font-sans">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSaveNotes}
              disabled={isPending}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
            </button>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

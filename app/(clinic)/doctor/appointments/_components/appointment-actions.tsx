"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { CheckCircle, XCircle, ClipboardList, Check } from "lucide-react";
import {
  updateAppointmentStatusAsDoctorAction,
  updateDoctorNotesAction,
} from "@/server/actions/doctor";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { AppointmentStatus } from "@prisma/client";
import { Hint } from "@/components/ui/tooltip";
import { CancelReasonForm } from "@/components/appointments/cancel-reason-form";

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

  function handleSaveNotes(notes: string) {
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
          <Hint label="تأكيد الموعد">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatus(AppointmentStatus.CONFIRMED)}
              disabled={isPending}
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 [&_svg]:size-3.5"
            >
              <Check />
              تأكيد
            </Button>
          </Hint>
        )}
        {canComplete && (
          <Hint label="تحديد كمكتمل">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatus(AppointmentStatus.COMPLETED)}
              disabled={isPending}
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 [&_svg]:size-3.5"
            >
              <CheckCircle />
              مكتمل
            </Button>
          </Hint>
        )}
        {canNoShow && (
          <Hint label="لم يحضر">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatus(AppointmentStatus.NO_SHOW)}
              disabled={isPending}
              className="border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 [&_svg]:size-3.5"
            >
              لم يحضر
            </Button>
          </Hint>
        )}
        {canCancel && (
          <Hint label="إلغاء الموعد">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelOpen(true)}
              disabled={isPending}
              className="border-red-200 bg-red-50 text-red-600 hover:bg-red-100 [&_svg]:size-3.5"
            >
              <XCircle />
              إلغاء
            </Button>
          </Hint>
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
        <CancelReasonForm
          prompt="هل أنت متأكد من إلغاء هذا الموعد؟ يمكنك إضافة سبب للإلغاء."
          required={false}
          pending={isPending}
          onConfirm={(reason) => handleStatus(AppointmentStatus.CANCELLED, reason || undefined)}
          onBack={() => setCancelOpen(false)}
        />
      </Modal>

      {/* Notes modal */}
      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="ملاحظات الطبيب"
        width="max-w-md"
      >
        <NotesForm
          initialNotes={currentNotes ?? ""}
          error={error}
          pending={isPending}
          onSave={handleSaveNotes}
          onCancel={() => setNotesOpen(false)}
        />
      </Modal>
    </>
  );
}

/** The doctor's notes editor; its own small form, so typing re-renders only it. */
function NotesForm({
  initialNotes,
  error,
  pending,
  onSave,
  onCancel,
}: {
  initialNotes: string;
  error: string | null;
  pending: boolean;
  onSave: (notes: string) => void;
  onCancel: () => void;
}) {
  const form = useForm<{ notes: string }>({ defaultValues: { notes: initialNotes } });

  return (
    <form onSubmit={form.handleSubmit(({ notes }) => onSave(notes))} className="space-y-4">
      <FormField
        control={form.control}
        name="notes"
        type="textarea"
        label="ملاحظات الطبيب"
        rows={5}
        placeholder="أضف ملاحظاتك الطبية هنا..."
      />
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import RecordForm from "@/components/medical/record-form";
import { Button } from "@/components/ui/button";
import {
  createRecordForAppointmentAction,
  getRecordForAppointmentAction,
  updateRecordAction,
} from "@/server/actions/treatments";
import type { TreatmentRecordView } from "@/server/services/treatments";

// The doctor's write surface for a visit's clinical record. Opened from the
// appointment row; loads any existing record ON OPEN rather than having the
// table embed every record in every row.

interface RecordFormModalProps {
  appointmentId: string;
  patientName: string;
  /** The visit's own date, pre-filled on a new record. */
  defaultVisitDate: Date | string | null;
  /** True when a record already exists — changes the button to "edit". */
  hasRecord: boolean;
}

export default function RecordFormModal({
  appointmentId,
  patientName,
  defaultVisitDate,
  hasRecord,
}: RecordFormModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [record, setRecord] = useState<TreatmentRecordView | null>(null);

  // Load the stored record on open, so the form edits what is actually saved
  // rather than a stale copy captured at render time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getRecordForAppointmentAction(appointmentId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in res && res.error) setLoadError(res.error);
      else setRecord("record" in res ? (res.record ?? null) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, appointmentId]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title={hasRecord ? "تعديل السجل العلاجي" : "إضافة سجل علاجي"}
        className={
          hasRecord
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : undefined
        }
      >
        {hasRecord ? <Pencil /> : <FileText />}
        {hasRecord ? "السجل العلاجي" : "سجل علاجي"}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`السجل العلاجي — ${patientName}`}
        width="max-w-3xl"
      >
        {loading ? (
          <p className="py-8 text-center font-sans text-sm text-muted-foreground">
            جارٍ تحميل السجل...
          </p>
        ) : loadError ? (
          <p className="py-8 text-center font-sans text-sm text-red-600">{loadError}</p>
        ) : (
          <RecordForm
            key={record?.id ?? "new"}
            initial={record}
            defaultVisitDate={defaultVisitDate}
            onCancel={() => setOpen(false)}
            onSubmit={async (payload) => {
              const res = record
                ? await updateRecordAction(record.id, payload)
                : await createRecordForAppointmentAction(appointmentId, payload);
              if (res?.error) return { error: res.error };
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

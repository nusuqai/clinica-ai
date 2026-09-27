"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import RecordForm, { Labeled } from "@/components/medical/record-form";
import { createRecordAsAdminAction, updateRecordAsAdminAction } from "@/server/actions/treatments";
import type { RecordableVisit, TreatmentRecordView } from "@/server/services/treatments";
import { formatSlotDate } from "@/lib/slot-time";

// The admin's write surface for a patient's clinical record, on the patient's
// profile page. Creating requires picking one of the patient's COMPLETED visits
// that has no record yet — the visit decides the treating doctor and the date.
// Editing keeps the record's doctor and visit; only the clinical content
// changes, and the change is audited like a doctor's edit.

const selectClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

type AdminRecordModalProps = {
  patientId: string;
  patientName: string;
} & ({ mode: "create"; visits: RecordableVisit[] } | { mode: "edit"; record: TreatmentRecordView });

export default function AdminRecordModal(props: AdminRecordModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [appointmentId, setAppointmentId] = useState("");

  const isEdit = props.mode === "edit";
  const chosenVisit =
    props.mode === "create" ? (props.visits.find((v) => v.id === appointmentId) ?? null) : null;

  function close() {
    setOpen(false);
    setAppointmentId("");
  }

  return (
    <>
      {isEdit ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
          تعديل
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <FilePlus className="h-4 w-4" />
          إضافة سجل علاجي
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={`${isEdit ? "تعديل السجل العلاجي" : "سجل علاجي جديد"} — ${props.patientName}`}
        width="max-w-3xl"
      >
        {props.mode === "create" && props.visits.length === 0 ? (
          <p className="py-8 text-center font-sans text-sm text-muted-foreground">
            لا توجد زيارات مكتملة بدون سجل علاجي لهذا المريض. يمكن إضافة السجل بعد تحديد الموعد
            كمكتمل.
          </p>
        ) : props.mode === "create" && !chosenVisit ? (
          // Step 1: choose the visit. The form only appears once one is chosen,
          // so the date is set from the visit and nothing typed gets reset.
          <Labeled label="الزيارة المكتملة">
            <select
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
              className={selectClass}
            >
              <option value="">اختر الزيارة...</option>
              {props.visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.date ? formatSlotDate(v.date) : "بدون تاريخ"} — د. {v.doctorName}
                </option>
              ))}
            </select>
          </Labeled>
        ) : (
          <RecordForm
            key={isEdit ? props.record.id : `new-${appointmentId}`}
            initial={isEdit ? props.record : null}
            defaultVisitDate={chosenVisit?.date ?? null}
            onCancel={close}
            header={
              props.mode === "edit" ? (
                <p className="font-sans text-sm text-muted-foreground">
                  الطبيب المعالج:{" "}
                  <span className="font-medium text-foreground">د. {props.record.doctorName}</span>
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 font-sans text-sm">
                  <span className="text-muted-foreground">
                    الزيارة:{" "}
                    <span className="font-medium text-foreground">
                      {chosenVisit?.date ? formatSlotDate(chosenVisit.date) : "بدون تاريخ"} — د.{" "}
                      {chosenVisit?.doctorName}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAppointmentId("")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    تغيير الزيارة
                  </button>
                </div>
              )
            }
            onSubmit={async (payload) => {
              const res =
                props.mode === "edit"
                  ? await updateRecordAsAdminAction(props.record.id, payload)
                  : await createRecordAsAdminAction({
                      patientId: props.patientId,
                      appointmentId,
                      payload,
                    });
              if (res?.error) return { error: res.error };
              close();
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

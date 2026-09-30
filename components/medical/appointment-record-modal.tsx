"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import RecordForm from "@/components/medical/record-form";
import {
  createRecordForAppointmentAction,
  updateRecordAction,
  createRecordAsAdminAction,
  updateRecordAsAdminAction,
} from "@/server/actions/treatments";
import type { TreatmentRecordView } from "@/server/services/treatments";

// The clinical-record write surface ON the appointment detail page — always
// scoped to THIS visit (unlike AdminRecordModal, which makes the admin pick a
// completed visit from a list). One component serves both staff roles; it just
// routes to the role's own server action, which re-checks authorization:
//   DOCTOR — create/edit the record for their own appointment.
//   ADMIN  — file/edit a record for any COMPLETED appointment in their clinic
//            (the action refuses non-completed visits).
// The existing record (if any) is passed in from the page fetch, so there is no
// load-on-open round-trip.

interface AppointmentRecordModalProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
  defaultVisitDate: Date | string | null;
  record: TreatmentRecordView | null;
  role: "DOCTOR" | "ADMIN";
}

export default function AppointmentRecordModal({
  appointmentId,
  patientId,
  patientName,
  defaultVisitDate,
  record,
  role,
}: AppointmentRecordModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hasRecord = record !== null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={[
          "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-sans text-sm font-medium transition-colors",
          hasRecord
            ? "border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            : "bg-primary text-white hover:bg-primary/90",
        ].join(" ")}
      >
        {hasRecord ? <Pencil className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
        {hasRecord ? "تعديل السجل العلاجي" : "إضافة سجل علاجي"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`السجل العلاجي — ${patientName}`}
        width="max-w-3xl"
      >
        <RecordForm
          key={record?.id ?? "new"}
          initial={record}
          defaultVisitDate={defaultVisitDate}
          onCancel={() => setOpen(false)}
          onSubmit={async (payload) => {
            let res: { error?: string } | undefined;
            if (record) {
              res =
                role === "ADMIN"
                  ? await updateRecordAsAdminAction(record.id, payload)
                  : await updateRecordAction(record.id, payload);
            } else {
              res =
                role === "ADMIN"
                  ? await createRecordAsAdminAction({ patientId, appointmentId, payload })
                  : await createRecordForAppointmentAction(appointmentId, payload);
            }
            if (res?.error) return { error: res.error };
            setOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}

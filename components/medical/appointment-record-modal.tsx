"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import RecordForm from "@/components/medical/record-form";
import { Button } from "@/components/ui/button";
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
      <Button variant={hasRecord ? "outline" : "default"} onClick={() => setOpen(true)}>
        {hasRecord ? <Pencil /> : <FilePlus />}
        {hasRecord ? "تعديل السجل العلاجي" : "إضافة سجل علاجي"}
      </Button>

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

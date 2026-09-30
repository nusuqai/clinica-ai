import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireClinicMember } from "@/lib/auth";
import { authorizeAppointmentView } from "@/server/services/appointmentAccess";
import { getAppointmentForDetail } from "@/server/services/appointments";
import { getRecordForAppointment } from "@/server/services/treatments";
import { listAppointmentAttachments } from "@/server/services/attachments";
import AppointmentDetail from "@/components/appointments/appointment-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAppointmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireClinicMember(["ADMIN"]);

  const access = await authorizeAppointmentView(id);
  if (!access.ok) notFound();

  const appt = await getAppointmentForDetail(id, access.clinicId);
  if (!appt) notFound();

  const [record, attachments] = await Promise.all([
    getRecordForAppointment(id, access.clinicId),
    listAppointmentAttachments(id, access.clinicId),
  ]);

  return (
    <AppointmentDetail
      appt={appt}
      record={record}
      attachments={attachments}
      viewerRole={Role.ADMIN}
      canEdit={access.canEdit}
      backHref="/admin/appointments"
      backLabel="المواعيد"
      patientHistoryHref={`/admin/users/${appt.patient.id}`}
    />
  );
}

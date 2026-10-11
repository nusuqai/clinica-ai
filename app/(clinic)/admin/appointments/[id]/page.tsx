import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { can, requirePermission } from "@/lib/auth";
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
  const ctx = await requirePermission(["appointments", "medical_records"]);

  const access = await authorizeAppointmentView(id);
  if (!access.ok) notFound();

  const appt = await getAppointmentForDetail(id, access.clinicId);
  if (!appt) notFound();

  // The clinical side (record + visit files) needs "medical_records"; a member
  // who only manages appointments sees the booking details alone.
  const [record, attachments] = access.canViewRecords
    ? await Promise.all([
        getRecordForAppointment(id, access.clinicId),
        listAppointmentAttachments(id, access.clinicId),
      ])
    : [null, []];

  return (
    <AppointmentDetail
      appt={appt}
      record={record}
      attachments={attachments}
      viewerRole={Role.ADMIN}
      canEdit={access.canEdit}
      showRecords={access.canViewRecords}
      backHref={can(ctx, "appointments") ? "/admin/appointments" : "/admin"}
      backLabel={can(ctx, "appointments") ? "المواعيد" : "الرئيسية"}
      patientHistoryHref={can(ctx, "patients") ? `/admin/patients/${appt.patient.id}` : undefined}
    />
  );
}

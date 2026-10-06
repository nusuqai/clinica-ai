import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { Role } from "@prisma/client";
import { requireClinicMember } from "@/lib/auth";
import { getClinicUser } from "@/server/services/users";
import { listPatientRecords, listRecordableVisits } from "@/server/services/treatments";
import { listAttachmentsForAppointments } from "@/server/services/attachments";
import RecordTimeline from "@/components/medical/record-timeline";
import RecordRevisions from "@/components/medical/record-revisions";
import AppointmentAttachments from "@/components/appointments/appointment-attachments";
import AdminRecordModal from "@/components/medical/admin-record-modal";
import EditPatientModal from "./_components/edit-patient-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<Role, string> = {
  [Role.PATIENT]: "مريض",
  [Role.DOCTOR]: "طبيب",
  [Role.ADMIN]: "مدير العيادة",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { clinic } = await requireClinicMember(["ADMIN"]);

  const user = await getClinicUser(id, clinic.id);
  if (!user) notFound();

  // Clinic-scoped: this clinic's records only. The same person's history at
  // another clinic is not this admin's to see.
  // Completed visits without a record feed the admin's "add record" form —
  // admins may only document a visit that actually happened.
  const isPatient = user.role === Role.PATIENT;
  const [records, recordableVisits] = isPatient
    ? await Promise.all([
        listPatientRecords({ clinicId: clinic.id, patientId: id }),
        listRecordableVisits(clinic.id, id),
      ])
    : [[], []];

  // Files attached to those visits, so each record shows its own attachments
  // (lab results, x-rays, documents) inline alongside the clinical details.
  const appointmentIds = records.flatMap((r) => (r.appointmentId ? [r.appointmentId] : []));
  const attachmentsByAppointment = await listAttachmentsForAppointments(appointmentIds, clinic.id);

  const initials = user.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div>
      <Link
        href={`/admin/users`}
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى المستخدمين
      </Link>

      <Card className="p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <span className="font-sans text-xl font-bold text-primary">{initials}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-foreground">{user.fullName}</h1>
              <Badge>{ROLE_LABEL[user.role]}</Badge>
              {user.claimed ? (
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" />
                  حساب مُفعّل
                </Badge>
              ) : (
                <Badge variant="warning">
                  <ShieldAlert className="h-3 w-3" />
                  عبر واتساب (لم يُفعّل الدخول للموقع)
                </Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4">
              {user.claimed && user.email && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </span>
              )}
              {user.phone && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {user.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {user.appointmentCount} موعد إجمالاً
              </span>
              {user.role === Role.PATIENT && (
                <span className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {records.length} زيارة مسجّلة
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <EditPatientModal
              userId={user.id}
              fullName={user.fullName}
              phone={user.phone}
              email={user.email}
              claimed={user.claimed}
            />
          </div>
        </div>
      </Card>

      {/* Clinical history — patients only; staff have no treatment records. */}
      {isPatient && (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-bold text-foreground">السجل العلاجي</h2>
            <AdminRecordModal
              mode="create"
              patientId={user.id}
              patientName={user.fullName}
              visits={recordableVisits}
            />
          </div>
          <RecordTimeline
            records={records}
            emptyMessage="لا يوجد سجل علاجي لهذا المريض بعد"
            appointmentBasePath="/admin/appointments"
            renderRevisionBadge={(record) => <RecordRevisions record={record} />}
            renderAttachments={(record) =>
              record.appointmentId ? (
                <AppointmentAttachments
                  appointmentId={record.appointmentId}
                  attachments={attachmentsByAppointment[record.appointmentId] ?? []}
                  canManage
                />
              ) : null
            }
            recordAction={(record) => (
              <AdminRecordModal
                mode="edit"
                patientId={user.id}
                patientName={user.fullName}
                record={record}
              />
            )}
          />
        </section>
      )}
    </div>
  );
}

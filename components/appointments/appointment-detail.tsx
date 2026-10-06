import Link from "next/link";
import {
  ArrowRight,
  Stethoscope,
  MapPin,
  Calendar,
  Clock,
  StickyNote,
  User,
  Phone,
  Banknote,
  Star,
  CalendarClock,
  FileText,
  ListOrdered,
  History,
} from "lucide-react";
import { Role } from "@prisma/client";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RecordTimeline from "@/components/medical/record-timeline";
import RecordRevisions from "@/components/medical/record-revisions";
import AppointmentRecordModal from "@/components/medical/appointment-record-modal";
import AppointmentAttachments from "@/components/appointments/appointment-attachments";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import type { AppointmentDetailView } from "@/server/services/appointments";
import type { TreatmentRecordView } from "@/server/services/treatments";
import type { AttachmentView } from "@/server/services/attachments";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

// The full page for one appointment — shared by the doctor, admin and patient
// routes. They differ only in `canEdit` (staff may write the clinical record +
// attachments; a patient is read-only) and in the back link. Everything shown is
// already clinic-scoped and authorized by the route that renders this.

interface Props {
  appt: AppointmentDetailView;
  record: TreatmentRecordView | null;
  attachments: AttachmentView[];
  viewerRole: Role;
  canEdit: boolean;
  /** Back link target for this role's appointment list. */
  backHref: string;
  backLabel: string;
  /** Staff-only: link to this patient's full clinical history. */
  patientHistoryHref?: string | null;
}

export default function AppointmentDetail({
  appt,
  record,
  attachments,
  viewerRole,
  canEdit,
  backHref,
  backLabel,
  patientHistoryHref,
}: Props) {
  const isStaff = viewerRole === Role.DOCTOR || viewerRole === Role.ADMIN;
  const visitDate = appt.slot?.date ?? appt.bookingDate;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12">
      {/* Header */}
      <div>
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold text-foreground">تفاصيل الموعد</h1>
          <AppointmentStatusBadge status={appt.status} />
        </div>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          تم الحجز في {formatSlotDate(appt.createdAt)}
        </p>
      </div>

      {/* Scheduling */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="border-b border-border bg-muted/30 px-5 py-4">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
            <Calendar className="h-4 w-4" />
            بيانات الموعد
          </h2>
        </header>
        <div className="divide-y divide-border">
          <Row icon={Stethoscope} label="الطبيب">
            د. {appt.doctor.fullName}
            {appt.doctor.specialty ? ` · ${appt.doctor.specialty}` : ""}
          </Row>
          <Row icon={MapPin} label="الفرع">
            {appt.branch?.name ?? "—"}
            {appt.branch?.address ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {appt.branch.address}
              </span>
            ) : null}
          </Row>
          <Row icon={Calendar} label="التاريخ">
            {visitDate ? formatSlotDate(visitDate) : "—"}
          </Row>
          {appt.slot ? (
            <Row icon={Clock} label="الوقت">
              <span dir="ltr">
                {formatSlotTime(appt.slot.startTime)} – {formatSlotTime(appt.slot.endTime)}
              </span>
            </Row>
          ) : (
            <Row icon={ListOrdered} label={appt.arrivalBased ? "أسبقية الحضور" : "الدور"}>
              <QueueValue appt={appt} />
            </Row>
          )}
          {(appt.doctor.examinationFee != null || appt.doctor.consultationFee != null) && (
            <Row icon={Banknote} label="سعر الكشف">
              {appt.doctor.examinationFee != null ? `${appt.doctor.examinationFee} جنيه` : "—"}
            </Row>
          )}
          {appt.patientNotes && (
            <Row icon={StickyNote} label="ملاحظات المريض">
              <span className="whitespace-pre-wrap">{appt.patientNotes}</span>
            </Row>
          )}
          {appt.doctorNotes && (
            <Row icon={StickyNote} label="ملاحظات الطبيب">
              <span className="whitespace-pre-wrap">{appt.doctorNotes}</span>
            </Row>
          )}
          {appt.cancellationReason && (
            <div className="px-5 py-3">
              <Alert variant="destructive" className="block px-3 py-2">
                <span className="font-medium">سبب الإلغاء: </span>
                {appt.cancellationReason}
              </Alert>
            </div>
          )}
        </div>
      </section>

      {/* Patient */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
            <User className="h-4 w-4" />
            المريض
          </h2>
          {isStaff && patientHistoryHref && (
            <Link
              href={patientHistoryHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              السجل الكامل للمريض
            </Link>
          )}
        </header>
        <div className="divide-y divide-border">
          <Row icon={User} label="الاسم">
            {appt.patient.fullName}
          </Row>
          {isStaff && appt.patient.phone && (
            <Row icon={Phone} label="الهاتف">
              <span dir="ltr">{appt.patient.phone}</span>
            </Row>
          )}
        </div>
      </section>

      {/* Clinical record for THIS visit */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
            <FileText className="h-5 w-5" />
            السجل العلاجي لهذه الزيارة
          </h2>
          {canEdit && (
            <AppointmentRecordModal
              appointmentId={appt.id}
              patientId={appt.patient.id}
              patientName={appt.patient.fullName}
              defaultVisitDate={visitDate}
              record={record}
              role={viewerRole === Role.ADMIN ? "ADMIN" : "DOCTOR"}
            />
          )}
        </div>
        {record ? (
          <RecordTimeline
            records={[record]}
            renderRevisionBadge={canEdit ? (r) => <RecordRevisions record={r} /> : undefined}
          />
        ) : (
          <Card className="py-10 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-sans font-medium text-muted-foreground">
              لا يوجد سجل علاجي لهذه الزيارة بعد
            </p>
            {canEdit && viewerRole === Role.ADMIN && (
              <p className="mt-1 font-sans text-xs text-muted-foreground">
                يمكن إضافة سجل للمواعيد المكتملة فقط
              </p>
            )}
          </Card>
        )}
      </section>

      {/* Attachments */}
      <AppointmentAttachments
        appointmentId={appt.id}
        attachments={attachments}
        canManage={canEdit}
      />

      {/* Feedback */}
      {appt.feedback && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <header className="border-b border-border bg-muted/30 px-5 py-4">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
              <Star className="h-4 w-4" />
              تقييم المريض
            </h2>
          </header>
          <div className="space-y-2 px-5 py-4">
            {appt.feedback.rating != null && (
              <div className="flex items-center gap-1" aria-label={`${appt.feedback.rating} من 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={
                      n <= (appt.feedback!.rating ?? 0)
                        ? "h-5 w-5 fill-amber-400 text-amber-400"
                        : "h-5 w-5 text-muted-foreground/30"
                    }
                  />
                ))}
              </div>
            )}
            {appt.feedback.comment && (
              <p className="whitespace-pre-wrap font-sans text-sm text-foreground/90">
                {appt.feedback.comment}
              </p>
            )}
            <p className="font-sans text-xs text-muted-foreground">
              {formatSlotDate(appt.feedback.createdAt)}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 font-sans text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

// The queue / arrival-priority status line for a non-slot booking.
function QueueValue({ appt }: { appt: AppointmentDetailView }) {
  if (appt.arrivalBased && !appt.arrived) {
    return <span>يُعطى رقم الدور عند الوصول للعيادة حسب أسبقية الحضور</span>;
  }
  if (appt.orderNumber == null) return <>—</>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>دور رقم {appt.orderNumber}</span>
      {appt.currentOrder != null && (
        <span className="text-xs text-muted-foreground">الجاري الآن: {appt.currentOrder}</span>
      )}
      {appt.estimatedWaitMin != null && (
        <span className="text-xs text-muted-foreground">
          انتظار تقديري: {appt.estimatedWaitMin} دقيقة
        </span>
      )}
      {appt.expectedTime && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          {appt.expectedTime}
        </span>
      )}
    </span>
  );
}

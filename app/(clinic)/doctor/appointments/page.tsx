import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { getDoctorAppointments } from "@/server/services/appointments";
import { mapRecordsByAppointment } from "@/server/services/treatments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RecordFormModal from "@/components/medical/record-form-modal";
import AppointmentActions from "./_components/appointment-actions";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function DoctorAppointmentsPage({ searchParams }: PageProps) {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/`);

  const { status } = await searchParams;
  const filterStatus = Object.keys(APPOINTMENT_STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await getDoctorAppointments(doctor.id, {
    status: filterStatus,
  });

  // Which of these visits already have a clinical record — one query for the
  // whole page rather than one per row.
  const recordsByAppointment = await mapRecordsByAppointment(
    appointments.map((a) => a.id),
    ctx.clinic.id
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">المواعيد</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">{appointments.length} موعد</p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href={`/doctor/appointments`}
          className={[
            "rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors",
            !filterStatus
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          الكل
        </a>
        {(Object.entries(APPOINTMENT_STATUS_LABELS) as [AppointmentStatus, string][]).map(
          ([val, label]) => (
            <a
              key={val}
              href={`/doctor/appointments?status=${val}`}
              className={[
                "rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors",
                filterStatus === val
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              ].join(" ")}
            >
              {label}
            </a>
          )
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  المريض
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  التاريخ
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الوقت
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الحالة
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  ملاحظات المريض
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الإجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {appointments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                    لا توجد مواعيد
                  </TableCell>
                </TableRow>
              )}
              {appointments.map((appt) => {
                return (
                  <TableRow key={appt.id} className="align-top transition-colors hover:bg-muted/30">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <span className="text-xs font-bold text-primary">
                            {appt.patient.fullName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{appt.patient.fullName}</p>
                          {appt.patient.phone && (
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {appt.patient.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {appt.slot
                        ? formatSlotDate(appt.slot.date)
                        : appt.bookingDate
                          ? formatSlotDate(appt.bookingDate)
                          : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {appt.slot ? (
                        <>
                          {formatSlotTime(appt.slot.startTime)}
                          {" – "}
                          {formatSlotTime(appt.slot.endTime)}
                        </>
                      ) : appt.orderNumber != null ? (
                        <span dir="rtl">دور رقم {appt.orderNumber}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <AppointmentStatusBadge status={appt.status} />
                      {appt.cancellationReason && (
                        <p
                          className="mt-1 max-w-[120px] truncate text-xs text-muted-foreground"
                          title={appt.cancellationReason}
                        >
                          {appt.cancellationReason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[160px] px-4 py-3 text-muted-foreground">
                      <p className="truncate text-xs" title={appt.patientNotes ?? ""}>
                        {appt.patientNotes || "—"}
                      </p>
                      {appt.doctorNotes && (
                        <p
                          className="mt-0.5 truncate text-xs text-primary"
                          title={appt.doctorNotes}
                        >
                          ✍ {appt.doctorNotes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1.5">
                        <AppointmentActions
                          appointmentId={appt.id}
                          currentStatus={appt.status}
                          currentNotes={appt.doctorNotes}
                        />
                        <RecordFormModal
                          appointmentId={appt.id}
                          patientName={appt.patient.fullName}
                          defaultVisitDate={appt.slot?.date ?? appt.bookingDate}
                          hasRecord={recordsByAppointment.has(appt.id)}
                        />
                        <Link
                          href={`/doctor/appointments/${appt.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          التفاصيل
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

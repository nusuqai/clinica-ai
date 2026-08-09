import { redirect } from "next/navigation";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { getDoctorAppointments } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import AppointmentActions from "./_components/appointment-actions";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function DoctorAppointmentsPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/clinic/${slug}`);
  const base = `/clinic/${slug}`;

  const { status } = await searchParams;
  const filterStatus = Object.keys(APPOINTMENT_STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await getDoctorAppointments(doctor.id, {
    status: filterStatus,
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">المواعيد</h1>
          <p className="text-sm text-muted-foreground mt-1 font-sans">
            {appointments.length} موعد
          </p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <a
          href={`${base}/doctor/appointments`}
          className={[
            "px-3 py-1.5 rounded-full text-sm font-sans font-medium transition-colors",
            !filterStatus
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          الكل
        </a>
        {(
          Object.entries(APPOINTMENT_STATUS_LABELS) as [
            AppointmentStatus,
            string,
          ][]
        ).map(([val, label]) => (
            <a
              key={val}
              href={`${base}/doctor/appointments?status=${val}`}
              className={[
                "px-3 py-1.5 rounded-full text-sm font-sans font-medium transition-colors",
                filterStatus === val
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              ].join(" ")}
            >
              {label}
            </a>
          ),
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  المريض
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  التاريخ
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الوقت
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الحالة
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  ملاحظات المريض
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {appointments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-16 text-muted-foreground"
                  >
                    لا توجد مواعيد
                  </td>
                </tr>
              )}
              {appointments.map((appt) => {
                return (
                  <tr
                    key={appt.id}
                    className="hover:bg-muted/30 transition-colors align-top"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {appt.patient.fullName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {appt.patient.fullName}
                          </p>
                          {appt.patient.phone && (
                            <p
                              className="text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {appt.patient.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatSlotDate(appt.slot.date)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {formatSlotTime(appt.slot.startTime)}
                      {" – "}
                      {formatSlotTime(appt.slot.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentStatusBadge status={appt.status} />
                      {appt.cancellationReason && (
                        <p
                          className="text-xs text-muted-foreground mt-1 max-w-[120px] truncate"
                          title={appt.cancellationReason}
                        >
                          {appt.cancellationReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px]">
                      <p className="truncate text-xs" title={appt.patientNotes ?? ""}>
                        {appt.patientNotes || "—"}
                      </p>
                      {appt.doctorNotes && (
                        <p
                          className="truncate text-xs text-primary mt-0.5"
                          title={appt.doctorNotes}
                        >
                          ✍ {appt.doctorNotes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentActions
                        appointmentId={appt.id}
                        currentStatus={appt.status}
                        currentNotes={appt.doctorNotes}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

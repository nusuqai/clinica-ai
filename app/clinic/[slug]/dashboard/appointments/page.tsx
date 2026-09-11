import { requireClinicMember } from "@/lib/auth";
import { getPatientAppointments } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { CancelAppointmentButton } from "@/components/dashboard/cancel-appointment-button";
import PageHeader from "@/components/admin/page-header";
import Link from "next/link";
import { CalendarPlus, CalendarDays } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function PatientAppointmentsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["PATIENT"]);
  const base = `/clinic/${slug}`;

  const { status } = await searchParams;
  const filterStatus = Object.keys(APPOINTMENT_STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await getPatientAppointments(ctx.user.id, {
    status: filterStatus,
  });

  return (
    <div>
      <PageHeader
        title="مواعيدي"
        subtitle={`${appointments.length} موعد`}
        action={
          <Link
            href={`${base}/dashboard/book`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-sans text-sm font-medium text-white hover:opacity-90"
          >
            <CalendarPlus className="h-4 w-4" />
            احجز موعداً
          </Link>
        }
      />

      {/* Filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href={`${base}/dashboard/appointments`}
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
              href={`${base}/dashboard/appointments?status=${val}`}
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

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-sans text-sm text-muted-foreground">لا توجد مواعيد</p>
            <Link
              href={`${base}/dashboard/book`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white hover:opacity-90"
            >
              <CalendarPlus className="h-4 w-4" />
              احجز موعداً الآن
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-sans text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">الطبيب</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">التخصص</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    التاريخ
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">الوقت</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.map((appt) => {
                  return (
                    <tr key={appt.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        د. {appt.doctor.profile.fullName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{appt.doctor.specialty}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {appt.slot
                          ? formatSlotDate(appt.slot.date)
                          : appt.bookingDate
                            ? formatSlotDate(appt.bookingDate)
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {appt.slot ? (
                          <>
                            {formatSlotTime(appt.slot.startTime)}
                            {" – "}
                            {formatSlotTime(appt.slot.endTime)}
                          </>
                        ) : appt.orderNumber != null ? (
                          <span dir="rtl" className="text-foreground">
                            دورك رقم {appt.orderNumber}
                            {appt.expectedTime && (
                              <span className="text-muted-foreground">
                                {" "}
                                · متوقع ~{appt.expectedTime}
                              </span>
                            )}
                            {appt.currentOrder != null && (
                              <span className="text-muted-foreground">
                                {" "}
                                (الآن: {appt.currentOrder}
                                {appt.estimatedWaitMin != null && ` · ~${appt.estimatedWaitMin} د`})
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={appt.status} />
                        {appt.cancellationReason && (
                          <p
                            className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground"
                            title={appt.cancellationReason}
                          >
                            {appt.cancellationReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CancelAppointmentButton appointmentId={appt.id} status={appt.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

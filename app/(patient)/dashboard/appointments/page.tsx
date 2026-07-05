import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPatientAppointments } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { CancelAppointmentButton } from "@/components/dashboard/cancel-appointment-button";
import PageHeader from "@/components/admin/page-header";
import Link from "next/link";
import { CalendarPlus, CalendarDays } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  NO_SHOW: "لم يحضر",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function PatientAppointmentsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { status } = await searchParams;
  const filterStatus = Object.keys(STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await getPatientAppointments(user.id, {
    status: filterStatus,
  });

  return (
    <div>
      <PageHeader
        title="مواعيدي"
        subtitle={`${appointments.length} موعد`}
        action={
          <Link
            href="/dashboard/book"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 font-sans"
          >
            <CalendarPlus className="h-4 w-4" />
            احجز موعداً
          </Link>
        }
      />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <a
          href="/dashboard/appointments"
          className={[
            "px-3 py-1.5 rounded-full text-sm font-sans font-medium transition-colors",
            !filterStatus
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          الكل
        </a>
        {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([val, label]) => (
          <a
            key={val}
            href={`/dashboard/appointments?status=${val}`}
            className={[
              "px-3 py-1.5 rounded-full text-sm font-sans font-medium transition-colors",
              filterStatus === val
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            ].join(" ")}
          >
            {label}
          </a>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground font-sans text-sm">لا توجد مواعيد</p>
            <Link
              href="/dashboard/book"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 font-sans"
            >
              <CalendarPlus className="h-4 w-4" />
              احجز موعداً الآن
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">الطبيب</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">التخصص</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">الوقت</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.map((appt) => {
                  return (
                    <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        د. {appt.doctor.profile.fullName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{appt.doctor.specialty}</td>
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
                            className="text-xs text-muted-foreground mt-1 max-w-[140px] truncate"
                            title={appt.cancellationReason}
                          >
                            {appt.cancellationReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CancelAppointmentButton
                          appointmentId={appt.id}
                          status={appt.status}
                        />
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

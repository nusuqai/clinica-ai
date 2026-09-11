import Link from "next/link";
import { requireClinicMember } from "@/lib/auth";
import { getPatientAppointments, getPatientStats } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { CalendarDays, CalendarPlus, CheckCircle, XCircle, Clock } from "lucide-react";

export default async function PatientDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["PATIENT"]);
  const base = `/clinic/${slug}`;

  const [stats, upcoming] = await Promise.all([
    getPatientStats(ctx.user.id),
    getPatientAppointments(ctx.user.id, { upcoming: true, limit: 3 }),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">نظرة عامة على مواعيدك</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="font-sans text-sm text-muted-foreground">إجمالي المواعيد</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-foreground">{stats.upcoming}</p>
            <p className="font-sans text-sm text-muted-foreground">قادمة</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-foreground">{stats.completed}</p>
            <p className="font-sans text-sm text-muted-foreground">مكتملة</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
            <XCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-foreground">{stats.cancelled}</p>
            <p className="font-sans text-sm text-muted-foreground">ملغاة</p>
          </div>
        </div>
      </div>

      {/* Upcoming appointments */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading font-semibold text-foreground">المواعيد القادمة</h2>
          <Link
            href={`${base}/dashboard/appointments`}
            className="font-sans text-sm text-primary hover:underline"
          >
            عرض الكل
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-sans text-sm text-muted-foreground">لا توجد مواعيد قادمة</p>
            <Link
              href={`${base}/dashboard/book`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white hover:opacity-90"
            >
              <CalendarPlus className="h-4 w-4" />
              احجز موعدك الأول
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((appt) => {
              return (
                <li key={appt.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-sans font-medium text-foreground">
                        د. {appt.doctor.profile.fullName}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground">
                        {appt.doctor.specialty}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <AppointmentStatusBadge status={appt.status} />
                    <p className="font-sans text-xs text-muted-foreground">
                      {appt.slot ? (
                        <>
                          {formatSlotDate(appt.slot.date, { day: "numeric", month: "short" })}
                          {" • "}
                          <span dir="ltr">
                            {formatSlotTime(appt.slot.startTime)}
                            {" – "}
                            {formatSlotTime(appt.slot.endTime)}
                          </span>
                        </>
                      ) : (
                        <>
                          {appt.bookingDate &&
                            formatSlotDate(appt.bookingDate, { day: "numeric", month: "short" })}
                          {appt.orderNumber != null && ` • دورك رقم ${appt.orderNumber}`}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href={`${base}/dashboard/book`}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <CalendarPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="font-sans font-medium text-foreground">احجز موعداً جديداً</p>
            <p className="font-sans text-sm text-muted-foreground">اختر طبيبك والوقت المناسب</p>
          </div>
        </Link>
        <Link
          href={`${base}/dashboard/appointments`}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <p className="font-sans font-medium text-foreground">عرض جميع المواعيد</p>
            <p className="font-sans text-sm text-muted-foreground">تاريخك الطبي الكامل</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

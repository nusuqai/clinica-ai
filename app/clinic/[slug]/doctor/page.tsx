import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, CheckCircle, Users, ChevronLeft } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorStats, getDoctorByProfileId } from "@/server/services/doctors";
import { getDoctorAppointments } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

export default async function DoctorDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/`);

  const [stats, upcoming] = await Promise.all([
    getDoctorStats(doctor.id),
    getDoctorAppointments(doctor.id, { upcoming: true, limit: 5 }),
  ]);

  const firstName = (ctx.user.profile.fullName || doctor.fullName)?.split(" ")[0] ?? "دكتور";

  return (
    <div>
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-foreground">أهلاً، {firstName} 👋</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          {new Date().toLocaleDateString("ar-EG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* KPI grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="مواعيد اليوم"
          value={stats.todayCount}
          icon={CalendarDays}
          color="primary"
        />
        <StatCard label="قيد الانتظار" value={stats.pendingCount} icon={Clock} color="amber" />
        <StatCard label="مكتملة" value={stats.completedCount} icon={CheckCircle} color="green" />
        <StatCard
          label="إجمالي المرضى"
          value={stats.uniquePatientsCount}
          icon={Users}
          color="accent"
        />
      </div>

      {/* Upcoming appointments */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-heading font-semibold text-foreground">المواعيد القادمة</h2>
            <p className="mt-0.5 font-sans text-xs text-muted-foreground">
              {upcoming.length === 0 ? "لا توجد مواعيد قادمة" : `${upcoming.length} موعد`}
            </p>
          </div>
          <Link
            href={`/doctor/appointments`}
            className="inline-flex items-center gap-1 font-sans text-sm font-medium text-primary hover:underline"
          >
            عرض الكل
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-sans text-sm text-muted-foreground">لا توجد مواعيد قادمة</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((appt) => {
              return (
                <li
                  key={appt.id}
                  className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <span className="font-sans text-sm font-bold text-primary">
                        {appt.patient.fullName.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-sans font-medium text-foreground">
                        {appt.patient.fullName}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground">
                        {appt.slot ? (
                          <>
                            {formatSlotDate(appt.slot.date, { day: "numeric", month: "short" })}
                            {" · "}
                            <span dir="ltr" className="inline">
                              {formatSlotTime(appt.slot.startTime)}
                              {" – "}
                              {formatSlotTime(appt.slot.endTime)}
                            </span>
                          </>
                        ) : (
                          <>
                            {appt.bookingDate &&
                              formatSlotDate(appt.bookingDate, { day: "numeric", month: "short" })}
                            {appt.orderNumber != null && ` · دور رقم ${appt.orderNumber}`}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <QuickLink
          href={`/doctor/appointments`}
          label="إدارة المواعيد"
          icon={CalendarDays}
        />
        <QuickLink href={`/doctor/schedule`} label="جدول العمل" icon={Clock} />
        <QuickLink href={`/doctor/patients`} label="قائمة المرضى" icon={Users} />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "primary" | "accent" | "green" | "amber" | "red";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600",
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <div
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${colorMap[color]}`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-heading text-2xl font-bold text-foreground">{value}</p>
        <p className="font-sans text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:bg-primary/5"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <span className="font-sans text-sm font-medium text-foreground">{label}</span>
      <ChevronLeft className="mr-auto h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

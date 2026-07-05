import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  CheckCircle,
  Users,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getDoctorStats } from "@/server/services/doctors";
import { getDoctorAppointments } from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

export default async function DoctorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [stats, upcoming] = await Promise.all([
    getDoctorStats(user.id),
    getDoctorAppointments(user.id, { upcoming: true, limit: 5 }),
  ]);

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });

  const firstName = profile?.fullName?.split(" ")[0] ?? "دكتور";

  return (
    <div>
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          أهلاً، {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-sans">
          {new Date().toLocaleDateString("ar-EG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="مواعيد اليوم"
          value={stats.todayCount}
          icon={CalendarDays}
          color="primary"
        />
        <StatCard
          label="قيد الانتظار"
          value={stats.pendingCount}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="مكتملة"
          value={stats.completedCount}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          label="إجمالي المرضى"
          value={stats.uniquePatientsCount}
          icon={Users}
          color="accent"
        />
      </div>

      {/* Upcoming appointments */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-heading font-semibold text-foreground">
              المواعيد القادمة
            </h2>
            <p className="text-xs text-muted-foreground font-sans mt-0.5">
              {upcoming.length === 0 ? "لا توجد مواعيد قادمة" : `${upcoming.length} موعد`}
            </p>
          </div>
          <Link
            href="/doctor/appointments"
            className="inline-flex items-center gap-1 text-sm text-primary font-sans font-medium hover:underline"
          >
            عرض الكل
            <ChevronLeft className="w-4 h-4" />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-sans text-sm">
              لا توجد مواعيد قادمة
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((appt) => {
              return (
                <li
                  key={appt.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary font-sans">
                        {appt.patient.fullName.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground font-sans truncate">
                        {appt.patient.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground font-sans">
                        {formatSlotDate(appt.slot.date, { day: "numeric", month: "short" })}
                        {" · "}
                        <span dir="ltr" className="inline">
                          {formatSlotTime(appt.slot.startTime)}
                          {" – "}
                          {formatSlotTime(appt.slot.endTime)}
                        </span>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        <QuickLink href="/doctor/appointments" label="إدارة المواعيد" icon={CalendarDays} />
        <QuickLink href="/doctor/schedule" label="جدول العمل" icon={Clock} />
        <QuickLink href="/doctor/patients" label="قائمة المرضى" icon={Users} />
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
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground font-sans">{label}</p>
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
      className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all group"
    >
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
        <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <span className="text-sm font-medium text-foreground font-sans">{label}</span>
      <ChevronLeft className="w-4 h-4 text-muted-foreground mr-auto group-hover:text-primary transition-colors" />
    </Link>
  );
}

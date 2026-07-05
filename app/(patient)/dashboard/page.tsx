import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getPatientAppointments,
  getPatientStats,
} from "@/server/services/appointments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { CalendarDays, CalendarPlus, CheckCircle, XCircle, Clock } from "lucide-react";

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [stats, upcoming] = await Promise.all([
    getPatientStats(user.id),
    getPatientAppointments(user.id, { upcoming: true, limit: 3 }),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground font-sans">نظرة عامة على مواعيدك</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold font-heading text-foreground">{stats.total}</p>
            <p className="text-sm text-muted-foreground font-sans">إجمالي المواعيد</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/10 text-blue-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold font-heading text-foreground">{stats.upcoming}</p>
            <p className="text-sm text-muted-foreground font-sans">قادمة</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500/10 text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold font-heading text-foreground">{stats.completed}</p>
            <p className="text-sm text-muted-foreground font-sans">مكتملة</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-500/10 text-red-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold font-heading text-foreground">{stats.cancelled}</p>
            <p className="text-sm text-muted-foreground font-sans">ملغاة</p>
          </div>
        </div>
      </div>

      {/* Upcoming appointments */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-heading font-semibold text-foreground">المواعيد القادمة</h2>
          <Link
            href="/dashboard/appointments"
            className="text-sm text-primary hover:underline font-sans"
          >
            عرض الكل
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground font-sans text-sm">لا توجد مواعيد قادمة</p>
            <Link
              href="/dashboard/book"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 font-sans"
            >
              <CalendarPlus className="h-4 w-4" />
              احجز موعدك الأول
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((appt) => {
              return (
                <li key={appt.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CalendarDays className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground font-sans truncate">
                        د. {appt.doctor.profile.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground font-sans">{appt.doctor.specialty}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <AppointmentStatusBadge status={appt.status} />
                    <p className="text-xs text-muted-foreground font-sans">
                      {formatSlotDate(appt.slot.date, { day: "numeric", month: "short" })}
                      {" • "}
                      <span dir="ltr">
                        {formatSlotTime(appt.slot.startTime)}
                        {" – "}
                        {formatSlotTime(appt.slot.endTime)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/book"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
            <CalendarPlus className="w-6 h-6" />
          </div>
          <div>
            <p className="font-medium text-foreground font-sans">احجز موعداً جديداً</p>
            <p className="text-sm text-muted-foreground font-sans">اختر طبيبك والوقت المناسب</p>
          </div>
        </Link>
        <Link
          href="/dashboard/appointments"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <p className="font-medium text-foreground font-sans">عرض جميع المواعيد</p>
            <p className="text-sm text-muted-foreground font-sans">تاريخك الطبي الكامل</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

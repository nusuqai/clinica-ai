import Link from "next/link";
import {
  Users,
  Stethoscope,
  CalendarDays,
  CheckCircle,
  XCircle,
  Clock,
  MessageCircle,
  UserX,
  Coins,
  Bot,
} from "lucide-react";
import { getDashboardStats, getDoctorLoad } from "@/server/services/reports";
import { getClinicAiUsage } from "@/server/services/aiReports";
import { requireClinicMember } from "@/lib/auth";
import StatCard from "@/components/admin/stat-card";
import BarList from "@/components/admin/bar-list";
import PageHeader from "@/components/admin/page-header";

const units = (n: number) => n.toLocaleString("ar-EG");
const decimal = (n: number) =>
  n.toLocaleString("ar-EG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function AdminReportsPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const [stats, doctorLoad, ai] = await Promise.all([
    getDashboardStats(clinic.id),
    getDoctorLoad(clinic.id),
    getClinicAiUsage(clinic.id),
  ]);

  const totalAppts = stats.totalAppointments || 1;

  const appointmentBreakdown = [
    { label: "قيد الانتظار", value: stats.pendingAppointments },
    { label: "مؤكدة", value: stats.confirmedAppointments },
    { label: "مكتملة", value: stats.completedAppointments },
    { label: "ملغاة", value: stats.cancelledAppointments },
  ];

  const userBreakdown = [
    { label: "مرضى", value: stats.totalPatients },
    { label: "أطباء", value: stats.totalDoctors },
    { label: "مسؤولون", value: stats.totalUsers - stats.totalDoctors - stats.totalPatients },
  ];

  return (
    <div>
      <PageHeader title="التقارير" subtitle="ملخص إحصائيات النظام" />

      {/* KPI overview */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="إجمالي المستخدمين" value={stats.totalUsers} icon={Users} color="primary" />
        <StatCard label="الأطباء" value={stats.totalDoctors} icon={Stethoscope} color="accent" />
        <StatCard
          label="إجمالي المواعيد"
          value={stats.totalAppointments}
          icon={CalendarDays}
          color="primary"
        />
        <StatCard
          label="المحادثات"
          value={stats.totalConversations}
          icon={MessageCircle}
          color="accent"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Appointment status breakdown */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-6 font-heading font-semibold text-foreground">توزيع حالات المواعيد</h2>

          {/* Mini stat row */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            {[
              {
                label: "قيد الانتظار",
                value: stats.pendingAppointments,
                icon: Clock,
                color: "text-amber-600 bg-amber-50",
              },
              {
                label: "مؤكدة",
                value: stats.confirmedAppointments,
                icon: CalendarDays,
                color: "text-blue-600 bg-blue-50",
              },
              {
                label: "مكتملة",
                value: stats.completedAppointments,
                icon: CheckCircle,
                color: "text-emerald-600 bg-emerald-50",
              },
              {
                label: "ملغاة",
                value: stats.cancelledAppointments,
                icon: XCircle,
                color: "text-red-600 bg-red-50",
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-xl p-3 ${color.split(" ")[1]}`}
              >
                <Icon className={`h-4 w-4 ${color.split(" ")[0]}`} />
                <div>
                  <p className={`font-heading text-lg font-bold ${color.split(" ")[0]}`}>{value}</p>
                  <p className="font-sans text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <BarList items={appointmentBreakdown} max={totalAppts} color="bg-primary" />

          <p className="mt-4 text-center font-sans text-xs text-muted-foreground">
            نسبة الإلغاء: {Math.round((stats.cancelledAppointments / totalAppts) * 100)}%
            &nbsp;|&nbsp; نسبة الإكمال:{" "}
            {Math.round((stats.completedAppointments / totalAppts) * 100)}%
          </p>
        </div>

        {/* User breakdown */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-6 font-heading font-semibold text-foreground">توزيع المستخدمين</h2>

          <div className="mb-6 flex items-center justify-center gap-8">
            {userBreakdown.map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-heading text-2xl font-bold text-foreground">{value}</p>
                <p className="font-sans text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <BarList items={userBreakdown} max={stats.totalUsers || 1} color="bg-accent" />
        </div>
      </div>

      {/* AI assistant — the unit meter, summarized. The full breakdown (daily,
          per channel, runway) lives on /admin/ai/usage; this is the at-a-glance
          version so the clinic's overall report includes its AI spend. */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-heading font-semibold text-foreground">
            <Bot className="h-5 w-5 text-primary" />
            المساعد الذكي — وحدات آخر {ai.windowDays} يوماً
          </h2>
          <Link href="/admin/ai/usage" className="font-sans text-sm text-primary hover:underline">
            التقرير التفصيلي
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="الوحدات المتبقية"
            value={units(ai.unitBalance)}
            icon={Coins}
            color={!ai.unitsSufficient ? "red" : ai.lowUnits ? "amber" : "primary"}
          />
          <StatCard
            label="الوحدات المستهلكة"
            value={units(ai.unitsUsed)}
            icon={MessageCircle}
            color="accent"
          />
          <StatCard
            label="متوسط يومي"
            value={decimal(ai.avgUnitsPerDay)}
            icon={Clock}
            color="accent"
          />
          <StatCard
            label="وحدات لكل محادثة"
            value={ai.sessions > 0 ? decimal(ai.unitsPerSession) : "—"}
            icon={Users}
            color="accent"
          />
        </div>

        {ai.byChannel.length > 0 ? (
          <BarList
            items={ai.byChannel.map((c) => ({ label: c.label, sublabel: "وحدة", value: c.value }))}
            color="bg-accent"
          />
        ) : (
          <p className="font-sans text-sm text-muted-foreground">
            لم يستهلك المساعد الذكي أي وحدات خلال هذه الفترة.
          </p>
        )}

        {ai.projectedDaysLeft !== null && (
          <p className="mt-4 border-t border-border pt-4 text-center font-sans text-xs text-muted-foreground">
            بمعدل الاستهلاك الحالي تكفي الوحدات المتبقية نحو{" "}
            <span className="font-semibold text-foreground">
              {decimal(ai.projectedDaysLeft)} يوماً
            </span>
            .
          </p>
        )}
      </div>

      {/* Doctor load */}
      {doctorLoad.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-6 font-heading font-semibold text-foreground">
            أعباء الأطباء (المواعيد)
          </h2>
          <BarList
            items={doctorLoad.map((d) => ({
              label: d.doctorName,
              sublabel: d.specialty,
              value: d.appointmentCount,
            }))}
            color="bg-primary"
          />
        </div>
      )}
    </div>
  );
}

import {
  Users, Stethoscope, CalendarDays, CheckCircle,
  XCircle, Clock, MessageCircle, UserX,
} from "lucide-react";
import { getDashboardStats, getDoctorLoad } from "@/server/services/reports";
import StatCard from "@/components/admin/stat-card";
import BarList from "@/components/admin/bar-list";
import PageHeader from "@/components/admin/page-header";

export default async function AdminReportsPage() {
  const [stats, doctorLoad] = await Promise.all([
    getDashboardStats(),
    getDoctorLoad(),
  ]);

  const totalAppts = stats.totalAppointments || 1;

  const appointmentBreakdown = [
    { label: "قيد الانتظار", value: stats.pendingAppointments },
    { label: "مؤكدة",        value: stats.confirmedAppointments },
    { label: "مكتملة",       value: stats.completedAppointments },
    { label: "ملغاة",        value: stats.cancelledAppointments },
  ];

  const userBreakdown = [
    { label: "مرضى",    value: stats.totalPatients },
    { label: "أطباء",   value: stats.totalDoctors },
    { label: "مسؤولون", value: stats.totalUsers - stats.totalDoctors - stats.totalPatients },
  ];

  return (
    <div>
      <PageHeader title="التقارير" subtitle="ملخص إحصائيات النظام" />

      {/* KPI overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="إجمالي المستخدمين"  value={stats.totalUsers}          icon={Users}         color="primary" />
        <StatCard label="الأطباء"             value={stats.totalDoctors}        icon={Stethoscope}   color="accent"  />
        <StatCard label="إجمالي المواعيد"     value={stats.totalAppointments}   icon={CalendarDays}  color="primary" />
        <StatCard label="المحادثات"           value={stats.totalConversations}  icon={MessageCircle} color="accent"  />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Appointment status breakdown */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-heading font-semibold text-foreground mb-6">توزيع حالات المواعيد</h2>

          {/* Mini stat row */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: "قيد الانتظار", value: stats.pendingAppointments,   icon: Clock,       color: "text-amber-600 bg-amber-50" },
              { label: "مؤكدة",        value: stats.confirmedAppointments, icon: CalendarDays, color: "text-blue-600 bg-blue-50" },
              { label: "مكتملة",       value: stats.completedAppointments, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
              { label: "ملغاة",        value: stats.cancelledAppointments, icon: XCircle,     color: "text-red-600 bg-red-50" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`flex items-center gap-2 rounded-xl p-3 ${color.split(" ")[1]}`}>
                <Icon className={`w-4 h-4 ${color.split(" ")[0]}`} />
                <div>
                  <p className={`text-lg font-bold font-heading ${color.split(" ")[0]}`}>{value}</p>
                  <p className="text-xs text-muted-foreground font-sans">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <BarList
            items={appointmentBreakdown}
            max={totalAppts}
            color="bg-primary"
          />

          <p className="text-xs text-muted-foreground font-sans mt-4 text-center">
            نسبة الإلغاء: {Math.round((stats.cancelledAppointments / totalAppts) * 100)}%
            &nbsp;|&nbsp;
            نسبة الإكمال: {Math.round((stats.completedAppointments / totalAppts) * 100)}%
          </p>
        </div>

        {/* User breakdown */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-heading font-semibold text-foreground mb-6">توزيع المستخدمين</h2>

          <div className="flex items-center justify-center gap-8 mb-6">
            {userBreakdown.map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground font-sans">{label}</p>
              </div>
            ))}
          </div>

          <BarList
            items={userBreakdown}
            max={stats.totalUsers || 1}
            color="bg-accent"
          />
        </div>
      </div>

      {/* Doctor load */}
      {doctorLoad.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-heading font-semibold text-foreground mb-6">أعباء الأطباء (المواعيد)</h2>
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

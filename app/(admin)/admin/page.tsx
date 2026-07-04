import { Users, Stethoscope, CalendarDays, MessageCircle, Clock, CheckCircle } from "lucide-react";
import { getDashboardStats, getRecentActivity } from "@/server/services/reports";
import StatCard from "@/components/admin/stat-card";
import PageHeader from "@/components/admin/page-header";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";

export default async function AdminHomePage() {
  const [stats, activity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(8),
  ]);

  return (
    <div>
      <PageHeader title="لوحة التحكم" subtitle="نظرة عامة على النظام" />

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="إجمالي المستخدمين" value={stats.totalUsers} icon={Users} color="primary" />
        <StatCard label="الأطباء" value={stats.totalDoctors} icon={Stethoscope} color="accent" />
        <StatCard label="المواعيد الكلية" value={stats.totalAppointments} icon={CalendarDays} color="primary" />
        <StatCard label="المحادثات" value={stats.totalConversations} icon={MessageCircle} color="accent" />
        <StatCard label="قيد الانتظار" value={stats.pendingAppointments} icon={Clock} color="amber" />
        <StatCard label="مؤكدة" value={stats.confirmedAppointments} icon={CheckCircle} color="green" />
        <StatCard label="ملغاة" value={stats.cancelledAppointments} icon={CalendarDays} color="red" />
        <StatCard label="مكتملة" value={stats.completedAppointments} icon={CheckCircle} color="green" />
      </div>

      {/* Recent activity */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-heading font-semibold text-foreground">آخر النشاطات</h2>
        </div>
        {activity.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 font-sans">لا توجد نشاطات بعد</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((item) => (
              <li key={`${item.type}-${item.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === "appointment" ? "bg-primary" : "bg-accent"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground font-sans">{item.label}</p>
                    <p className="text-xs text-muted-foreground font-sans truncate max-w-xs">{item.subLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {item.status && <AppointmentStatusBadge status={item.status as any} />}
                  <span className="text-xs text-muted-foreground font-sans" dir="ltr">
                    {new Date(item.createdAt).toLocaleDateString("ar-EG")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

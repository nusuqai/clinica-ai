import Link from "next/link";
import {
  Users,
  Stethoscope,
  CalendarDays,
  MessageCircle,
  Clock,
  CheckCircle,
  Coins,
} from "lucide-react";
import { getDashboardStats, getRecentActivity } from "@/server/services/reports";
import { getClinicUnitSummary } from "@/server/services/aiCredit";
import { requireClinicMember } from "@/lib/auth";
import StatCard from "@/components/admin/stat-card";
import PageHeader from "@/components/admin/page-header";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";

export default async function AdminHomePage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const [stats, activity, units] = await Promise.all([
    getDashboardStats(clinic.id),
    getRecentActivity(clinic.id, 8),
    getClinicUnitSummary(clinic.id),
  ]);

  return (
    <div>
      <PageHeader title="لوحة التحكم" subtitle="نظرة عامة على النظام" />

      {/* AI units — first, and its own row: when this hits zero the assistant
          stops answering customers, so it should not be one tile among eight. */}
      <Link href="/admin/ai/usage" className="mb-4 block">
        <div
          className={`flex items-center justify-between gap-4 rounded-2xl border p-5 transition-colors hover:bg-muted/40 ${
            !units.unitsSufficient
              ? "border-red-500/30 bg-red-500/10"
              : units.lowUnits
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                !units.unitsSufficient
                  ? "bg-red-500/10 text-red-600"
                  : units.lowUnits
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-primary/10 text-primary"
              }`}
            >
              <Coins className="h-6 w-6" />
            </div>
            <div>
              <p className="font-heading text-2xl font-bold text-foreground">
                {units.unitBalance.toLocaleString("ar-EG")}{" "}
                <span className="font-sans text-base font-normal text-muted-foreground">وحدة</span>
              </p>
              <p className="font-sans text-sm text-muted-foreground">
                {!units.unitsSufficient
                  ? "نفدت وحدات المساعد الذكي — توقّف الرد الآلي على العملاء"
                  : units.lowUnits
                    ? "وحدات المساعد الذكي على وشك النفاد"
                    : "رصيد وحدات المساعد الذكي — وحدة لكل رد آلي"}
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 font-sans text-sm text-primary hover:underline">
            تقرير الاستهلاك
          </span>
        </div>
      </Link>

      {/* KPI grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="إجمالي المستخدمين" value={stats.totalUsers} icon={Users} color="primary" />
        <StatCard label="الأطباء" value={stats.totalDoctors} icon={Stethoscope} color="accent" />
        <StatCard
          label="المواعيد الكلية"
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
        <StatCard
          label="قيد الانتظار"
          value={stats.pendingAppointments}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="مؤكدة"
          value={stats.confirmedAppointments}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          label="ملغاة"
          value={stats.cancelledAppointments}
          icon={CalendarDays}
          color="red"
        />
        <StatCard
          label="مكتملة"
          value={stats.completedAppointments}
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Recent activity */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-heading font-semibold text-foreground">آخر النشاطات</h2>
        </div>
        {activity.length === 0 ? (
          <p className="py-12 text-center font-sans text-muted-foreground">لا توجد نشاطات بعد</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${item.type === "appointment" ? "bg-primary" : "bg-accent"}`}
                  />
                  <div>
                    <p className="font-sans text-sm font-medium text-foreground">{item.label}</p>
                    <p className="max-w-xs truncate font-sans text-xs text-muted-foreground">
                      {item.subLabel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  {item.status && <AppointmentStatusBadge status={item.status as any} />}
                  <span className="font-sans text-xs text-muted-foreground" dir="ltr">
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

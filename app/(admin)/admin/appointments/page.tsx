import { listAppointments } from "@/server/services/appointments";
import PageHeader from "@/components/admin/page-header";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import AppointmentStatusSelect from "./_components/appointment-status-select";
import type { AppointmentStatus } from "@prisma/client";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING:   "قيد الانتظار",
  CONFIRMED: "مؤكد",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  NO_SHOW:   "لم يحضر",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminAppointmentsPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const filterStatus = Object.keys(STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await listAppointments({ status: filterStatus });

  return (
    <div>
      <PageHeader
        title="المواعيد"
        subtitle={`${appointments.length} موعد`}
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <a
          href="/admin/appointments"
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
            href={`/admin/appointments?status=${val}`}
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">المريض</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الطبيب</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">التخصص</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الوقت</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">تغيير الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">لا توجد مواعيد</td>
                </tr>
              )}
              {appointments.map((appt) => {
                const date = new Date(appt.slot.date);
                const start = new Date(appt.slot.startTime);
                const end = new Date(appt.slot.endTime);
                return (
                  <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{appt.patient.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{appt.doctor.profile.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{appt.doctor.specialty}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {date.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {start.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {end.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentStatusBadge status={appt.status} />
                      {appt.cancellationReason && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-[140px] truncate" title={appt.cancellationReason}>
                          {appt.cancellationReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentStatusSelect
                        appointmentId={appt.id}
                        currentStatus={appt.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

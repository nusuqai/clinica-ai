import { Role } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExportOptions, getReportScheduleView } from "@/server/services/exports/settings";
import PageHeader from "@/components/admin/page-header";
import ExportForm from "@/components/admin/exports/export-form";
import ReportSchedule from "@/components/admin/exports/report-schedule";

// Patient-data export (docs/data-export.md): download an Excel of everything
// that happened to the clinic's patients in a period. Needs `reports`; the
// scheduled report below is for the clinic ADMIN only.
export default async function ExportPage() {
  const ctx = await requirePermission("reports");
  const isAdmin = ctx.role === Role.ADMIN;
  const [options, clinic, schedule] = await Promise.all([
    getExportOptions(ctx.clinic.id, ctx.branchIds),
    prisma.clinic.findUnique({ where: { id: ctx.clinic.id }, select: { timezone: true } }),
    isAdmin ? getReportScheduleView(ctx.clinic.id) : null,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصدير بيانات المرضى"
        subtitle="ملف Excel بكل ما حدث للمرضى في فترة تختارها: المرضى الجدد، الحجوزات، الإلغاءات، التغييرات، الباقات والتقييمات"
      />
      <ExportForm
        options={options}
        timeZone={clinic?.timezone ?? "Africa/Cairo"}
        branchLimited={ctx.branchIds !== null}
        medical={ctx.permissions.includes("medical_records")}
      />
      {schedule && <ReportSchedule view={schedule} />}
    </div>
  );
}

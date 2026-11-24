"use server";

import { revalidatePath } from "next/cache";
import { Role, type DataReportCoverage } from "@prisma/client";
import { getClinicContext, getPermittedContext } from "@/lib/auth";
import { saveReportSchedule, searchExportPatients } from "@/server/services/exports/settings";

/**
 * Patient-data export (docs/data-export.md) — dashboard actions. The file
 * itself downloads from GET /api/exports; these cover the patient picker and
 * the scheduled report (clinic ADMIN only, like alert routing).
 */

type Result = { ok: true } | { ok: false; error: string };

export async function searchExportPatientsAction(
  query: string
): Promise<{ id: string; name: string; phone: string | null }[]> {
  const ctx = await getPermittedContext("reports");
  if (!ctx) return [];
  return searchExportPatients(ctx.clinic.id, String(query ?? "").slice(0, 100));
}

export async function saveReportScheduleAction(input: {
  enabled: boolean;
  sendTime: string;
  coverage: DataReportCoverage;
  recipients: string[];
}): Promise<Result> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) return { ok: false, error: "غير مصرح" };
  const res = await saveReportSchedule(ctx.clinic.id, {
    enabled: !!input?.enabled,
    sendTime: String(input?.sendTime ?? ""),
    coverage: input?.coverage,
    recipients: Array.isArray(input?.recipients) ? input.recipients.map(String) : [],
  });
  if (res.ok) revalidatePath("/admin/reports/export");
  return res;
}

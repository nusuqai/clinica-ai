import { NextResponse, type NextRequest } from "next/server";
import { getPermittedContext } from "@/lib/auth";
import { exportFiltersSchema } from "@/lib/exports/filters";
import { accessFor, buildExportFile } from "@/server/services/exports/delivery";
import { XLSX_MIME } from "@/server/services/exports/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Downloads the patient-data Excel (docs/data-export.md). Filters come in the
 * query string (lib/exports/filters.ts → exportQuery). Needs the `reports`
 * permission; branch-limited members get their branches only, and medical
 * sheets need `medical_records` too. Nothing is stored — built per request.
 */
export async function GET(request: NextRequest) {
  const ctx = await getPermittedContext("reports");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = exportFiltersSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid filters" },
      { status: 400 }
    );
  }

  const { bytes, fileName } = await buildExportFile(
    ctx.clinic.id,
    parsed.data,
    accessFor({ branchIds: ctx.branchIds, permissions: ctx.permissions })
  );
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

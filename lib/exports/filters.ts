import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";

/**
 * Patient-data export filters (docs/data-export.md). Client-safe: the dashboard
 * form, the download route, the assistant tool and the scheduled report all
 * parse through `exportFiltersSchema`.
 *
 * Days are clinic-local calendar days ("YYYY-MM-DD"), inclusive on both ends.
 */

export const EXPORT_PRESETS = ["today", "yesterday", "this_week", "this_month", "custom"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

export const EXPORT_PRESET_LABELS: Record<ExportPreset, string> = {
  today: "اليوم",
  yesterday: "أمس",
  this_week: "هذا الأسبوع",
  this_month: "هذا الشهر",
  custom: "فترة محددة",
};

/** The longest period one export may cover (keeps files and queries bounded). */
export const MAX_EXPORT_DAYS = 366;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ YYYY-MM-DD");
const optionalId = z
  .string()
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

export const exportFiltersSchema = z
  .object({
    from: day,
    to: day,
    branchId: optionalId,
    doctorId: optionalId,
    specialtyId: optionalId,
    serviceId: optionalId,
    patientId: optionalId,
    status: z
      .nativeEnum(AppointmentStatus)
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((f) => f.from <= f.to, { message: "تاريخ البداية بعد تاريخ النهاية", path: ["to"] })
  .refine((f) => daysBetween(f.from, f.to) < MAX_EXPORT_DAYS, {
    message: `أقصى فترة للتصدير ${MAX_EXPORT_DAYS} يوماً`,
    path: ["from"],
  });

export type ExportFilters = z.output<typeof exportFiltersSchema>;

/** Whole days from `a` to `b` ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "YYYY-MM-DD" of `date` on the clinic's clock. */
export function localDay(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function addDays(dayStr: string, n: number): string {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A preset → its inclusive day range on the clinic's clock. Weeks start Saturday. */
export function presetRange(
  preset: Exclude<ExportPreset, "custom">,
  timeZone: string,
  now = new Date()
): { from: string; to: string } {
  const today = localDay(now, timeZone);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "this_week": {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
      return { from: addDays(today, -((dow + 1) % 7)), to: today };
    }
    case "this_month":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Query string for the download route (empty filters left out). */
export function exportQuery(f: ExportFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, String(v));
  return params.toString();
}

/** "تقرير-2026-11-24.xlsx" / "تقرير-2026-11-01-إلى-2026-11-24.xlsx". */
export function exportFileName(f: Pick<ExportFilters, "from" | "to">): string {
  const span = f.from === f.to ? f.from : `${f.from}-إلى-${f.to}`;
  return `تقرير-المرضى-${span}.xlsx`;
}

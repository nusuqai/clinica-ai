import "server-only";
import { DataReportCoverage, Role, StaffEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import { ROLE_LABELS } from "@/lib/labels";
import { permissionsFor } from "@/lib/permissions";
import { personSearch } from "@/server/services/_search";

/**
 * Export page data (filter options) and the scheduled report's settings
 * (docs/data-export.md). Callers authorize: the options need `reports`, the
 * schedule is clinic-ADMIN only.
 */

export interface ExportOption {
  id: string;
  name: string;
}

export interface ExportOptions {
  branches: ExportOption[];
  doctors: ExportOption[];
  specialties: ExportOption[];
  services: ExportOption[];
}

export async function getExportOptions(
  clinicId: string,
  scope: BranchScope
): Promise<ExportOptions> {
  const limited = scope !== null ? [...scope] : null;
  const [branches, doctors, specialties, services] = await Promise.all([
    prisma.branch.findMany({
      where: { clinicId, ...(limited ? { id: { in: limited } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.doctor.findMany({
      where: {
        clinicId,
        ...(limited ? { branches: { some: { branchId: { in: limited } } } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.specialty.findMany({
      where: { clinicId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { clinicId },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return {
    branches,
    doctors: doctors.map((d) => ({ id: d.id, name: d.fullName })),
    specialties,
    services,
  };
}

/** The clinic's patients matching a name/phone query (for the patient filter). */
export async function searchExportPatients(
  clinicId: string,
  query: string
): Promise<{ id: string; name: string; phone: string | null }[]> {
  const search = personSearch(query);
  if (!search) return [];
  const rows = await prisma.profile.findMany({
    where: {
      ...search,
      clinicMemberships: { some: { clinicId, role: Role.PATIENT } },
    },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  return rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.phone }));
}

// ─── Scheduled report ───────────────────────────────────────────────────────

export interface ReportMemberRow {
  memberId: string;
  name: string;
  roleLabel: string;
  /** Linked WhatsApp, null when not linked (they can be chosen but get nothing). */
  whatsapp: string | null;
  /** Holds `reports` — required to receive the file. */
  canReceive: boolean;
  /** Their file includes the medical sheets. */
  medical: boolean;
  /** Limited to some branches — their file covers those only. */
  branchLimited: boolean;
}

export interface ReportScheduleView {
  enabled: boolean;
  /** "HH:MM" on the clinic's clock. */
  sendTime: string;
  coverage: DataReportCoverage;
  timeZone: string;
  members: ReportMemberRow[];
  recipients: string[];
  hasOfficialNumber: boolean;
  alertTemplateBound: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const minuteToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export function timeToMinute(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export async function getReportScheduleView(clinicId: string): Promise<ReportScheduleView> {
  const [settings, clinic, members, routes, official, assistant] = await Promise.all([
    prisma.dataReportSettings.findUnique({ where: { clinicId } }),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { timezone: true } }),
    prisma.clinicMember.findMany({
      where: { clinicId, role: { in: [Role.ADMIN, Role.STAFF] } },
      select: {
        id: true,
        role: true,
        allBranches: true,
        clinicRole: { select: { name: true, permissions: true } },
        user: { select: { fullName: true } },
        whatsappLink: { select: { phone: true, verifiedAt: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.staffEventRecipient.findMany({
      where: { clinicId, event: StaffEvent.DAILY_REPORT },
      select: { memberId: true },
    }),
    prisma.whatsappConfig.count({
      where: { clinicId, unlinkedAt: null, provider: "META_CLOUD" },
    }),
    prisma.staffAssistantSettings.findUnique({
      where: { clinicId },
      select: { alertTemplateName: true },
    }),
  ]);

  return {
    enabled: settings?.enabled ?? false,
    sendTime: minuteToTime(settings?.sendMinute ?? 1320),
    coverage: settings?.coverage ?? DataReportCoverage.TODAY,
    timeZone: clinic?.timezone ?? "Africa/Cairo",
    members: members.map((m) => {
      const perms = permissionsFor(m.role, m.clinicRole?.permissions ?? []);
      return {
        memberId: m.id,
        name: m.user.fullName,
        roleLabel:
          m.role === Role.STAFF ? (m.clinicRole?.name ?? ROLE_LABELS.STAFF) : ROLE_LABELS[m.role],
        whatsapp: m.whatsappLink?.verifiedAt ? (m.whatsappLink.phone ?? "رقم مخفي") : null,
        canReceive: perms.includes("reports"),
        medical: perms.includes("medical_records"),
        branchLimited: m.role === Role.STAFF && !m.allBranches,
      };
    }),
    recipients: routes.map((r) => r.memberId),
    hasOfficialNumber: official > 0,
    alertTemplateBound: !!assistant?.alertTemplateName,
  };
}

export async function saveReportSchedule(
  clinicId: string,
  input: { enabled: boolean; sendTime: string; coverage: DataReportCoverage; recipients: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sendMinute = timeToMinute(input.sendTime);
  if (sendMinute == null) return { ok: false, error: "وقت الإرسال غير صحيح" };
  if (!Object.values(DataReportCoverage).includes(input.coverage)) {
    return { ok: false, error: "اختيار غير صحيح لفترة التقرير" };
  }

  // Only ADMIN / STAFF members holding `reports` may receive it.
  const candidates = await prisma.clinicMember.findMany({
    where: {
      clinicId,
      id: { in: [...new Set(input.recipients)] },
      role: { in: [Role.ADMIN, Role.STAFF] },
    },
    select: { id: true, role: true, clinicRole: { select: { permissions: true } } },
  });
  const valid = candidates.filter((m) =>
    permissionsFor(m.role, m.clinicRole?.permissions ?? []).includes("reports")
  );
  if (input.enabled && valid.length === 0) {
    return { ok: false, error: "اختر عضواً واحداً على الأقل ليصله التقرير" };
  }

  const existing = await prisma.dataReportSettings.findUnique({
    where: { clinicId },
    select: { sendMinute: true, enabled: true },
  });
  const data = {
    enabled: !!input.enabled,
    sendMinute,
    coverage: input.coverage,
    // A new send time (or turning it back on) may still fire today.
    ...(existing && (existing.sendMinute !== sendMinute || (!existing.enabled && input.enabled))
      ? { lastRunOn: null }
      : {}),
  };
  await prisma.$transaction([
    prisma.dataReportSettings.upsert({
      where: { clinicId },
      create: { clinicId, ...data },
      update: data,
    }),
    prisma.staffEventRecipient.deleteMany({ where: { clinicId, event: StaffEvent.DAILY_REPORT } }),
    prisma.staffEventRecipient.createMany({
      data: valid.map((m) => ({ clinicId, event: StaffEvent.DAILY_REPORT, memberId: m.id })),
    }),
  ]);
  return { ok: true };
}

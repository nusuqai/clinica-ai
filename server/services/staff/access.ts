import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { permissionsFor } from "@/lib/permissions";
import type { StaffActor } from "@/agent/types";

/**
 * Team assistant (#89) — who a clinic member is to the assistant and whether it
 * is open to them. Everything here resolves from the DATABASE (member id /
 * user id), never from a browser session: the assistant runs inside the
 * WhatsApp debounce processor as well as behind the dashboard bubble.
 */

export const BATCH_MINUTES_MIN = 1;
export const BATCH_MINUTES_MAX = 30;

export interface StaffAssistantConfig {
  enabled: boolean;
  batchMinutes: number;
  alertTemplateName: string | null;
  alertTemplateLanguage: string | null;
  alertVariableMap: string[];
  alertBodyText: string;
}

const DEFAULTS: StaffAssistantConfig = {
  enabled: true,
  batchMinutes: 5,
  alertTemplateName: null,
  alertTemplateLanguage: null,
  alertVariableMap: [],
  alertBodyText: "",
};

/** The clinic's assistant settings (defaults when the row doesn't exist yet). */
export async function getStaffAssistantConfig(clinicId: string): Promise<StaffAssistantConfig> {
  const row = await prisma.staffAssistantSettings.findUnique({ where: { clinicId } });
  if (!row) return { ...DEFAULTS };
  return {
    enabled: row.enabled,
    batchMinutes: row.batchMinutes,
    alertTemplateName: row.alertTemplateName,
    alertTemplateLanguage: row.alertTemplateLanguage,
    alertVariableMap: row.alertVariableMap,
    alertBodyText: row.alertBodyText,
  };
}

export function clampBatchMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.batchMinutes;
  return Math.min(BATCH_MINUTES_MAX, Math.max(BATCH_MINUTES_MIN, Math.round(value)));
}

/** Roles that can have the team assistant at all. */
export function isTeamRole(role: Role): role is "ADMIN" | "STAFF" | "DOCTOR" {
  return role === Role.ADMIN || role === Role.STAFF || role === Role.DOCTOR;
}

export interface LoadedStaffMember {
  actor: StaffActor;
  userId: string;
  fullName: string;
  /** The member's own flag (ADMIN is always allowed regardless). */
  assistantEnabled: boolean;
}

const memberSelect = {
  id: true,
  userId: true,
  clinicId: true,
  role: true,
  assistantEnabled: true,
  allBranches: true,
  branches: { select: { branchId: true } },
  clinicRole: { select: { permissions: true } },
  user: { select: { fullName: true } },
} as const;

type MemberRow = {
  id: string;
  userId: string;
  clinicId: string;
  role: Role;
  assistantEnabled: boolean;
  allBranches: boolean;
  branches: { branchId: string }[];
  clinicRole: { permissions: string[] } | null;
  user: { fullName: string };
};

async function toLoaded(m: MemberRow | null): Promise<LoadedStaffMember | null> {
  if (!m || !isTeamRole(m.role)) return null;
  let doctorId: string | null = null;
  if (m.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findFirst({
      where: { profileId: m.userId, clinicId: m.clinicId },
      select: { id: true },
    });
    // A DOCTOR member with no doctor row can do nothing doctor-shaped.
    doctorId = doctor?.id ?? null;
  }
  return {
    actor: {
      memberId: m.id,
      role: m.role,
      permissions: permissionsFor(m.role, m.clinicRole?.permissions ?? []),
      branchIds: m.role === Role.STAFF && !m.allBranches ? m.branches.map((b) => b.branchId) : null,
      doctorId,
    },
    userId: m.userId,
    fullName: m.user.fullName,
    assistantEnabled: m.assistantEnabled,
  };
}

export async function loadStaffMemberById(memberId: string): Promise<LoadedStaffMember | null> {
  return toLoaded(
    await prisma.clinicMember.findUnique({ where: { id: memberId }, select: memberSelect })
  );
}

export async function loadStaffMember(
  clinicId: string,
  userId: string
): Promise<LoadedStaffMember | null> {
  return toLoaded(
    await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId, clinicId } },
      select: memberSelect,
    })
  );
}

/** Why the assistant won't work for a member right now, or null when it will. */
export type AssistantBlock = "clinic_off" | "member_off";

export async function assistantBlock(
  clinicId: string,
  member: { actor: StaffActor; assistantEnabled: boolean }
): Promise<AssistantBlock | null> {
  const config = await getStaffAssistantConfig(clinicId);
  if (!config.enabled) return "clinic_off";
  if (member.actor.role !== Role.ADMIN && !member.assistantEnabled) return "member_off";
  return null;
}

export const ASSISTANT_BLOCK_NOTICE: Record<AssistantBlock, string> = {
  clinic_off: "مساعد الفريق متوقف حالياً في العيادة. يمكن لمدير العيادة تشغيله من الإعدادات.",
  member_off:
    "لم يتم تفعيل مساعد الفريق لحسابك بعد. اطلب من مدير العيادة تفعيله لك من صفحة فريق العمل.",
};

export const UNITS_OUT_NOTICE =
  "نفدت وحدات المساعد الذكي في العيادة، لذلك لا أستطيع تنفيذ طلبك الآن. يمكن لمدير العيادة شحن الرصيد.";

/** Has the actor one of these permissions? */
export function actorCan(actor: StaffActor, ...permissions: string[]): boolean {
  return permissions.some((p) => actor.permissions.includes(p));
}

/** Whether to show the team-assistant bubble to this user in this clinic. */
export async function assistantOpenFor(clinicId: string, userId: string): Promise<boolean> {
  const member = await loadStaffMember(clinicId, userId);
  if (!member) return false;
  return (await assistantBlock(clinicId, member)) === null;
}

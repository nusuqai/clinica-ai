import "server-only";
import { Role, StaffEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/labels";
import { STAFF_EVENT_META } from "@/lib/staff/events";
import { clampBatchMinutes, getStaffAssistantConfig, type StaffAssistantConfig } from "./access";

/**
 * Read/write side of the team assistant's settings (#89): the clinic switch,
 * the alert batch window, each member's flag + linked WhatsApp, the event
 * routing and the alert template binding. Callers authorize (ADMIN only).
 */

export interface AssistantMemberRow {
  memberId: string;
  userId: string;
  name: string;
  role: "ADMIN" | "STAFF" | "DOCTOR";
  roleLabel: string;
  assistantEnabled: boolean;
  /** Linked WhatsApp: the phone (or "رقم مخفي"), null when not linked. */
  whatsapp: string | null;
}

export interface AssistantAdminView {
  config: StaffAssistantConfig;
  members: AssistantMemberRow[];
  /** event → member ids routed to it. */
  recipients: Record<StaffEvent, string[]>;
}

export async function getAssistantAdminView(clinicId: string): Promise<AssistantAdminView> {
  const [config, members, routes] = await Promise.all([
    getStaffAssistantConfig(clinicId),
    prisma.clinicMember.findMany({
      where: { clinicId, role: { in: [Role.ADMIN, Role.STAFF, Role.DOCTOR] } },
      select: {
        id: true,
        userId: true,
        role: true,
        assistantEnabled: true,
        clinicRole: { select: { name: true } },
        user: { select: { fullName: true } },
        whatsappLink: { select: { phone: true, verifiedAt: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.staffEventRecipient.findMany({
      where: { clinicId },
      select: { event: true, memberId: true },
    }),
  ]);

  const recipients = Object.fromEntries(
    Object.values(StaffEvent).map((e) => [e, [] as string[]])
  ) as Record<StaffEvent, string[]>;
  for (const r of routes) recipients[r.event].push(r.memberId);

  return {
    config,
    members: members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      name: m.user.fullName,
      role: m.role as AssistantMemberRow["role"],
      roleLabel:
        m.role === Role.STAFF ? (m.clinicRole?.name ?? ROLE_LABELS.STAFF) : ROLE_LABELS[m.role],
      // ADMIN is always allowed; show it as on.
      assistantEnabled: m.role === Role.ADMIN || m.assistantEnabled,
      whatsapp: m.whatsappLink?.verifiedAt ? (m.whatsappLink.phone ?? "رقم مخفي") : null,
    })),
    recipients,
  };
}

export async function saveAssistantSettings(
  clinicId: string,
  input: { enabled: boolean; batchMinutes: number }
): Promise<void> {
  const data = { enabled: !!input.enabled, batchMinutes: clampBatchMinutes(input.batchMinutes) };
  await prisma.staffAssistantSettings.upsert({
    where: { clinicId },
    create: { clinicId, ...data },
    update: data,
  });
}

/** Turns a STAFF/DOCTOR member's assistant on/off (ADMIN needs no flag). */
export async function setMemberAssistantEnabled(
  clinicId: string,
  memberId: string,
  enabled: boolean
): Promise<boolean> {
  const res = await prisma.clinicMember.updateMany({
    where: { id: memberId, clinicId, role: { in: [Role.STAFF, Role.DOCTOR] } },
    data: { assistantEnabled: enabled },
  });
  return res.count > 0;
}

/** Replaces the members an event is routed to. Personal events aren't routable;
 *  doctors only for the events they can receive. */
export async function setEventRecipients(
  clinicId: string,
  event: StaffEvent,
  memberIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meta = STAFF_EVENT_META[event];
  if (meta.personal) return { ok: false, error: "هذا التنبيه يصل لصاحبه فقط" };
  const valid = await prisma.clinicMember.findMany({
    where: {
      clinicId,
      id: { in: [...new Set(memberIds)] },
      role: { in: meta.doctors ? [Role.ADMIN, Role.STAFF, Role.DOCTOR] : [Role.ADMIN, Role.STAFF] },
    },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.staffEventRecipient.deleteMany({ where: { clinicId, event } }),
    prisma.staffEventRecipient.createMany({
      data: valid.map((m) => ({ clinicId, event, memberId: m.id })),
    }),
  ]);
  return { ok: true };
}

export async function saveAlertTemplate(
  clinicId: string,
  binding: { name: string; languageCode: string; variableMap: string[]; bodyText: string } | null
): Promise<void> {
  const data = binding
    ? {
        alertTemplateName: binding.name,
        alertTemplateLanguage: binding.languageCode,
        alertVariableMap: binding.variableMap,
        alertBodyText: binding.bodyText,
      }
    : {
        alertTemplateName: null,
        alertTemplateLanguage: null,
        alertVariableMap: [],
        alertBodyText: "",
      };
  await prisma.staffAssistantSettings.upsert({
    where: { clinicId },
    create: { clinicId, ...data },
    update: data,
  });
}

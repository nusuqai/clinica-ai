"use server";

import { revalidatePath } from "next/cache";
import { Role, StaffEvent } from "@prisma/client";
import { getClinicContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { listMessageTemplates } from "@/lib/meta/whatsapp";
import { STAFF_ALERT_TOKENS } from "@/lib/staff/events";
import {
  assistantBlock,
  isTeamRole,
  loadStaffMember,
  type AssistantBlock,
} from "@/server/services/staff/access";
import { createLinkCode, formatLinkCode, unlinkMemberWhatsapp } from "@/server/services/staff/link";
import {
  saveAlertTemplate,
  saveAssistantSettings,
  setEventRecipients,
  setMemberAssistantEnabled,
} from "@/server/services/staff/settings";

/**
 * Team assistant (#89) — dashboard actions.
 *  - "My WhatsApp": any team member (ADMIN / STAFF / DOCTOR) links their own
 *    number and sees whether the assistant is open to them.
 *  - Settings: clinic ADMIN only (like team & roles — no permission key opens
 *    it, so staff can't widen their own access or reroute alerts).
 */

type Result = { ok: true } | { ok: false; error: string };

async function teamMember() {
  const ctx = await getClinicContext();
  if (!ctx || ctx.viaPlatformAdmin || !isTeamRole(ctx.role)) return null;
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: ctx.user.id, clinicId: ctx.clinic.id } },
    select: { id: true },
  });
  return member ? { ctx, memberId: member.id } : null;
}

async function clinicAdmin() {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) return null;
  return ctx;
}

// ─── My WhatsApp ─────────────────────────────────────────────────────────────

export interface MyWhatsappState {
  linked: boolean;
  /** The linked phone, "رقم مخفي" for a hidden number, null when not linked. */
  phone: string | null;
  verifiedAt: string | null;
  /** A code waiting to be sent, when one was generated and is still valid. */
  pendingCode: { code: string; expiresAt: string } | null;
  /** The clinic's numbers the code can be sent to. */
  clinicNumbers: { phone: string; label: string }[];
  /** Why the assistant is closed for this member, or null when it's open. */
  assistantBlock: AssistantBlock | null;
}

export async function getMyWhatsappStateAction(): Promise<MyWhatsappState | null> {
  const me = await teamMember();
  if (!me) return null;
  const clinicId = me.ctx.clinic.id;
  const [link, numbers, member] = await Promise.all([
    prisma.memberWhatsappLink.findUnique({ where: { memberId: me.memberId } }),
    prisma.whatsappConfig.findMany({
      where: { clinicId, unlinkedAt: null, phone: { not: null } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { phone: true, isPrimary: true, branch: { select: { name: true } } },
    }),
    loadStaffMember(clinicId, me.ctx.user.id),
  ]);
  const codeValid =
    !!link?.linkCode && !!link.linkCodeExpiresAt && link.linkCodeExpiresAt > new Date();
  return {
    linked: !!link?.verifiedAt,
    phone: link?.verifiedAt ? (link.phone ?? "رقم مخفي") : null,
    verifiedAt: link?.verifiedAt?.toISOString() ?? null,
    pendingCode: codeValid
      ? { code: formatLinkCode(link!.linkCode!), expiresAt: link!.linkCodeExpiresAt!.toISOString() }
      : null,
    clinicNumbers: numbers.map((n) => ({
      phone: n.phone!,
      label: n.isPrimary ? "الرقم الرئيسي" : (n.branch?.name ?? "رقم العيادة"),
    })),
    assistantBlock: member ? await assistantBlock(clinicId, member) : "member_off",
  };
}

export async function createMyLinkCodeAction(): Promise<
  { ok: true; code: string; expiresAt: string } | { ok: false; error: string }
> {
  const me = await teamMember();
  if (!me) return { ok: false, error: "غير مصرح" };
  try {
    const { code, expiresAt } = await createLinkCode(me.ctx.clinic.id, me.memberId);
    return { ok: true, code: formatLinkCode(code), expiresAt: expiresAt.toISOString() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "تعذّر إنشاء الرمز" };
  }
}

export async function unlinkMyWhatsappAction(): Promise<Result> {
  const me = await teamMember();
  if (!me) return { ok: false, error: "غير مصرح" };
  await unlinkMemberWhatsapp(me.ctx.clinic.id, me.memberId);
  return { ok: true };
}

// ─── Settings (ADMIN) ────────────────────────────────────────────────────────

const PATH = "/admin/assistant";

export async function saveAssistantSettingsAction(input: {
  enabled: boolean;
  batchMinutes: number;
}): Promise<Result> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  await saveAssistantSettings(ctx.clinic.id, input);
  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function setMemberAssistantAction(
  memberId: string,
  enabled: boolean
): Promise<Result> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  const ok = await setMemberAssistantEnabled(ctx.clinic.id, memberId, enabled);
  if (!ok) return { ok: false, error: "العضو غير موجود" };
  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function unlinkMemberWhatsappAction(memberId: string): Promise<Result> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  await unlinkMemberWhatsapp(ctx.clinic.id, memberId);
  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function setEventRecipientsAction(
  event: StaffEvent,
  memberIds: string[]
): Promise<Result> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  if (!(event in StaffEvent) || !Array.isArray(memberIds)) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  const res = await setEventRecipients(ctx.clinic.id, event, memberIds);
  revalidatePath(PATH, "page");
  return res;
}

/** The clinic's APPROVED templates (official number), for the alert binding. */
export async function listAlertTemplateChoicesAction(): Promise<
  | {
      ok: true;
      templates: { name: string; language: string; bodyText: string; variableCount: number }[];
    }
  | { ok: false; error: string }
> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
  if (!creds) return { ok: false, error: "لا يوجد رقم واتساب رسمي مربوط" };
  try {
    const all = await listMessageTemplates(creds.accessToken, creds.wabaId);
    return {
      ok: true,
      templates: all
        .filter((t) => t.status === "APPROVED")
        .map((t) => ({
          name: t.name,
          language: t.language,
          bodyText: t.bodyText,
          variableCount: t.variableCount,
        })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "تعذّر جلب القوالب" };
  }
}

export async function saveAlertTemplateAction(
  input: { name: string; languageCode: string; variableMap: string[] } | null
): Promise<Result> {
  const ctx = await clinicAdmin();
  if (!ctx) return { ok: false, error: "غير مصرح" };
  if (!input) {
    await saveAlertTemplate(ctx.clinic.id, null);
    revalidatePath(PATH, "page");
    return { ok: true };
  }
  const valid = new Set<string>(STAFF_ALERT_TOKENS);
  if (!Array.isArray(input.variableMap) || input.variableMap.some((t) => !valid.has(t))) {
    return { ok: false, error: "أحد الحقول المختارة غير صالح" };
  }
  const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
  if (!creds) return { ok: false, error: "لا يوجد رقم واتساب رسمي مربوط" };
  let templates;
  try {
    templates = await listMessageTemplates(creds.accessToken, creds.wabaId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "تعذّر التحقق من القالب" };
  }
  const t = templates.find((x) => x.name === input.name && x.language === input.languageCode);
  if (!t) return { ok: false, error: "القالب غير موجود" };
  if (t.status !== "APPROVED") return { ok: false, error: "القالب ليس معتمداً بعد" };
  if (t.variableCount !== input.variableMap.length) {
    return {
      ok: false,
      error: `القالب يحتوي على ${t.variableCount} متغيّراً، لكن تم ربط ${input.variableMap.length}`,
    };
  }
  await saveAlertTemplate(ctx.clinic.id, {
    name: t.name,
    languageCode: t.language,
    variableMap: input.variableMap,
    bodyText: t.bodyText,
  });
  revalidatePath(PATH, "page");
  return { ok: true };
}

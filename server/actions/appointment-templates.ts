"use server";

import { revalidatePath } from "next/cache";
import { AppointmentTemplatePurpose, Role } from "@prisma/client";
import { can, getClinicContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { listMessageTemplates } from "@/lib/meta/whatsapp";
import {
  APPOINTMENT_TOKENS,
  CUSTOM_TEMPLATE_MAX_LENGTH,
  CUSTOM_TEMPLATE_NAME,
  unknownCustomTokens,
} from "@/lib/appointment-templates";
import { getClinicWhatsappProvider } from "@/lib/whatsapp/transport";

/**
 * Admin actions for the appointment-automation template bindings
 * (ClinicAppointmentTemplate). A binding links one of the clinic's APPROVED
 * WhatsApp templates to a purpose (confirmation reminder / feedback request) and
 * records which token fills each `{{n}}` — the automation sweep is inert for a
 * purpose until an enabled binding exists.
 *
 * Official (Meta) clinics bind an approved template; Evolution (WhatsApp Web)
 * clinics write their own text instead (`saveCustomAppointmentTemplateAction`),
 * since there is no Meta account and nothing to approve.
 */

const PATH = "/admin/whatsapp";

type ActionError = {
  ok: false;
  reason: "unauthorized" | "forbidden" | "not_configured" | "error";
  message?: string;
};

/** Client-safe view of a binding (dates serialized). */
export interface AppointmentTemplateBinding {
  purpose: AppointmentTemplatePurpose;
  templateName: string;
  languageCode: string;
  variableMap: string[];
  /** The template text — Meta's snapshot, or the clinic's own custom text. */
  bodyText: string;
  enabled: boolean;
  leadMinutes: number;
  delayMinutes: number;
  updatedAt: string;
}

async function requireAdminClinic() {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false as const, reason: "unauthorized" as const };
  if (!can(ctx, "whatsapp")) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, ctx };
}

/** Both bindings for the active clinic (absent purposes come back as null). */
export async function getAppointmentTemplateBindingsAction(): Promise<
  { ok: true; bindings: AppointmentTemplateBinding[] } | ActionError
> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const rows = await prisma.clinicAppointmentTemplate.findMany({
    where: { clinicId: auth.ctx.clinic.id },
  });

  return {
    ok: true,
    bindings: rows.map((r) => ({
      purpose: r.purpose,
      templateName: r.templateName,
      languageCode: r.languageCode,
      variableMap: r.variableMap,
      bodyText: r.bodyText,
      enabled: r.enabled,
      leadMinutes: r.leadMinutes,
      delayMinutes: r.delayMinutes,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export interface SaveBindingInput {
  purpose: AppointmentTemplatePurpose;
  templateName: string;
  languageCode: string;
  variableMap: string[];
  enabled: boolean;
  leadMinutes?: number;
  delayMinutes?: number;
}

/**
 * Creates or updates a binding, validating that the chosen template is APPROVED,
 * that its placeholder count matches the map length, and that every mapped token
 * is one the sweep can resolve. This is why the sweep can trust bindings blindly.
 */
export async function saveAppointmentTemplateBindingAction(
  input: SaveBindingInput
): Promise<{ ok: true } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const creds = await getClinicWhatsappCredentials(auth.ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  // Every mapped token must be resolvable.
  const validTokens = new Set<string>(APPOINTMENT_TOKENS);
  if (input.variableMap.some((t) => !validTokens.has(t))) {
    return { ok: false, reason: "error", message: "أحد الحقول المختارة غير صالح" };
  }

  // The template must exist, be approved, and its placeholder count must match.
  let templates;
  try {
    templates = await listMessageTemplates(creds.accessToken, creds.wabaId);
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر التحقق من القالب",
    };
  }
  const template = templates.find(
    (t) => t.name === input.templateName && t.language === input.languageCode
  );
  if (!template) {
    return { ok: false, reason: "error", message: "القالب غير موجود" };
  }
  if (template.status !== "APPROVED") {
    return { ok: false, reason: "error", message: "القالب ليس معتمداً بعد" };
  }
  if (template.variableCount !== input.variableMap.length) {
    return {
      ok: false,
      reason: "error",
      message: `القالب يحتوي على ${template.variableCount} متغيّراً، لكن تم ربط ${input.variableMap.length}`,
    };
  }

  const leadMinutes = Math.max(0, Math.round(input.leadMinutes ?? 1440));
  const delayMinutes = Math.max(0, Math.round(input.delayMinutes ?? 120));

  // Snapshot the template text so the sender can render the exact message
  // locally (for the inbox thread) without a per-send Graph API call.
  const snapshot = {
    bodyText: template.bodyText,
    headerText: template.headerText,
    footerText: template.footerText,
  };

  await prisma.clinicAppointmentTemplate.upsert({
    where: { clinicId_purpose: { clinicId: auth.ctx.clinic.id, purpose: input.purpose } },
    create: {
      clinicId: auth.ctx.clinic.id,
      purpose: input.purpose,
      templateName: input.templateName,
      languageCode: input.languageCode,
      variableMap: input.variableMap,
      enabled: input.enabled,
      leadMinutes,
      delayMinutes,
      ...snapshot,
    },
    update: {
      templateName: input.templateName,
      languageCode: input.languageCode,
      variableMap: input.variableMap,
      enabled: input.enabled,
      leadMinutes,
      delayMinutes,
      ...snapshot,
    },
  });

  revalidatePath(PATH, "page");
  return { ok: true };
}

export interface SaveCustomBindingInput {
  purpose: AppointmentTemplatePurpose;
  /** The message, with named placeholders like {{patient_name}}. */
  bodyText: string;
  enabled: boolean;
  leadMinutes?: number;
  delayMinutes?: number;
}

/**
 * Creates or updates a clinic-written reminder (Evolution clinics only). No
 * approval step: the text is checked for length and unknown placeholders, then
 * stored as the binding body under CUSTOM_TEMPLATE_NAME.
 */
export async function saveCustomAppointmentTemplateAction(
  input: SaveCustomBindingInput
): Promise<{ ok: true } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  // The official API only delivers approved templates outside the 24h window,
  // so free text is an Evolution-only option.
  if ((await getClinicWhatsappProvider(auth.ctx.clinic.id)) !== "EVOLUTION") {
    return { ok: false, reason: "not_configured" };
  }

  const bodyText = input.bodyText.trim();
  if (!bodyText) return { ok: false, reason: "error", message: "نص الرسالة مطلوب." };
  if (bodyText.length > CUSTOM_TEMPLATE_MAX_LENGTH) {
    return {
      ok: false,
      reason: "error",
      message: `النص أطول من ${CUSTOM_TEMPLATE_MAX_LENGTH} حرفاً.`,
    };
  }
  const unknown = unknownCustomTokens(bodyText);
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: "error",
      message: `حقول غير معروفة: ${unknown.map((t) => `{{${t}}}`).join("، ")}`,
    };
  }

  const leadMinutes = Math.max(0, Math.round(input.leadMinutes ?? 1440));
  const delayMinutes = Math.max(0, Math.round(input.delayMinutes ?? 120));
  const data = {
    templateName: CUSTOM_TEMPLATE_NAME,
    languageCode: "ar",
    variableMap: [],
    bodyText,
    headerText: "",
    footerText: "",
    enabled: input.enabled,
    leadMinutes,
    delayMinutes,
  };

  await prisma.clinicAppointmentTemplate.upsert({
    where: { clinicId_purpose: { clinicId: auth.ctx.clinic.id, purpose: input.purpose } },
    create: { clinicId: auth.ctx.clinic.id, purpose: input.purpose, ...data },
    update: data,
  });

  revalidatePath(PATH, "page");
  return { ok: true };
}

/** Removes a binding entirely (turns the flow off for that purpose). */
export async function deleteAppointmentTemplateBindingAction(
  purpose: AppointmentTemplatePurpose
): Promise<{ ok: true } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  await prisma.clinicAppointmentTemplate.deleteMany({
    where: { clinicId: auth.ctx.clinic.id, purpose },
  });
  revalidatePath(PATH, "page");
  return { ok: true };
}

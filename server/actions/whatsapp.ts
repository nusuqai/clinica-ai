"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import {
  getWhatsappConfigStatus,
  getClinicWhatsappCredentials,
  saveWhatsappConfig,
  type WhatsappConfigStatus,
} from "@/lib/meta/whatsapp-config";
import {
  listMessageTemplates,
  createMessageTemplate,
  deleteMessageTemplate,
  sendTemplateMessage,
  type MessageTemplate,
  type TemplateCategory,
} from "@/lib/meta/whatsapp";

const CONFIG_PATH = "/clinic/[slug]/admin/whatsapp";

type ActionError =
  | { ok: false; reason: "unauthorized" | "forbidden" | "not_configured" | "error"; message?: string };

async function requireAdminClinic() {
  const ctx = await getActiveClinicContext();
  if (!ctx) return { ok: false as const, reason: "unauthorized" as const };
  if (ctx.role !== Role.ADMIN) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, ctx };
}

// ─── Connection config ───────────────────────────────────────────────────────

export async function getWhatsappConfigAction(): Promise<
  { ok: true; config: WhatsappConfigStatus | null } | ActionError
> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  const config = await getWhatsappConfigStatus(auth.ctx.clinic.id);
  return { ok: true, config };
}

export async function saveWhatsappConfigAction(input: {
  phoneNumberId: string;
  wabaId: string;
  accessToken?: string;
}): Promise<
  { ok: true; webhookToken: string; verifyToken: string } | ActionError
> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  if (!input.phoneNumberId.trim() || !input.wabaId.trim()) {
    return { ok: false, reason: "error", message: "Phone number ID and WABA ID are required" };
  }

  try {
    const { webhookToken, verifyToken } = await saveWhatsappConfig(
      auth.ctx.clinic.id,
      input,
    );
    revalidatePath(CONFIG_PATH, "page");
    return { ok: true, webhookToken, verifyToken };
  } catch (err) {
    console.error("Failed to save WhatsApp config:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Failed to save configuration",
    };
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplatesAction(): Promise<
  { ok: true; templates: MessageTemplate[] } | ActionError
> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const creds = await getClinicWhatsappCredentials(auth.ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    const templates = await listMessageTemplates(creds.accessToken, creds.wabaId);
    return { ok: true, templates };
  } catch (err) {
    console.error("Failed to list templates:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Failed to load templates",
    };
  }
}

export async function createTemplateAction(input: {
  name: string;
  category: TemplateCategory;
  language: string;
  bodyText: string;
  footerText?: string;
  bodyExamples?: string[];
}): Promise<{ ok: true; status: string } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const creds = await getClinicWhatsappCredentials(auth.ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  // Meta requires the name to be lowercase letters, digits and underscores.
  const name = input.name.trim().toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]+$/.test(name)) {
    return { ok: false, reason: "error", message: "Template name may only contain letters, digits and underscores" };
  }
  if (!input.bodyText.trim()) {
    return { ok: false, reason: "error", message: "Template body is required" };
  }

  try {
    const result = await createMessageTemplate(creds.accessToken, creds.wabaId, {
      name,
      category: input.category,
      language: input.language,
      bodyText: input.bodyText,
      footerText: input.footerText,
      bodyExamples: input.bodyExamples,
    });
    revalidatePath(CONFIG_PATH, "page");
    return { ok: true, status: result.status };
  } catch (err) {
    console.error("Failed to create template:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Failed to submit template",
    };
  }
}

export async function deleteTemplateAction(
  name: string,
): Promise<{ ok: true } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const creds = await getClinicWhatsappCredentials(auth.ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    await deleteMessageTemplate(creds.accessToken, creds.wabaId, name);
    revalidatePath(CONFIG_PATH, "page");
    return { ok: true };
  } catch (err) {
    console.error("Failed to delete template:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Failed to delete template",
    };
  }
}

/**
 * Sends an approved template to an arbitrary phone number (the "send to any
 * user" flow on the templates page). Does not touch conversations — it's a
 * one-off outreach, unlike `sendWhatsappTemplate` which posts into a thread.
 */
export async function sendTemplateToNumberAction(input: {
  phone: string;
  name: string;
  language: string;
  variables: string[];
}): Promise<{ ok: true } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;

  const creds = await getClinicWhatsappCredentials(auth.ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  const phone = input.phone.replace(/\D/g, "");
  if (!phone) return { ok: false, reason: "error", message: "A valid phone number is required" };

  try {
    await sendTemplateMessage(
      phone,
      { name: input.name, languageCode: input.language, variables: input.variables },
      creds,
    );
    return { ok: true };
  } catch (err) {
    console.error("Failed to send template to number:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Failed to send template",
    };
  }
}

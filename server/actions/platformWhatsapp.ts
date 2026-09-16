"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { getClinicWhatsappCredentials, saveWhatsappConfig } from "@/lib/meta/whatsapp-config";
import {
  listMessageTemplates,
  createMessageTemplate,
  deleteMessageTemplate,
  sendTemplateMessage,
  type MessageTemplate,
  type TemplateCategory,
  type TemplateButton,
} from "@/lib/meta/whatsapp";

/**
 * WhatsApp onboarding is platform-admin work: a clinic never sees or edits its
 * own Meta credentials. Every action here therefore names its clinic explicitly
 * via `clinicId`, instead of inferring one from the request host the way
 * server/actions/whatsapp.ts does — the console runs on the root domain, where
 * there is no tenant to infer.
 *
 * Mirrors server/actions/platformCredits.ts: one action file per audience, both
 * kept thin over the shared lib/meta helpers.
 */

const WHATSAPP_PATH = "/platform/whatsapp";

type ActionError = { ok: false; reason: "not_configured" | "error"; message?: string };

// ─── Connection config ───────────────────────────────────────────────────────

export async function saveClinicWhatsappConfigAction(input: {
  clinicId: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken?: string;
}): Promise<{ ok: true; webhookToken: string; verifyToken: string } | ActionError> {
  await requirePlatformAdmin();

  if (!input.phoneNumberId.trim() || !input.wabaId.trim()) {
    return { ok: false, reason: "error", message: "Phone Number ID و WABA ID مطلوبان." };
  }

  try {
    const { webhookToken, verifyToken } = await saveWhatsappConfig(input.clinicId, {
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      accessToken: input.accessToken,
    });
    revalidatePath(WHATSAPP_PATH);
    return { ok: true, webhookToken, verifyToken };
  } catch (err) {
    console.error("Failed to save WhatsApp config:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر حفظ الإعدادات.",
    };
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listClinicTemplatesAction(input: {
  clinicId: string;
}): Promise<{ ok: true; templates: MessageTemplate[] } | ActionError> {
  await requirePlatformAdmin();

  const creds = await getClinicWhatsappCredentials(input.clinicId);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    const templates = await listMessageTemplates(creds.accessToken, creds.wabaId);
    return { ok: true, templates };
  } catch (err) {
    console.error("Failed to list templates:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر تحميل القوالب.",
    };
  }
}

export async function createClinicTemplateAction(input: {
  clinicId: string;
  name: string;
  category: TemplateCategory;
  language: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: TemplateButton[];
  bodyExamples?: string[];
}): Promise<{ ok: true; status: string } | ActionError> {
  await requirePlatformAdmin();

  const creds = await getClinicWhatsappCredentials(input.clinicId);
  if (!creds) return { ok: false, reason: "not_configured" };

  // Meta requires the name to be lowercase letters, digits and underscores.
  const name = input.name.trim().toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]+$/.test(name)) {
    return {
      ok: false,
      reason: "error",
      message: "اسم القالب يقبل الحروف الإنجليزية الصغيرة والأرقام والشرطة السفلية فقط.",
    };
  }
  if (!input.bodyText.trim()) {
    return { ok: false, reason: "error", message: "نص القالب مطلوب." };
  }

  // Drop empty buttons; validate the required field per type.
  const buttons = (input.buttons ?? []).filter((b) => b.text.trim());
  for (const b of buttons) {
    if (b.type === "URL" && !b.url?.trim()) {
      return { ok: false, reason: "error", message: "زر الرابط يحتاج عنوان URL" };
    }
    if (b.type === "PHONE_NUMBER" && !b.phoneNumber?.trim()) {
      return { ok: false, reason: "error", message: "زر الاتصال يحتاج رقم هاتف" };
    }
  }

  try {
    const result = await createMessageTemplate(creds.accessToken, creds.wabaId, {
      name,
      category: input.category,
      language: input.language,
      headerText: input.headerText,
      bodyText: input.bodyText,
      footerText: input.footerText,
      buttons: buttons.length > 0 ? buttons : undefined,
      bodyExamples: input.bodyExamples,
    });
    revalidatePath(WHATSAPP_PATH);
    return { ok: true, status: result.status };
  } catch (err) {
    console.error("Failed to create template:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر إرسال القالب للمراجعة.",
    };
  }
}

export async function deleteClinicTemplateAction(input: {
  clinicId: string;
  name: string;
}): Promise<{ ok: true } | ActionError> {
  await requirePlatformAdmin();

  const creds = await getClinicWhatsappCredentials(input.clinicId);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    await deleteMessageTemplate(creds.accessToken, creds.wabaId, input.name);
    revalidatePath(WHATSAPP_PATH);
    return { ok: true };
  } catch (err) {
    console.error("Failed to delete template:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر حذف القالب.",
    };
  }
}

/**
 * Sends an approved template to an arbitrary phone number. Does not touch
 * conversations — it's one-off outreach, unlike `sendWhatsappTemplate` in
 * server/actions/messages.ts, which posts into an existing clinic thread and
 * stays clinic-side.
 */
export async function sendClinicTemplateToNumberAction(input: {
  clinicId: string;
  phone: string;
  name: string;
  language: string;
  variables: string[];
}): Promise<{ ok: true } | ActionError> {
  await requirePlatformAdmin();

  const creds = await getClinicWhatsappCredentials(input.clinicId);
  if (!creds) return { ok: false, reason: "not_configured" };

  const phone = input.phone.replace(/\D/g, "");
  if (!phone) return { ok: false, reason: "error", message: "أدخل رقم هاتف صالحاً." };

  try {
    await sendTemplateMessage(
      phone,
      { name: input.name, languageCode: input.language, variables: input.variables },
      creds
    );
    return { ok: true };
  } catch (err) {
    console.error("Failed to send template to number:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر إرسال القالب.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  WhatsappProviderConflictError,
  deleteWhatsappConfig,
  getClinicWhatsappCredentials,
  saveWhatsappConfig,
} from "@/lib/meta/whatsapp-config";
import {
  disconnectEvolution,
  getEvolutionStatus,
  startEvolutionConnection,
  type EvolutionStatus,
} from "@/lib/evolution/config";
import { getClinicWhatsappProvider } from "@/lib/whatsapp/transport";
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
    if (err instanceof WhatsappProviderConflictError) {
      return { ok: false, reason: "error", message: PROVIDER_CONFLICT_MESSAGE };
    }
    // phoneNumberId is unique across clinics: point at the fix, not the stack.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        reason: "error",
        message: "رقم الواتساب هذا مربوط بعيادة أخرى. افصله من تلك العيادة أولًا ثم أعد المحاولة.",
      };
    }
    console.error("Failed to save WhatsApp config:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر حفظ الإعدادات.",
    };
  }
}

/**
 * Unlinks the clinic's WhatsApp number (deletes its config) so the number can be
 * connected to a different clinic. Returns `{ error }` on failure so the confirm
 * dialog can show it in place.
 */
export async function disconnectClinicWhatsappAction(input: {
  clinicId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  try {
    // Evolution also needs its WhatsApp Web session logged out on the server.
    if ((await getClinicWhatsappProvider(input.clinicId)) === "EVOLUTION") {
      await disconnectEvolution(input.clinicId);
    } else {
      await deleteWhatsappConfig(input.clinicId);
    }
    revalidatePath(WHATSAPP_PATH);
    return { ok: true };
  } catch (err) {
    console.error("Failed to disconnect WhatsApp:", err);
    return { ok: false, error: "تعذّر فصل رقم الواتساب." };
  }
}

// ─── Evolution (unofficial WhatsApp Web) ─────────────────────────────────────

const PROVIDER_CONFLICT_MESSAGE =
  "هذه العيادة مربوطة بطريقة اتصال أخرى. افصل الاتصال الحالي أولًا ثم أعد المحاولة.";

/**
 * Starts linking a phone to the clinic through Evolution: returns a fresh QR
 * (and a pairing code when `phone` is given). Re-running it restarts linking.
 */
export async function startClinicEvolutionAction(input: {
  clinicId: string;
  phone?: string;
}): Promise<{ ok: true; qrDataUrl: string | null; pairingCode: string | null } | ActionError> {
  await requirePlatformAdmin();
  const phone = input.phone?.replace(/\D/g, "") || undefined;
  try {
    const qr = await startEvolutionConnection(input.clinicId, phone);
    revalidatePath(WHATSAPP_PATH);
    return { ok: true, ...qr };
  } catch (err) {
    if (err instanceof WhatsappProviderConflictError) {
      return { ok: false, reason: "error", message: PROVIDER_CONFLICT_MESSAGE };
    }
    console.error("Failed to start Evolution connection:", err);
    return {
      ok: false,
      reason: "error",
      message:
        err instanceof Error
          ? `تعذّر الاتصال بخادم Evolution: ${err.message}`
          : "تعذّر الاتصال بخادم Evolution.",
    };
  }
}

/** Live link status, polled by the settings panel while it is open. */
export async function getClinicEvolutionStatusAction(input: {
  clinicId: string;
}): Promise<{ ok: true; status: EvolutionStatus } | ActionError> {
  await requirePlatformAdmin();
  try {
    const status = await getEvolutionStatus(input.clinicId);
    if (!status) return { ok: false, reason: "not_configured" };
    return { ok: true, status };
  } catch (err) {
    console.error("Failed to read Evolution status:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر قراءة حالة الاتصال.",
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

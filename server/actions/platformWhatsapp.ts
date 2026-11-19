"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  deleteWhatsappConfig,
  getClinicWhatsappCredentials,
  saveWhatsappConfig,
} from "@/lib/meta/whatsapp-config";
import {
  deleteNumberFor,
  disconnectEvolutionFor,
  evolutionStatusFor,
  setPrimaryFor,
  startEvolutionFor,
  stopSyncFor,
  syncHistoryFor,
  type DeleteNumberResult,
  type EvolutionDisconnectResult,
  type EvolutionStartResult,
  type EvolutionStatusResult,
  type EvolutionSyncResult,
  type NumberManager,
  type RemovalImpactResult,
  type SetBranchResult,
  type SetPrimaryResult,
  removalImpactFor,
  setBranchFor,
} from "@/server/services/evolutionConnection";
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
 * Removes the clinic's official (Cloud API) number so it can be connected to a
 * different clinic. Returns `{ error }` on failure so the confirm dialog can
 * show it in place.
 */
export async function disconnectClinicWhatsappAction(input: {
  clinicId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  try {
    await deleteWhatsappConfig(input.clinicId);
    revalidatePath(WHATSAPP_PATH);
    return { ok: true };
  } catch (err) {
    console.error("Failed to disconnect WhatsApp:", err);
    return { ok: false, error: "تعذّر فصل رقم الواتساب." };
  }
}

// ─── Numbers (WhatsApp Web via Evolution, + main number) ─────────────────────
// Thin platform-admin wrappers; the clinic's own page has its twins in
// server/actions/whatsapp.ts. Both share server/services/evolutionConnection.ts.

/** The platform console manages every number of any clinic. */
function platformManager(clinicId: string): NumberManager {
  return { clinicId, branchIds: null };
}

/** Links a phone: `configId` null attaches a new number, else re-links that one. */
export async function startClinicEvolutionAction(input: {
  clinicId: string;
  configId: string | null;
  phone?: string;
  /** New numbers: the branch it belongs to (null = clinic-level). */
  branchId?: string | null;
}): Promise<EvolutionStartResult> {
  await requirePlatformAdmin();
  const res = await startEvolutionFor(
    platformManager(input.clinicId),
    input.configId,
    input.phone,
    input.branchId ?? null
  );
  if (res.ok) revalidatePath(WHATSAPP_PATH);
  return res;
}

/** A number's live link status + sync progress, polled while its panel is open. */
export async function getClinicEvolutionStatusAction(input: {
  clinicId: string;
  configId: string;
}): Promise<EvolutionStatusResult> {
  await requirePlatformAdmin();
  return evolutionStatusFor(platformManager(input.clinicId), input.configId);
}

/** Starts a number's chat-history import: a fresh 90 days, or resume a stopped one. */
export async function syncClinicEvolutionHistoryAction(input: {
  clinicId: string;
  configId: string;
  mode: "fresh" | "resume";
}): Promise<EvolutionSyncResult> {
  await requirePlatformAdmin();
  return syncHistoryFor(platformManager(input.clinicId), input.configId, input.mode);
}

/** Stops a number's running chat-history import (progress is kept). */
export async function stopClinicEvolutionHistoryAction(input: {
  clinicId: string;
  configId: string;
}): Promise<EvolutionSyncResult> {
  await requirePlatformAdmin();
  return stopSyncFor(platformManager(input.clinicId), input.configId);
}

/** Logs a WhatsApp Web number out; its conversations stay in the inbox. */
export async function disconnectClinicEvolutionAction(input: {
  clinicId: string;
  configId: string;
}): Promise<EvolutionDisconnectResult> {
  await requirePlatformAdmin();
  const res = await disconnectEvolutionFor(platformManager(input.clinicId), input.configId);
  if (res.ok) revalidatePath(WHATSAPP_PATH);
  return res;
}

/** Deletes a WhatsApp Web number for good, with its conversations. */
export async function deleteClinicEvolutionNumberAction(input: {
  clinicId: string;
  configId: string;
}): Promise<DeleteNumberResult> {
  await requirePlatformAdmin();
  const res = await deleteNumberFor(platformManager(input.clinicId), input.configId);
  if (res.ok) revalidatePath(WHATSAPP_PATH);
  return res;
}

/** Makes a number the clinic's main one. */
export async function setClinicPrimaryNumberAction(input: {
  clinicId: string;
  configId: string;
}): Promise<SetPrimaryResult> {
  await requirePlatformAdmin();
  const res = await setPrimaryFor(platformManager(input.clinicId), input.configId);
  if (res.ok) revalidatePath(WHATSAPP_PATH);
  return res;
}

/** What deleting a number for good would delete (for the confirm popup). */
export async function getClinicNumberRemovalImpactAction(input: {
  clinicId: string;
  configId: string;
}): Promise<RemovalImpactResult> {
  await requirePlatformAdmin();
  return removalImpactFor(platformManager(input.clinicId), input.configId);
}

/** Moves a number to a branch, or makes it clinic-level (branchId null). */
export async function setClinicNumberBranchAction(input: {
  clinicId: string;
  configId: string;
  branchId: string | null;
}): Promise<SetBranchResult> {
  await requirePlatformAdmin();
  const res = await setBranchFor(platformManager(input.clinicId), input.configId, input.branchId);
  if (res.ok) revalidatePath(WHATSAPP_PATH);
  return res;
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

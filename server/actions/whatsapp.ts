"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { canAny, getClinicContext, getPermittedContext } from "@/lib/auth";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { listMessageTemplates, type MessageTemplate } from "@/lib/meta/whatsapp";
import { getClinicWhatsappProvider } from "@/lib/whatsapp/transport";
import {
  disconnectEvolutionFor,
  evolutionStatusFor,
  queueEvolutionHistorySync,
  startEvolutionFor,
  type EvolutionDisconnectResult,
  type EvolutionStartResult,
  type EvolutionStatusResult,
  type EvolutionSyncResult,
} from "@/server/services/evolutionConnection";

/**
 * What a CLINIC admin may still do with WhatsApp.
 *
 * Credentials and template management moved to the platform console
 * (server/actions/platformWhatsapp.ts) — a clinic never sees or edits its own
 * Meta credentials. What stays here is the single read a clinic admin genuinely
 * needs: listing the clinic's approved templates, because the Messages inbox
 * sends them into conversations and the reminders page binds them to
 * appointments. Both are clinic-level work that would otherwise break.
 *
 * The one thing a clinic may set up itself is the unofficial WhatsApp Web link
 * (see the Evolution section below): it's just scanning a QR with the clinic's
 * own phone.
 */

type ActionError = {
  ok: false;
  reason: "unauthorized" | "forbidden" | "not_configured" | "error";
  message?: string;
};

export async function listTemplatesAction(): Promise<
  { ok: true; templates: MessageTemplate[] } | ActionError
> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (!canAny(ctx, ["messages", "whatsapp"])) return { ok: false, reason: "forbidden" };

  const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
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

// ─── Self-service WhatsApp Web (Evolution) ───────────────────────────────────
// A clinic links its OWN number through WhatsApp Web by scanning a QR — no Meta
// secrets involved. The clinic is always the caller's own (from the request
// host), never a clinicId from the client. The official Cloud API stays
// platform-only: these refuse to touch a clinic connected through Meta.

const CONFIGURATION_PATH = "/admin/whatsapp/configuration";
const NOT_ALLOWED = "ليست لديك صلاحية إدارة واتساب لهذه العيادة.";

export async function startEvolutionAction(phone?: string): Promise<EvolutionStartResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  const res = await startEvolutionFor(ctx.clinic.id, phone);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

export async function getEvolutionStatusAction(): Promise<EvolutionStatusResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  return evolutionStatusFor(ctx.clinic.id);
}

export async function syncEvolutionHistoryAction(): Promise<EvolutionSyncResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  return queueEvolutionHistorySync(ctx.clinic.id);
}

export async function disconnectEvolutionAction(): Promise<EvolutionDisconnectResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, error: NOT_ALLOWED };
  // Only an Evolution link is the clinic's to remove; an official one is ours.
  if ((await getClinicWhatsappProvider(ctx.clinic.id)) !== "EVOLUTION") {
    return { ok: false, error: "لا يوجد ربط واتساب ويب لفصله." };
  }
  const res = await disconnectEvolutionFor(ctx.clinic.id);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

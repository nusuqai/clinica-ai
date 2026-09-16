"use server";

import { Role } from "@prisma/client";
import { getClinicContext } from "@/lib/auth";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { listMessageTemplates, type MessageTemplate } from "@/lib/meta/whatsapp";

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
 * Read-only by design: nothing here writes, so there is nothing to revalidate.
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
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

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

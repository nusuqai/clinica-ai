"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { canAny, getClinicContext, getPermittedContext, type ClinicContext } from "@/lib/auth";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { listMessageTemplates, type MessageTemplate } from "@/lib/meta/whatsapp";
import {
  disconnectEvolutionFor,
  evolutionStatusFor,
  setPrimaryFor,
  startEvolutionFor,
  stopSyncFor,
  syncHistoryFor,
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

// ─── Self-service WhatsApp Web numbers (Evolution) ───────────────────────────
// A clinic links its OWN numbers through WhatsApp Web by scanning a QR — no Meta
// secrets involved — and can attach several. The clinic is always the caller's
// own (from the request host), never a clinicId from the client; every number
// id is checked against it. The official Cloud API number stays platform-
// managed: these never touch it (beyond choosing the main number).

const CONFIGURATION_PATH = "/admin/whatsapp/configuration";

/** The caller manages the whole clinic's numbers, or only their branches'. */
function numberManager(ctx: ClinicContext): NumberManager {
  return { clinicId: ctx.clinic.id, branchIds: ctx.branchIds };
}
const NOT_ALLOWED = "ليست لديك صلاحية إدارة واتساب لهذه العيادة.";

/** Links a phone: `configId` null attaches a new number, else re-links that one. */
export async function startEvolutionAction(
  configId: string | null,
  phone?: string,
  /** New numbers: the branch it belongs to (null = clinic-level). */
  branchId?: string | null
): Promise<EvolutionStartResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  const res = await startEvolutionFor(numberManager(ctx), configId, phone, branchId ?? null);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

export async function getEvolutionStatusAction(configId: string): Promise<EvolutionStatusResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  return evolutionStatusFor(numberManager(ctx), configId);
}

export async function syncEvolutionHistoryAction(
  configId: string,
  mode: "fresh" | "resume"
): Promise<EvolutionSyncResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  return syncHistoryFor(numberManager(ctx), configId, mode === "resume" ? "resume" : "fresh");
}

export async function stopEvolutionHistoryAction(configId: string): Promise<EvolutionSyncResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, reason: "error", message: NOT_ALLOWED };
  return stopSyncFor(numberManager(ctx), configId);
}

/** Unlinks one of the clinic's WhatsApp Web numbers (never the official one). */
export async function disconnectEvolutionAction(
  configId: string
): Promise<EvolutionDisconnectResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, error: NOT_ALLOWED };
  const res = await disconnectEvolutionFor(numberManager(ctx), configId);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

/** Makes one of the clinic's numbers its main number. */
export async function setPrimaryNumberAction(configId: string): Promise<SetPrimaryResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, error: NOT_ALLOWED };
  const res = await setPrimaryFor(numberManager(ctx), configId);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

/** What unlinking a number would delete (for the confirm popup). */
export async function getNumberRemovalImpactAction(configId: string): Promise<RemovalImpactResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, error: NOT_ALLOWED };
  return removalImpactFor(numberManager(ctx), configId);
}

/** Moves a number to a branch, or makes it clinic-level (branchId null). */
export async function setNumberBranchAction(
  configId: string,
  branchId: string | null
): Promise<SetBranchResult> {
  const ctx = await getPermittedContext("whatsapp");
  if (!ctx) return { ok: false, error: NOT_ALLOWED };
  const res = await setBranchFor(numberManager(ctx), configId, branchId);
  if (res.ok) revalidatePath(CONFIGURATION_PATH);
  return res;
}

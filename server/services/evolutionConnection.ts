import "server-only";
import { prisma } from "@/lib/prisma";
import {
  EvolutionNumberNotFoundError,
  disconnectEvolution,
  getEvolutionStatus,
  startEvolutionConnection,
  type EvolutionStatus,
} from "@/lib/evolution/config";
import {
  numberRemovalImpact,
  setPrimaryNumber,
  type NumberRemovalImpact,
} from "@/lib/meta/whatsapp-config";
import {
  getHistorySyncState,
  startHistorySync,
  stopHistorySync,
  type HistorySyncMode,
  type HistorySyncResult,
  type HistorySyncState,
} from "@/server/services/evolutionHistorySync";

/**
 * Managing a clinic's WhatsApp numbers — link a new WhatsApp Web number,
 * re-link, check status, sync history, set its owner (clinic or branch), set the
 * main number, unlink — shared by both audiences that may do it: the platform
 * console (any clinic) and the clinic's own WhatsApp page.
 *
 * Who manages what (`NumberManager`):
 *  - clinic-wide (`branchIds: null` — clinic ADMINs, staff with no branch limit,
 *    platform admins): every number; may make a number clinic-level or move it
 *    to any branch, and choose the main number;
 *  - branch-limited (`branchIds: [...]`): only numbers of their branches; a new
 *    number must belong to one of them; can't make a number clinic-level and
 *    can't change the main number (that's the whole clinic's fallback sender).
 */

export interface NumberManager {
  clinicId: string;
  /** null = clinic-wide; otherwise the branches this manager is limited to. */
  branchIds: readonly string[] | null;
}

export type EvolutionActionError = {
  ok: false;
  reason: "not_configured" | "error";
  message?: string;
};
export type EvolutionStartResult =
  | { ok: true; configId: string; qrDataUrl: string | null; pairingCode: string | null }
  | EvolutionActionError;
export type EvolutionStatusResult =
  { ok: true; status: EvolutionStatus; sync: HistorySyncState | null } | EvolutionActionError;
export type EvolutionSyncResult = HistorySyncResult;
export type EvolutionDisconnectResult = { ok: true } | { ok: false; error: string };
export type SetPrimaryResult = { ok: true } | { ok: false; error: string };
export type SetBranchResult = { ok: true } | { ok: false; error: string };
export type RemovalImpactResult =
  { ok: true; impact: NumberRemovalImpact } | { ok: false; error: string };

const NOT_YOURS = "هذا الرقم غير متاح لك.";

/** The number, if it's the clinic's AND within the manager's branches. */
async function manageableNumber(manager: NumberManager, configId: string) {
  const row = await prisma.whatsappConfig.findFirst({
    where: { id: configId, clinicId: manager.clinicId },
    select: { id: true, branchId: true },
  });
  if (!row) return null;
  if (manager.branchIds === null) return row;
  return row.branchId && manager.branchIds.includes(row.branchId) ? row : null;
}

/**
 * Validates the owner for a number: a branch of this clinic, or null (clinic-
 * level — clinic-wide managers only). Returns the error message, or null if OK.
 */
async function ownerError(manager: NumberManager, branchId: string | null): Promise<string | null> {
  if (branchId === null) {
    return manager.branchIds === null ? null : "اختر أحد فروعك لهذا الرقم.";
  }
  if (manager.branchIds !== null && !manager.branchIds.includes(branchId)) {
    return "لا يمكنك ربط رقم بفرع خارج فروعك.";
  }
  const exists = await prisma.branch.count({ where: { id: branchId, clinicId: manager.clinicId } });
  return exists ? null : "الفرع غير موجود.";
}

/**
 * Starts linking: `configId` null attaches a NEW number owned by `branchId`
 * (null = clinic-level); an existing id re-links that number (its owner stays).
 * A pairing code comes too when `phone` is given.
 */
export async function startEvolutionFor(
  manager: NumberManager,
  configId: string | null,
  phone?: string,
  branchId: string | null = null
): Promise<EvolutionStartResult> {
  if (configId) {
    if (!(await manageableNumber(manager, configId)))
      return { ok: false, reason: "not_configured" };
  } else {
    // A branch-limited manager with a single branch needn't pick it.
    const owner = branchId ?? (manager.branchIds?.length === 1 ? manager.branchIds[0] : null);
    const err = await ownerError(manager, owner);
    if (err) return { ok: false, reason: "error", message: err };
    branchId = owner;
  }
  const digits = phone?.replace(/\D/g, "") || undefined;
  try {
    const qr = await startEvolutionConnection(manager.clinicId, configId, digits, branchId);
    return { ok: true, ...qr };
  } catch (err) {
    if (err instanceof EvolutionNumberNotFoundError) {
      return { ok: false, reason: "not_configured" };
    }
    console.error("Failed to start Evolution connection:", err);
    return {
      ok: false,
      reason: "error",
      message:
        err instanceof Error
          ? `تعذّر الاتصال بخادم واتساب: ${err.message}`
          : "تعذّر الاتصال بخادم واتساب.",
    };
  }
}

/** A number's live link status + its history-sync progress (polled by the panel). */
export async function evolutionStatusFor(
  manager: NumberManager,
  configId: string
): Promise<EvolutionStatusResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, reason: "not_configured" };
  try {
    const status = await getEvolutionStatus(manager.clinicId, configId);
    if (!status) return { ok: false, reason: "not_configured" };
    return { ok: true, status, sync: await getHistorySyncState(manager.clinicId, configId) };
  } catch (err) {
    console.error("Failed to read Evolution status:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "تعذّر قراءة حالة الاتصال.",
    };
  }
}

/**
 * Starts a number's chat-history import in the background: "fresh" = the last
 * 90 days from now, "resume" = continue a stopped sync where it stopped.
 */
export async function syncHistoryFor(
  manager: NumberManager,
  configId: string,
  mode: HistorySyncMode
): Promise<EvolutionSyncResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, reason: "not_configured" };
  try {
    return await startHistorySync(manager.clinicId, configId, mode);
  } catch (err) {
    console.error("Failed to start WhatsApp history sync:", err);
    return { ok: false, reason: "error", message: "تعذّر بدء المزامنة." };
  }
}

/** Stops a number's running import; what was imported stays, resumable later. */
export async function stopSyncFor(
  manager: NumberManager,
  configId: string
): Promise<EvolutionSyncResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, reason: "not_configured" };
  try {
    return await stopHistorySync(manager.clinicId, configId);
  } catch (err) {
    console.error("Failed to stop WhatsApp history sync:", err);
    return { ok: false, reason: "error", message: "تعذّر إيقاف المزامنة." };
  }
}

/** What unlinking a number would delete — for the confirm popup. */
export async function removalImpactFor(
  manager: NumberManager,
  configId: string
): Promise<RemovalImpactResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, error: NOT_YOURS };
  return { ok: true, impact: await numberRemovalImpact(manager.clinicId, configId) };
}

/** Logs a WhatsApp Web number out and removes it with its conversations. */
export async function disconnectEvolutionFor(
  manager: NumberManager,
  configId: string
): Promise<EvolutionDisconnectResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, error: NOT_YOURS };
  try {
    const removed = await disconnectEvolution(manager.clinicId, configId);
    return removed ? { ok: true } : { ok: false, error: "هذا الرقم غير مربوط بالعيادة." };
  } catch (err) {
    console.error("Failed to disconnect WhatsApp:", err);
    return { ok: false, error: "تعذّر فصل رقم الواتساب." };
  }
}

/** Moves a number to a branch (or makes it clinic-level). */
export async function setBranchFor(
  manager: NumberManager,
  configId: string,
  branchId: string | null
): Promise<SetBranchResult> {
  if (!(await manageableNumber(manager, configId))) return { ok: false, error: NOT_YOURS };
  const err = await ownerError(manager, branchId);
  if (err) return { ok: false, error: err };
  await prisma.whatsappConfig.update({ where: { id: configId }, data: { branchId } });
  return { ok: true };
}

/** Makes a number the clinic's main one (fallback sender) — clinic-wide only. */
export async function setPrimaryFor(
  manager: NumberManager,
  configId: string
): Promise<SetPrimaryResult> {
  if (manager.branchIds !== null) {
    return { ok: false, error: "تغيير الرقم الرئيسي متاح لمن يدير العيادة كاملة فقط." };
  }
  try {
    return (await setPrimaryNumber(manager.clinicId, configId))
      ? { ok: true }
      : { ok: false, error: "هذا الرقم غير مربوط بالعيادة." };
  } catch (err) {
    console.error("Failed to set the main WhatsApp number:", err);
    return { ok: false, error: "تعذّر تعيين الرقم الرئيسي." };
  }
}

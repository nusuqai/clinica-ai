import "server-only";
import { WhatsappProviderConflictError } from "@/lib/meta/whatsapp-config";
import {
  disconnectEvolution,
  getEvolutionStatus,
  startEvolutionConnection,
  type EvolutionStatus,
} from "@/lib/evolution/config";
import { getClinicWhatsappProvider } from "@/lib/whatsapp/transport";
import { inngest } from "@/lib/inngest/client";

/**
 * Linking a clinic's phone through Evolution (unofficial WhatsApp Web), shared
 * by both audiences that may do it: the platform console (any clinic) and the
 * clinic's own WhatsApp page (its own clinic only). Callers authorize first;
 * everything here takes an already-trusted clinicId and returns the shapes the
 * EvolutionConnection panel renders.
 */

export type EvolutionActionError = {
  ok: false;
  reason: "not_configured" | "error";
  message?: string;
};
export type EvolutionStartResult =
  { ok: true; qrDataUrl: string | null; pairingCode: string | null } | EvolutionActionError;
export type EvolutionStatusResult = { ok: true; status: EvolutionStatus } | EvolutionActionError;
export type EvolutionSyncResult = { ok: true } | EvolutionActionError;
export type EvolutionDisconnectResult = { ok: true } | { ok: false; error: string };

export const PROVIDER_CONFLICT_MESSAGE =
  "هذه العيادة مربوطة بطريقة اتصال أخرى. افصل الاتصال الحالي أولًا ثم أعد المحاولة.";

/** Starts (or restarts) linking: a fresh QR, plus a pairing code when `phone` is given. */
export async function startEvolutionFor(
  clinicId: string,
  phone?: string
): Promise<EvolutionStartResult> {
  const digits = phone?.replace(/\D/g, "") || undefined;
  try {
    const qr = await startEvolutionConnection(clinicId, digits);
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
          ? `تعذّر الاتصال بخادم واتساب: ${err.message}`
          : "تعذّر الاتصال بخادم واتساب.",
    };
  }
}

/** Live link status, polled by the panel while it is open. */
export async function evolutionStatusFor(clinicId: string): Promise<EvolutionStatusResult> {
  try {
    const status = await getEvolutionStatus(clinicId);
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

/**
 * Queues an import of the last 90 days of 1:1 chats from the linked phone into
 * the inbox. Runs in the background; safe to repeat (imported messages are
 * skipped).
 */
export async function queueEvolutionHistorySync(clinicId: string): Promise<EvolutionSyncResult> {
  if ((await getClinicWhatsappProvider(clinicId)) !== "EVOLUTION") {
    return { ok: false, reason: "not_configured" };
  }
  try {
    await inngest.send({ name: "whatsapp/history.import", data: { clinicId } });
    return { ok: true };
  } catch (err) {
    console.error("Failed to queue WhatsApp history import:", err);
    return { ok: false, reason: "error", message: "تعذّر بدء المزامنة." };
  }
}

/** Logs the linked phone out and removes the clinic's Evolution connection. */
export async function disconnectEvolutionFor(clinicId: string): Promise<EvolutionDisconnectResult> {
  try {
    await disconnectEvolution(clinicId);
    return { ok: true };
  } catch (err) {
    console.error("Failed to disconnect WhatsApp:", err);
    return { ok: false, error: "تعذّر فصل رقم الواتساب." };
  }
}

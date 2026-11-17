import "server-only";
import { WhatsappProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import {
  ensurePrimaryNumber,
  generateWebhookToken,
  removeWhatsappNumber,
  type NumberRemovalImpact,
} from "@/lib/meta/whatsapp-config";
import {
  EvolutionApiError,
  connectInstance,
  createInstance,
  destroyInstance,
  getConnectionState,
  getInstanceOwner,
  type ConnectionState,
  type QrState,
} from "./client";

/**
 * A clinic's WhatsApp Web (Evolution) numbers: each is a `WhatsappConfig` row
 * with provider EVOLUTION + its own instance on the Evolution server. A clinic
 * can link several. Routing works like the Meta side — an unguessable
 * `webhookToken` in each number's callback URL identifies the number (and so
 * the clinic) and gates the endpoint.
 */

/** Stable, unique instance name for a number. (Numbers linked before clinics
 *  could have several kept their older `clinic-{clinicId}` name.) */
function instanceNameFor(configId: string): string {
  return `wa-${configId}`;
}

/**
 * Where the Evolution server should POST events for a clinic. Evolution runs in
 * Docker locally, where `localhost` is the container itself — so
 * EVOLUTION_WEBHOOK_BASE_URL (e.g. http://host.docker.internal:3000) overrides
 * APP_URL for this one URL.
 */
export function evolutionWebhookUrl(webhookToken: string): string {
  const base = (process.env.EVOLUTION_WEBHOOK_BASE_URL || process.env.APP_URL || "").replace(
    /\/+$/,
    ""
  );
  if (!base)
    throw new Error("Set APP_URL (or EVOLUTION_WEBHOOK_BASE_URL) for the Evolution webhook");
  return `${base}/api/evolution/webhook/${webhookToken}`;
}

/** What the webhook route needs to accept an event. */
export interface EvolutionWebhookConfig {
  clinicId: string;
  /** The number's WhatsappConfig id. */
  configId: string;
  instanceName: string;
}

export async function getEvolutionConfigByToken(
  webhookToken: string
): Promise<EvolutionWebhookConfig | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { webhookToken } });
  if (!row || row.provider !== WhatsappProvider.EVOLUTION || !row.evolutionInstanceName) {
    return null;
  }
  return { clinicId: row.clinicId, configId: row.id, instanceName: row.evolutionInstanceName };
}

/** A clinic's WhatsApp Web number, or null if `configId` isn't one of them. */
async function findEvolutionNumber(clinicId: string, configId: string) {
  const row = await prisma.whatsappConfig.findFirst({
    where: { id: configId, clinicId, provider: WhatsappProvider.EVOLUTION },
  });
  return row?.evolutionInstanceName
    ? { ...row, evolutionInstanceName: row.evolutionInstanceName }
    : null;
}

export class EvolutionNumberNotFoundError extends Error {
  constructor() {
    super("This WhatsApp number doesn't belong to the clinic");
    this.name = "EvolutionNumberNotFoundError";
  }
}

/**
 * Starts linking a phone: `configId` null attaches a NEW number to the clinic
 * (creating its row); an existing id re-links that number. Either way the
 * Evolution instance is recreated from scratch so the QR / pairing code is
 * fresh. `number` (digits with country code) additionally requests a pairing
 * code. Returns the number's id with the QR.
 */
export async function startEvolutionConnection(
  clinicId: string,
  configId: string | null,
  number?: string,
  /** For a NEW number: the branch it belongs to (null = a clinic-level number). */
  branchId: string | null = null
): Promise<QrState & { configId: string }> {
  const existing = configId ? await findEvolutionNumber(clinicId, configId) : null;
  if (configId && !existing) throw new EvolutionNumberNotFoundError();

  let row = existing;
  if (!row) {
    const id = randomUUID();
    const hasNumbers = await prisma.whatsappConfig.count({ where: { clinicId } });
    const created = await prisma.whatsappConfig.create({
      data: {
        id,
        clinicId,
        provider: WhatsappProvider.EVOLUTION,
        evolutionInstanceName: instanceNameFor(id),
        webhookToken: generateWebhookToken(),
        branchId,
        // The clinic's first number becomes its main one.
        isPrimary: hasNumbers === 0,
      },
    });
    row = { ...created, evolutionInstanceName: instanceNameFor(id) };
  }

  try {
    // A leftover instance (half-linked, banned, or from an earlier attempt)
    // would keep its old session — start clean every time.
    await destroyInstance(row.evolutionInstanceName);
    const qr = await createInstance(
      row.evolutionInstanceName,
      evolutionWebhookUrl(row.webhookToken),
      number?.replace(/\D/g, "") || undefined
    );
    return { ...qr, configId: row.id };
  } catch (err) {
    // Don't leave a row pointing at an instance that was never created.
    if (!existing) {
      await prisma.whatsappConfig.delete({ where: { id: row.id } }).catch(() => {});
      await ensurePrimaryNumber(clinicId);
    }
    throw err;
  }
}

export interface EvolutionStatus {
  state: ConnectionState;
  /** Latest QR while linking (Evolution rotates it every ~20s). */
  qrDataUrl: string | null;
  /** The linked phone, once `state` is "open". */
  phone: string | null;
  profileName: string | null;
}

/** Live status of one number, polled by the settings UI while it is open. */
export async function getEvolutionStatus(
  clinicId: string,
  configId: string
): Promise<EvolutionStatus | null> {
  const row = await findEvolutionNumber(clinicId, configId);
  if (!row) return null;
  const name = row.evolutionInstanceName;
  let state: ConnectionState;
  try {
    state = await getConnectionState(name);
  } catch (err) {
    // The instance is gone from the Evolution server (deleted there, or the row
    // was made against another server): it's simply not linked — "start" again
    // recreates it.
    if (err instanceof EvolutionApiError && err.status === 404) {
      return { state: "close", qrDataUrl: null, phone: null, profileName: null };
    }
    throw err;
  }
  if (state === "open") {
    const owner = await getInstanceOwner(name).catch(() => ({ phone: null, profileName: null }));
    if (owner.phone && owner.phone !== row.phone) {
      await adoptLinkedPhone(clinicId, row.id, owner.phone);
    }
    return { state, qrDataUrl: null, ...owner };
  }
  // While "connecting", /instance/connect just returns the current QR.
  const qr = await connectInstance(name).catch(() => null);
  return { state, qrDataUrl: qr?.qrDataUrl ?? null, phone: null, profileName: null };
}

/**
 * Records which phone a number is linked to — and if the clinic already had
 * that same phone attached as another WhatsApp Web number (re-linked instead of
 * reconnected), merges the old one into this one: its messages move over (so
 * conversation history stays attributed to one number), it hands over "main
 * number" if it had it, and its instance + row are removed.
 */
export async function adoptLinkedPhone(
  clinicId: string,
  configId: string,
  phone: string
): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return;
  await prisma.whatsappConfig.update({ where: { id: configId }, data: { phone: digits } });

  const duplicates = await prisma.whatsappConfig.findMany({
    where: {
      clinicId,
      provider: WhatsappProvider.EVOLUTION,
      phone: digits,
      NOT: { id: configId },
    },
  });
  for (const old of duplicates) {
    await prisma.message.updateMany({
      where: { whatsappConfigId: old.id },
      data: { whatsappConfigId: configId },
    });
    if (old.evolutionInstanceName) {
      await destroyInstance(old.evolutionInstanceName).catch((err) =>
        console.error("[evolution] failed to remove merged instance:", err)
      );
    }
    await prisma.whatsappConfig.delete({ where: { id: old.id } });
    if (old.isPrimary) {
      await prisma.whatsappConfig.update({ where: { id: configId }, data: { isPrimary: true } });
    }
  }
}

/**
 * Unlinks a number: logs its phone out, deletes its instance, then removes the
 * number together with its conversations (see removeWhatsappNumber). Its saved
 * history sync goes with it, which also makes a running import exit.
 */
export async function disconnectEvolution(
  clinicId: string,
  configId: string
): Promise<NumberRemovalImpact | null> {
  const row = await findEvolutionNumber(clinicId, configId);
  if (!row) return null;
  await destroyInstance(row.evolutionInstanceName);
  return removeWhatsappNumber(clinicId, row.id);
}

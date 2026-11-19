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
  // An unlinked number's instance is gone; a late event for it is ignored.
  if (
    !row ||
    row.provider !== WhatsappProvider.EVOLUTION ||
    !row.evolutionInstanceName ||
    row.unlinkedAt
  ) {
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
 *
 * Re-linking an UNLINKED number brings it back as active right away (its kept
 * conversations are its own again); if the phone scanned turns out to be a
 * different one, adoptLinkedPhone splits the old conversations off first.
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
  if (row?.unlinkedAt) {
    await prisma.whatsappConfig.update({ where: { id: row.id }, data: { unlinkedAt: null } });
    await ensurePrimaryNumber(clinicId);
  }
  if (!row) {
    const id = randomUUID();
    const hasNumbers = await prisma.whatsappConfig.count({
      where: { clinicId, unlinkedAt: null },
    });
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
    } else if (existing.unlinkedAt) {
      // The re-link never got going — leave the number unlinked as it was.
      await prisma.whatsappConfig
        .update({
          where: { id: row.id },
          data: { unlinkedAt: existing.unlinkedAt, isPrimary: false },
        })
        .catch(() => {});
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
 * Records which phone a number is linked to, keeping every number's history
 * attributed to the phone it really went through:
 *
 *  - the number had a DIFFERENT phone before (re-linked by scanning another
 *    phone) and has messages → those are split off to a new, unlinked number
 *    for the old phone, so they keep their label and aren't passed off as the
 *    new phone's;
 *  - the clinic already has this same phone as another WhatsApp Web number
 *    (an unlinked one, or a duplicate link) → that number is merged into this
 *    one: its messages move over (a later history sync then only adds what's
 *    missing), it hands over "main number" if it had it, and its instance + row
 *    are removed.
 */
export async function adoptLinkedPhone(
  clinicId: string,
  configId: string,
  phone: string
): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return;

  const current = await prisma.whatsappConfig.findUnique({ where: { id: configId } });
  if (!current || current.phone === digits) return;

  if (current.phone) {
    const hasMessages = await prisma.message.count({ where: { whatsappConfigId: configId } });
    if (hasMessages > 0) await splitOffOldPhone(current);
  }
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
    if (old.evolutionInstanceName && !old.unlinkedAt) {
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
 * Moves a number's messages to a new UNLINKED number for its previous phone
 * (same branch), so a re-link with a different phone starts clean while the old
 * phone's conversations stay in the inbox under their own label.
 */
async function splitOffOldPhone(row: {
  id: string;
  clinicId: string;
  phone: string | null;
  branchId: string | null;
}): Promise<void> {
  const id = randomUUID();
  await prisma.$transaction([
    prisma.whatsappConfig.create({
      data: {
        id,
        clinicId: row.clinicId,
        provider: WhatsappProvider.EVOLUTION,
        // Never created on the Evolution server; re-linking it creates it.
        evolutionInstanceName: instanceNameFor(id),
        webhookToken: generateWebhookToken(),
        branchId: row.branchId,
        phone: row.phone,
        unlinkedAt: new Date(),
      },
    }),
    prisma.message.updateMany({
      where: { whatsappConfigId: row.id },
      data: { whatsappConfigId: id },
    }),
    // The sync progress was for the old phone's chats.
    prisma.whatsappHistorySync.deleteMany({ where: { whatsappConfigId: row.id } }),
  ]);
}

export type UnlinkOutcome =
  /** Unlinked; its conversations stay in the inbox. */
  | "unlinked"
  /** Nothing ever went through it (e.g. linking was abandoned) — removed. */
  | "removed";

/**
 * Unlinks a number: logs its phone out and deletes its instance, but KEEPS the
 * number with every message and conversation — it's stamped `unlinkedAt`, stops
 * sending/receiving and stops being the main number. Its history-sync progress
 * is dropped (which also makes a running import exit), so linking the phone
 * again starts a fresh import that skips what's already stored. A number with
 * no messages at all has nothing to keep and is removed outright.
 */
export async function unlinkEvolutionNumber(
  clinicId: string,
  configId: string
): Promise<UnlinkOutcome | null> {
  const row = await findEvolutionNumber(clinicId, configId);
  if (!row) return null;
  await destroyInstance(row.evolutionInstanceName);

  const hasMessages = await prisma.message.count({ where: { whatsappConfigId: row.id } });
  if (hasMessages === 0) {
    await removeWhatsappNumber(clinicId, row.id);
    return "removed";
  }
  if (!row.unlinkedAt) {
    await prisma.$transaction([
      prisma.whatsappConfig.update({
        where: { id: row.id },
        data: { unlinkedAt: new Date(), isPrimary: false },
      }),
      prisma.whatsappHistorySync.deleteMany({ where: { whatsappConfigId: row.id } }),
    ]);
    await ensurePrimaryNumber(clinicId);
  }
  return "unlinked";
}

/**
 * Deletes a WhatsApp Web number for good, together with its conversations (see
 * removeWhatsappNumber) — the explicit "delete permanently" action, separate
 * from unlinking. Logs the phone out first if it's still linked.
 */
export async function deleteEvolutionNumber(
  clinicId: string,
  configId: string
): Promise<NumberRemovalImpact | null> {
  const row = await findEvolutionNumber(clinicId, configId);
  if (!row) return null;
  if (!row.unlinkedAt) await destroyInstance(row.evolutionInstanceName);
  return removeWhatsappNumber(clinicId, row.id);
}

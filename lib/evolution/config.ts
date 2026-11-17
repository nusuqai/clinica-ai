import "server-only";
import { WhatsappProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WhatsappProviderConflictError, generateWebhookToken } from "@/lib/meta/whatsapp-config";
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
 * Per-clinic Evolution (unofficial WhatsApp) connection: a `WhatsappConfig` row
 * with provider EVOLUTION + an instance on the Evolution server. Routing works
 * like the Meta side — an unguessable `webhookToken` in the callback URL
 * identifies the clinic and gates the endpoint.
 */

/** Stable, unique instance name for a clinic. */
function instanceNameFor(clinicId: string): string {
  return `clinic-${clinicId}`;
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
  instanceName: string;
}

export async function getEvolutionConfigByToken(
  webhookToken: string
): Promise<EvolutionWebhookConfig | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { webhookToken } });
  if (!row || row.provider !== WhatsappProvider.EVOLUTION || !row.evolutionInstanceName) {
    return null;
  }
  return { clinicId: row.clinicId, instanceName: row.evolutionInstanceName };
}

/**
 * Starts linking a phone to the clinic: creates the config row on first use,
 * then (re)creates the Evolution instance from scratch so the QR / pairing code
 * is fresh. `number` (digits with country code) additionally requests a pairing
 * code. Refuses if the clinic is connected through Meta.
 */
export async function startEvolutionConnection(
  clinicId: string,
  number?: string
): Promise<QrState> {
  const existing = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  if (existing && existing.provider !== WhatsappProvider.EVOLUTION) {
    throw new WhatsappProviderConflictError();
  }

  const instanceName = existing?.evolutionInstanceName ?? instanceNameFor(clinicId);
  const webhookToken = existing?.webhookToken ?? generateWebhookToken();
  if (!existing) {
    await prisma.whatsappConfig.create({
      data: {
        clinicId,
        provider: WhatsappProvider.EVOLUTION,
        evolutionInstanceName: instanceName,
        webhookToken,
      },
    });
  }

  try {
    // A leftover instance (half-linked, banned, or from an earlier attempt)
    // would keep its old session — start clean every time.
    await destroyInstance(instanceName);
    return await createInstance(
      instanceName,
      evolutionWebhookUrl(webhookToken),
      number?.replace(/\D/g, "") || undefined
    );
  } catch (err) {
    // Don't leave a row pointing at an instance that was never created.
    if (!existing) {
      await prisma.whatsappConfig.delete({ where: { clinicId } }).catch(() => {});
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

/** Live status for the settings UI, polled while the panel is open. */
export async function getEvolutionStatus(clinicId: string): Promise<EvolutionStatus | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  if (!row || row.provider !== WhatsappProvider.EVOLUTION || !row.evolutionInstanceName) {
    return null;
  }
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
    return { state, qrDataUrl: null, ...owner };
  }
  // While "connecting", /instance/connect just returns the current QR.
  const qr = await connectInstance(name).catch(() => null);
  return { state, qrDataUrl: qr?.qrDataUrl ?? null, phone: null, profileName: null };
}

/** Logs the phone out, deletes the instance, then the config row. */
export async function disconnectEvolution(clinicId: string): Promise<void> {
  const row = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  if (!row || row.provider !== WhatsappProvider.EVOLUTION) return;
  if (row.evolutionInstanceName) await destroyInstance(row.evolutionInstanceName);
  await prisma.whatsappConfig.delete({ where: { clinicId } });
}

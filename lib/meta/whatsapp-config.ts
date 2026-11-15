import "server-only";
import crypto from "crypto";
import { WhatsappProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";

/**
 * Loads and stores per-clinic WhatsApp Cloud API credentials
 * (`WhatsappConfig`). The access token lives encrypted at rest; this module is
 * the only place it is decrypted, so raw tokens never leak into other layers.
 *
 * Each clinic runs its own Meta app and gets a unique, unguessable webhook URL
 * (the `webhookToken`); routing + endpoint gating happen on that token rather
 * than on app-secret signatures we can't collect.
 */

/** Everything needed to talk to Meta on a clinic's behalf. */
export interface ClinicWhatsappCredentials {
  clinicId: string;
  /** WhatsApp sender id — goes in the messages endpoint URL. */
  phoneNumberId: string;
  /** WhatsApp Business Account id — the node for template management. */
  wabaId: string;
  /** Decrypted system-user access token. */
  accessToken: string;
}

/** Credentials plus the values the webhook route itself needs. */
export interface WebhookConfig extends ClinicWhatsappCredentials {
  /** The verify token to echo the GET handshake against. */
  verifyToken: string;
}

/** Non-secret view for the admin settings UI. The webhook token + verify token
 *  ARE shown (the clinic must copy them into Meta); the access token is not. */
export interface WhatsappConfigStatus {
  /** Which connection this clinic uses. The Meta fields below are null for
   *  EVOLUTION; `evolutionInstanceName` is null for META_CLOUD. */
  provider: WhatsappProvider;
  phoneNumberId: string | null;
  wabaId: string | null;
  evolutionInstanceName: string | null;
  /** Whether a token is stored — the token itself is never sent to the client. */
  hasToken: boolean;
  /** Unguessable token for this clinic's callback URL. */
  webhookToken: string;
  /** Verify token the clinic types into Meta's webhook config. */
  verifyToken: string | null;
  updatedAt: Date;
}

/** Meta credentials from a config row — null unless it is a complete
 *  META_CLOUD row (an EVOLUTION clinic has no Meta credentials). */
function toCredentials(row: {
  clinicId: string;
  provider: WhatsappProvider;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessTokenCipher: string | null;
}): ClinicWhatsappCredentials | null {
  if (row.provider !== WhatsappProvider.META_CLOUD) return null;
  if (!row.phoneNumberId || !row.wabaId || !row.accessTokenCipher) return null;
  return {
    clinicId: row.clinicId,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    accessToken: decryptSecret(row.accessTokenCipher),
  };
}

/**
 * Meta Cloud API credentials for a clinic, or null if it is not connected
 * through Meta (not configured, or connected through Evolution instead). The
 * Meta-only features — templates, appointment reminders — gate on this; plain
 * sends go through `getClinicWhatsappTransport` (lib/whatsapp/transport.ts),
 * which covers both providers.
 */
export async function getClinicWhatsappCredentials(
  clinicId: string
): Promise<ClinicWhatsappCredentials | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  return row ? toCredentials(row) : null;
}

/**
 * Resolves a clinic's config from the unguessable token in its webhook URL —
 * how the shared endpoint routes each request to the owning clinic. Returns the
 * verify token too, so the GET handshake can validate against it.
 */
export async function getWebhookConfigByToken(webhookToken: string): Promise<WebhookConfig | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { webhookToken } });
  const creds = row ? toCredentials(row) : null;
  if (!row || !creds || !row.verifyToken) return null;
  return { ...creds, verifyToken: row.verifyToken };
}

/** Non-secret status for the settings page. */
export async function getWhatsappConfigStatus(
  clinicId: string
): Promise<WhatsappConfigStatus | null> {
  const row = await prisma.whatsappConfig.findUnique({
    where: { clinicId },
    select: WHATSAPP_STATUS_SELECT,
  });
  return row ? toStatus(row) : null;
}

/** The columns `toStatus` needs — never the decrypted token. */
export const WHATSAPP_STATUS_SELECT = {
  provider: true,
  phoneNumberId: true,
  wabaId: true,
  evolutionInstanceName: true,
  accessTokenCipher: true,
  webhookToken: true,
  verifyToken: true,
  updatedAt: true,
} as const;

/** Non-secret status view of a config row (the cipher stops here). */
export function toStatus(row: {
  provider: WhatsappProvider;
  phoneNumberId: string | null;
  wabaId: string | null;
  evolutionInstanceName: string | null;
  accessTokenCipher: string | null;
  webhookToken: string;
  verifyToken: string | null;
  updatedAt: Date;
}): WhatsappConfigStatus {
  return {
    provider: row.provider,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    evolutionInstanceName: row.evolutionInstanceName,
    hasToken: !!row.accessTokenCipher,
    webhookToken: row.webhookToken,
    verifyToken: row.verifyToken,
    updatedAt: row.updatedAt,
  };
}

export interface SaveWhatsappConfigInput {
  phoneNumberId: string;
  wabaId: string;
  /** Optional on update: an empty value keeps the stored token unchanged. */
  accessToken?: string;
}

/** Thrown when a clinic already uses the OTHER provider — one at a time. */
export class WhatsappProviderConflictError extends Error {
  constructor() {
    super("This clinic is connected through another WhatsApp provider — disconnect it first");
    this.name = "WhatsappProviderConflictError";
  }
}

/** URL-safe, unguessable token for a clinic's callback URL (~192 bits). */
export function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** A readable-but-random verify token the clinic pastes into Meta. */
function generateVerifyToken(): string {
  return `vt_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Creates or updates a clinic's WhatsApp config. On update, an empty
 * `accessToken` leaves the existing (encrypted) token in place. The
 * webhook/verify tokens are generated once on creation and kept stable
 * afterwards, so the clinic's callback URL never changes underneath it.
 */
export async function saveWhatsappConfig(
  clinicId: string,
  input: SaveWhatsappConfigInput
): Promise<{ webhookToken: string; verifyToken: string }> {
  const phoneNumberId = input.phoneNumberId.trim();
  const wabaId = input.wabaId.trim();
  const token = input.accessToken?.trim();

  const existing = await prisma.whatsappConfig.findUnique({
    where: { clinicId },
    select: { provider: true, webhookToken: true, verifyToken: true },
  });

  // One provider per clinic: switching from Evolution means disconnecting it
  // first (which also logs the WhatsApp Web session out).
  if (existing && existing.provider !== WhatsappProvider.META_CLOUD) {
    throw new WhatsappProviderConflictError();
  }

  if (!existing && !token) {
    throw new Error("An access token is required to configure WhatsApp");
  }

  if (existing) {
    await prisma.whatsappConfig.update({
      where: { clinicId },
      data: {
        phoneNumberId,
        wabaId,
        ...(token ? { accessTokenCipher: encryptSecret(token) } : {}),
      },
    });
    // A META_CLOUD row always carries a verify token (set on creation).
    return { webhookToken: existing.webhookToken, verifyToken: existing.verifyToken ?? "" };
  }

  const webhookToken = generateWebhookToken();
  const verifyToken = generateVerifyToken();
  await prisma.whatsappConfig.create({
    data: {
      clinicId,
      provider: WhatsappProvider.META_CLOUD,
      phoneNumberId,
      wabaId,
      accessTokenCipher: encryptSecret(token!),
      webhookToken,
      verifyToken,
    },
  });
  return { webhookToken, verifyToken };
}

/**
 * Disconnects a clinic from WhatsApp by deleting its config row. This frees its
 * `phoneNumberId` (unique across clinics) so the same number can be connected
 * to another clinic. The old webhook URL stops resolving immediately, and
 * reconnecting later issues a fresh webhook/verify token pair. Conversations
 * and message history are untouched. Returns false if there was nothing to remove.
 */
export async function deleteWhatsappConfig(clinicId: string): Promise<boolean> {
  const { count } = await prisma.whatsappConfig.deleteMany({ where: { clinicId } });
  return count > 0;
}

import "server-only";
import crypto from "crypto";
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
  phoneNumberId: string;
  wabaId: string;
  /** Whether a token is stored — the token itself is never sent to the client. */
  hasToken: boolean;
  /** Unguessable token for this clinic's callback URL. */
  webhookToken: string;
  /** Verify token the clinic types into Meta's webhook config. */
  verifyToken: string;
  updatedAt: Date;
}

function toCredentials(row: {
  clinicId: string;
  phoneNumberId: string;
  wabaId: string;
  accessTokenCipher: string;
}): ClinicWhatsappCredentials {
  return {
    clinicId: row.clinicId,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    accessToken: decryptSecret(row.accessTokenCipher),
  };
}

/** Credentials for a clinic, or null if it has not been configured yet. */
export async function getClinicWhatsappCredentials(
  clinicId: string,
): Promise<ClinicWhatsappCredentials | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  return row ? toCredentials(row) : null;
}

/**
 * Resolves a clinic's config from the unguessable token in its webhook URL —
 * how the shared endpoint routes each request to the owning clinic. Returns the
 * verify token too, so the GET handshake can validate against it.
 */
export async function getWebhookConfigByToken(
  webhookToken: string,
): Promise<WebhookConfig | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { webhookToken } });
  if (!row) return null;
  return { ...toCredentials(row), verifyToken: row.verifyToken };
}

/** Non-secret status for the settings page. */
export async function getWhatsappConfigStatus(
  clinicId: string,
): Promise<WhatsappConfigStatus | null> {
  const row = await prisma.whatsappConfig.findUnique({
    where: { clinicId },
    select: {
      phoneNumberId: true,
      wabaId: true,
      accessTokenCipher: true,
      webhookToken: true,
      verifyToken: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  return {
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    hasToken: row.accessTokenCipher.length > 0,
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

/** URL-safe, unguessable token for a clinic's callback URL (~192 bits). */
function generateWebhookToken(): string {
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
  input: SaveWhatsappConfigInput,
): Promise<{ webhookToken: string; verifyToken: string }> {
  const phoneNumberId = input.phoneNumberId.trim();
  const wabaId = input.wabaId.trim();
  const token = input.accessToken?.trim();

  const existing = await prisma.whatsappConfig.findUnique({
    where: { clinicId },
    select: { webhookToken: true, verifyToken: true },
  });

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
    return existing;
  }

  const webhookToken = generateWebhookToken();
  const verifyToken = generateVerifyToken();
  await prisma.whatsappConfig.create({
    data: {
      clinicId,
      phoneNumberId,
      wabaId,
      accessTokenCipher: encryptSecret(token!),
      webhookToken,
      verifyToken,
    },
  });
  return { webhookToken, verifyToken };
}

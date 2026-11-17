import "server-only";
import crypto from "crypto";
import { WhatsappProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { deletePatientMediaObject } from "@/lib/supabase/storage";

/**
 * A clinic's WhatsApp numbers (`WhatsappConfig` rows): at most one official
 * Cloud API number plus any WhatsApp Web (Evolution) numbers, exactly one of
 * them the clinic's main number. This module owns the official number's
 * credentials — the access token lives encrypted at rest and is only decrypted
 * here — and the clinic-wide bits: listing numbers, and keeping one main.
 *
 * Each number gets a unique, unguessable webhook URL (the `webhookToken`);
 * routing + endpoint gating happen on that token rather than on app-secret
 * signatures we can't collect.
 */

/** Everything needed to talk to Meta on a clinic's behalf. */
export interface ClinicWhatsappCredentials {
  clinicId: string;
  /** The official number's WhatsappConfig id. */
  configId: string;
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
  id: string;
  /** Which connection this number uses. The Meta fields below are null for
   *  EVOLUTION; `evolutionInstanceName` is null for META_CLOUD. */
  provider: WhatsappProvider;
  /** The clinic's main number (fallback sender). */
  isPrimary: boolean;
  /** The number's own phone, once known. */
  phone: string | null;
  /** The branch it belongs to; null = a clinic-level number. */
  branchId: string | null;
  branchName: string | null;
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
  id: string;
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
    configId: row.id,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    accessToken: decryptSecret(row.accessTokenCipher),
  };
}

/**
 * The clinic's official (Cloud API) number's credentials, or null if it has
 * none. Meta-only features — templates — gate on this; plain sends go through
 * lib/whatsapp/transport.ts, which covers every number.
 */
export async function getClinicWhatsappCredentials(
  clinicId: string
): Promise<ClinicWhatsappCredentials | null> {
  const row = await prisma.whatsappConfig.findFirst({
    where: { clinicId, provider: WhatsappProvider.META_CLOUD },
  });
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

/** Every number of the clinic (main first, then oldest), non-secret. */
export async function getWhatsappNumbers(clinicId: string): Promise<WhatsappConfigStatus[]> {
  const rows = await prisma.whatsappConfig.findMany({
    where: { clinicId },
    orderBy: WHATSAPP_NUMBER_ORDER,
    select: WHATSAPP_STATUS_SELECT,
  });
  return rows.map(toStatus);
}

/** Main number first, then oldest. */
export const WHATSAPP_NUMBER_ORDER = [
  { isPrimary: "desc" as const },
  { createdAt: "asc" as const },
];

/** The columns `toStatus` needs — never the decrypted token. */
export const WHATSAPP_STATUS_SELECT = {
  id: true,
  provider: true,
  isPrimary: true,
  phone: true,
  branchId: true,
  branch: { select: { name: true } },
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
  id: string;
  provider: WhatsappProvider;
  isPrimary: boolean;
  phone: string | null;
  branchId: string | null;
  branch: { name: string } | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  evolutionInstanceName: string | null;
  accessTokenCipher: string | null;
  webhookToken: string;
  verifyToken: string | null;
  updatedAt: Date;
}): WhatsappConfigStatus {
  return {
    id: row.id,
    provider: row.provider,
    isPrimary: row.isPrimary,
    phone: row.phone,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
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

/** URL-safe, unguessable token for a clinic's callback URL (~192 bits). */
export function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** A readable-but-random verify token the clinic pastes into Meta. */
function generateVerifyToken(): string {
  return `vt_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Creates or updates the clinic's official (Cloud API) number. On update, an empty
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

  const existing = await prisma.whatsappConfig.findFirst({
    where: { clinicId, provider: WhatsappProvider.META_CLOUD },
    select: { id: true, webhookToken: true, verifyToken: true },
  });

  if (!existing && !token) {
    throw new Error("An access token is required to configure WhatsApp");
  }

  if (existing) {
    await prisma.whatsappConfig.update({
      where: { id: existing.id },
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
  const hasNumbers = await prisma.whatsappConfig.count({ where: { clinicId } });
  await prisma.whatsappConfig.create({
    data: {
      clinicId,
      provider: WhatsappProvider.META_CLOUD,
      // The clinic's first number becomes its main one.
      isPrimary: hasNumbers === 0,
      phoneNumberId,
      wabaId,
      accessTokenCipher: encryptSecret(token!),
      webhookToken,
      verifyToken,
    },
  });
  return { webhookToken, verifyToken };
}

/** What removing a number would delete — shown in the confirm popup. */
export interface NumberRemovalImpact {
  /** Messages that went through this number. */
  messages: number;
  /** Conversations that contain some of them. */
  conversations: number;
  /** Of those, conversations with nothing else left — deleted entirely. */
  conversationsDeleted: number;
}

/** Messages of a conversation that belong to OTHER numbers (or to none). */
function otherThan(configId: string) {
  return { OR: [{ whatsappConfigId: null }, { whatsappConfigId: { not: configId } }] };
}

export async function numberRemovalImpact(
  clinicId: string,
  configId: string
): Promise<NumberRemovalImpact> {
  const where = { clinicId, whatsappConfigId: configId };
  const [messages, touched] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
  ]);
  const ids = touched.map((t) => t.conversationId);
  const conversationsDeleted = ids.length
    ? await prisma.conversation.count({
        where: { id: { in: ids }, messages: { none: otherThan(configId) } },
      })
    : 0;
  return { messages, conversations: ids.length, conversationsDeleted };
}

/**
 * Removes one of the clinic's numbers AND everything that went through it: its
 * messages are deleted (with their stored media), and conversations left with
 * no messages are deleted entirely. A merged conversation keeps its other
 * numbers' messages. The number's webhook stops resolving immediately; its
 * history-sync state goes with it. Returns what was deleted (null if the number
 * isn't this clinic's). Callers log a WhatsApp Web session out first.
 */
export async function removeWhatsappNumber(
  clinicId: string,
  configId: string
): Promise<NumberRemovalImpact | null> {
  const number = await prisma.whatsappConfig.findFirst({
    where: { id: configId, clinicId },
    select: { id: true },
  });
  if (!number) return null;

  const where = { clinicId, whatsappConfigId: configId };
  const rows = await prisma.message.findMany({
    where,
    select: { conversationId: true, metadata: true },
  });
  const conversationIds = [...new Set(rows.map((r) => r.conversationId))];
  const mediaPaths = rows.flatMap((r) => {
    const meta = r.metadata as {
      media?: { storagePath?: string };
      voice?: { storagePath?: string };
    } | null;
    return [meta?.media?.storagePath, meta?.voice?.storagePath].filter(
      (x): x is string => typeof x === "string" && x.length > 0
    );
  });

  const [{ count: messages }, , { count: conversationsDeleted }] = await prisma.$transaction([
    prisma.message.deleteMany({ where }),
    prisma.whatsappConfig.delete({ where: { id: configId } }),
    prisma.conversation.deleteMany({
      where: { id: { in: conversationIds }, messages: { none: {} } },
    }),
  ]);
  await ensurePrimaryNumber(clinicId);

  // Stored files — best effort; a leftover object is unreachable without its row.
  for (const path of mediaPaths) {
    await deletePatientMediaObject(path).catch(() => false);
  }
  return { messages, conversations: conversationIds.length, conversationsDeleted };
}

/** Removes the clinic's official (Cloud API) number — and its conversations. */
export async function deleteWhatsappConfig(clinicId: string): Promise<boolean> {
  const official = await prisma.whatsappConfig.findFirst({
    where: { clinicId, provider: WhatsappProvider.META_CLOUD },
    select: { id: true },
  });
  if (!official) return false;
  return (await removeWhatsappNumber(clinicId, official.id)) !== null;
}

/** After a number is removed: if the clinic lost its main number, promote the oldest. */
export async function ensurePrimaryNumber(clinicId: string): Promise<void> {
  const primary = await prisma.whatsappConfig.findFirst({
    where: { clinicId, isPrimary: true },
    select: { id: true },
  });
  if (primary) return;
  const oldest = await prisma.whatsappConfig.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (oldest) {
    await prisma.whatsappConfig.update({ where: { id: oldest.id }, data: { isPrimary: true } });
  }
}

/** Makes `configId` the clinic's main number. False if it isn't this clinic's. */
export async function setPrimaryNumber(clinicId: string, configId: string): Promise<boolean> {
  const target = await prisma.whatsappConfig.findFirst({
    where: { id: configId, clinicId },
    select: { id: true },
  });
  if (!target) return false;
  // Unset first: a partial unique index allows only one main number per clinic.
  await prisma.$transaction([
    prisma.whatsappConfig.updateMany({
      where: { clinicId, isPrimary: true, NOT: { id: configId } },
      data: { isPrimary: false },
    }),
    prisma.whatsappConfig.update({ where: { id: configId }, data: { isPrimary: true } }),
  ]);
  return true;
}

import "server-only";
import { WhatsappProvider, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import {
  downloadMedia as metaDownloadMedia,
  markdownToWhatsApp,
  sendMediaMessage as metaSendMedia,
  sendTextMessage as metaSendText,
  uploadMedia as metaUploadMedia,
  type OutboundMediaKind,
} from "@/lib/meta/whatsapp";
import * as evolution from "@/lib/evolution/client";

/**
 * Provider-neutral WhatsApp send/receive seam. A clinic can have several
 * numbers — at most one official Cloud API (META_CLOUD) and any number of
 * WhatsApp Web (EVOLUTION) — and everything that sends a free-form message or
 * downloads inbound media goes through a `WhatsAppTransport` for ONE of them,
 * so callers never branch on the provider themselves.
 *
 * Which number sends is decided by `resolveWhatsappTransport`: the number staff
 * picked, else the one the patient last used in that conversation, else the
 * clinic's main number. Every message row records its number
 * (`whatsappConfigId`), which is what "last used" reads.
 *
 * Meta-only features (template management) stay on
 * `getClinicWhatsappCredentials` in lib/meta/whatsapp-config.ts.
 *
 * All send helpers THROW on failure (callers already catch and mark the
 * message undelivered); each returns the provider message id when one came back.
 */

export type WhatsAppTransport =
  | {
      provider: "META_CLOUD";
      clinicId: string;
      /** The clinic number (WhatsappConfig id) this transport sends from. */
      configId: string;
      phoneNumberId: string;
      wabaId: string;
      accessToken: string;
    }
  | {
      provider: "EVOLUTION";
      clinicId: string;
      configId: string;
      instanceName: string;
    };

export type WhatsAppProviderName = WhatsAppTransport["provider"];

/** How to address a contact: phone, or a platform id (Meta BSUID / WhatsApp LID JID). */
export interface WhatsAppAddress {
  phone?: string | null;
  userId?: string | null;
}

export interface WhatsAppSendOptions {
  /** Provider id of the message to quote (swipe-to-reply). */
  replyToId?: string | null;
}

type ConfigRow = {
  id: string;
  clinicId: string;
  provider: WhatsappProvider;
  evolutionInstanceName: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessTokenCipher: string | null;
};

/** A config row as a send transport, or null when it's incomplete. */
export function toTransport(row: ConfigRow): WhatsAppTransport | null {
  if (row.provider === WhatsappProvider.EVOLUTION) {
    return row.evolutionInstanceName
      ? {
          provider: "EVOLUTION",
          clinicId: row.clinicId,
          configId: row.id,
          instanceName: row.evolutionInstanceName,
        }
      : null;
  }
  if (!row.phoneNumberId || !row.wabaId || !row.accessTokenCipher) return null;
  return {
    provider: "META_CLOUD",
    clinicId: row.clinicId,
    configId: row.id,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    accessToken: decryptSecret(row.accessTokenCipher),
  };
}

/** Main number first, then oldest — the fallback order among a clinic's numbers. */
const FALLBACK_ORDER = [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }];

/** One specific clinic number as a transport (null if not this clinic's / unusable). */
export async function getWhatsappTransportById(
  clinicId: string,
  configId: string
): Promise<WhatsAppTransport | null> {
  const row = await prisma.whatsappConfig.findFirst({ where: { id: configId, clinicId } });
  return row ? toTransport(row) : null;
}

/** The first usable number matching `where`, main number first, then oldest. */
async function firstUsableNumber(
  where: Prisma.WhatsappConfigWhereInput
): Promise<WhatsAppTransport | null> {
  const rows = await prisma.whatsappConfig.findMany({ where, orderBy: FALLBACK_ORDER });
  for (const row of rows) {
    const t = toTransport(row);
    if (t) return t;
  }
  return null;
}

/** The clinic's main number as a transport, or null when WhatsApp isn't connected. */
export function getClinicWhatsappTransport(
  clinicId: string,
  only?: WhatsAppProviderName
): Promise<WhatsAppTransport | null> {
  return firstUsableNumber({ clinicId, ...(only ? { provider: only } : {}) });
}

export interface ResolveTransportOptions {
  /** The number staff picked in the inbox. */
  preferredConfigId?: string | null;
  /** Restrict every step to one provider (custom-text reminders → EVOLUTION). */
  only?: WhatsAppProviderName;
  /** HARD limit — a branch-limited sender may only use these numbers. */
  allowed?: readonly string[] | null;
  /** SOFT preference — an appointment's branch: its numbers win when usable. */
  preferBranchId?: string | null;
}

/**
 * The number to send from in a conversation:
 *  1. `preferredConfigId` — the number staff picked in the inbox;
 *  2. `preferBranchId` — that branch's number the patient last used, else any
 *     of that branch's numbers (appointment reminders);
 *  3. the number the patient last wrote to (else last used at all) here;
 *  4. the clinic's main number (else the oldest usable one).
 * Every step honours `only` and `allowed`.
 */
export async function resolveWhatsappTransport(
  clinicId: string,
  conversationId: string | null,
  opts: ResolveTransportOptions = {}
): Promise<WhatsAppTransport | null> {
  const { preferredConfigId, only, allowed, preferBranchId } = opts;
  const usable = (t: WhatsAppTransport | null) =>
    t && (!only || t.provider === only) && (!allowed || allowed.includes(t.configId)) ? t : null;
  const baseWhere: Prisma.WhatsappConfigWhereInput = {
    clinicId,
    ...(only ? { provider: only } : {}),
    ...(allowed ? { id: { in: [...allowed] } } : {}),
  };

  if (preferredConfigId) {
    const t = usable(await getWhatsappTransportById(clinicId, preferredConfigId));
    if (t) return t;
  }
  if (preferBranchId) {
    const branchNumbers = await prisma.whatsappConfig.findMany({
      where: { ...baseWhere, branchId: preferBranchId },
      select: { id: true },
    });
    const ids = branchNumbers.map((n) => n.id);
    if (ids.length > 0) {
      if (conversationId) {
        const last = await lastUsedWhatsappConfigId(conversationId, only, ids);
        const t = last ? usable(await getWhatsappTransportById(clinicId, last)) : null;
        if (t) return t;
      }
      const t = await firstUsableNumber({ ...baseWhere, id: { in: ids } });
      if (t) return t;
    }
  }
  if (conversationId) {
    const configId = await lastUsedWhatsappConfigId(conversationId, only, allowed);
    if (configId) {
      const t = usable(await getWhatsappTransportById(clinicId, configId));
      if (t) return t;
    }
  }
  return firstUsableNumber(baseWhere);
}

/**
 * The clinic number a conversation last went through — preferring the last one
 * the PATIENT wrote to (that's the chat they're looking at), else whichever
 * number last sent anything. Null when none is recorded.
 */
export async function lastUsedWhatsappConfigId(
  conversationId: string,
  only?: WhatsAppProviderName,
  /** Limit to these numbers (a branch-limited viewer's); null/undefined = any. */
  allowed?: readonly string[] | null
): Promise<string | null> {
  const providerFilter = {
    ...(only ? { whatsappConfig: { provider: only } } : {}),
    ...(allowed ? { whatsappConfigId: { in: [...allowed] } } : {}),
  };
  const fromPatient = await prisma.message.findFirst({
    where: {
      conversationId,
      senderType: "USER",
      whatsappConfigId: { not: null },
      ...providerFilter,
    },
    orderBy: { createdAt: "desc" },
    select: { whatsappConfigId: true },
  });
  if (fromPatient?.whatsappConfigId) return fromPatient.whatsappConfigId;
  const any = await prisma.message.findFirst({
    where: { conversationId, whatsappConfigId: { not: null }, ...providerFilter },
    orderBy: { createdAt: "desc" },
    select: { whatsappConfigId: true },
  });
  return any?.whatsappConfigId ?? null;
}

/**
 * Whether Meta's 24-hour customer-service window gates free-form messages.
 * Only the official API has it — WhatsApp Web can message anyone, any time.
 */
export function hasServiceWindow(provider: WhatsAppProviderName | null): boolean {
  return provider !== "EVOLUTION";
}

/** Which providers the clinic has numbers on (cheap — no decryption). */
export async function getClinicWhatsappProviders(
  clinicId: string
): Promise<WhatsAppProviderName[]> {
  const rows = await prisma.whatsappConfig.findMany({
    where: { clinicId },
    select: { provider: true },
    distinct: ["provider"],
  });
  return rows.map((r) => r.provider);
}

export async function sendWhatsAppText(
  transport: WhatsAppTransport,
  to: WhatsAppAddress,
  text: string,
  options?: WhatsAppSendOptions
): Promise<string | null> {
  if (transport.provider === "EVOLUTION") {
    return evolution.sendText(transport.instanceName, to, markdownToWhatsApp(text), options);
  }
  return metaSendText(to, text, transport, { replyToWamid: options?.replyToId });
}

/** Sends a file staff attached (or any stored media). */
export async function sendWhatsAppMedia(
  transport: WhatsAppTransport,
  to: WhatsAppAddress,
  media: {
    kind: OutboundMediaKind;
    bytes: Buffer;
    mimeType: string;
    filename?: string;
    caption?: string;
  },
  options?: WhatsAppSendOptions
): Promise<string | null> {
  if (transport.provider === "EVOLUTION") {
    return evolution.sendMedia(
      transport.instanceName,
      to,
      {
        mediaType: media.kind,
        bytes: media.bytes,
        mimeType: media.mimeType,
        caption: media.kind === "audio" ? undefined : media.caption,
        fileName: media.filename,
      },
      options
    );
  }
  const mediaId = await metaUploadMedia(
    transport,
    media.bytes,
    media.mimeType,
    media.filename ?? "attachment"
  );
  return metaSendMedia(
    to,
    { kind: media.kind, mediaId, caption: media.caption, filename: media.filename },
    transport,
    { replyToWamid: options?.replyToId }
  );
}

/** WhatsApp only renders OGG/Opus as a voice note on the Cloud API. */
function isOggOpus(mime: string): boolean {
  const base = mime.split(";")[0].trim().toLowerCase();
  return base === "audio/ogg" || base === "audio/opus";
}

/** Sends audio as a voice note (staff recording or the agent's TTS reply). */
export async function sendWhatsAppVoice(
  transport: WhatsAppTransport,
  to: WhatsAppAddress,
  audio: { bytes: Buffer; mimeType: string },
  options?: WhatsAppSendOptions
): Promise<string | null> {
  if (transport.provider === "EVOLUTION") {
    // Evolution transcodes to OGG/Opus itself, so every format becomes a voice note.
    return evolution.sendVoiceNote(transport.instanceName, to, audio.bytes, options);
  }
  const mediaId = await metaUploadMedia(transport, audio.bytes, audio.mimeType, "voice.ogg");
  return metaSendMedia(
    to,
    { kind: "audio", mediaId, voice: isOggOpus(audio.mimeType) },
    transport,
    { replyToWamid: options?.replyToId }
  );
}

/**
 * Downloads an inbound message's media. `mediaId` is Meta's media id on the
 * Cloud API, and the WhatsApp message id on Evolution (which resolves the
 * media from its own message store).
 */
export async function downloadWhatsAppMedia(
  transport: WhatsAppTransport,
  mediaId: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (transport.provider === "EVOLUTION") {
    return evolution.downloadMessageMedia(transport.instanceName, mediaId);
  }
  return metaDownloadMedia(mediaId, transport.accessToken);
}

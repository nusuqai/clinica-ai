import "server-only";
import { WhatsappProvider } from "@prisma/client";
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
 * Provider-neutral WhatsApp send/receive seam. A clinic is connected through
 * exactly one provider — the official Cloud API (META_CLOUD) or Evolution
 * (EVOLUTION, unofficial WhatsApp Web) — and everything that sends a free-form
 * message or downloads inbound media goes through here, so callers never branch
 * on the provider themselves.
 *
 * Meta-only features (templates, appointment reminders) stay on
 * `getClinicWhatsappCredentials` in lib/meta/whatsapp-config.ts.
 *
 * All send helpers THROW on failure (callers already catch and mark the
 * message undelivered); each returns the provider message id when one came back.
 */

export type WhatsAppTransport =
  | {
      provider: "META_CLOUD";
      clinicId: string;
      phoneNumberId: string;
      wabaId: string;
      accessToken: string;
    }
  | {
      provider: "EVOLUTION";
      clinicId: string;
      instanceName: string;
    };

/** How to address a contact: phone, or a platform id (Meta BSUID / WhatsApp LID JID). */
export interface WhatsAppAddress {
  phone?: string | null;
  userId?: string | null;
}

export interface WhatsAppSendOptions {
  /** Provider id of the message to quote (swipe-to-reply). */
  replyToId?: string | null;
}

/** The clinic's send transport, or null when WhatsApp isn't connected. */
export async function getClinicWhatsappTransport(
  clinicId: string
): Promise<WhatsAppTransport | null> {
  const row = await prisma.whatsappConfig.findUnique({ where: { clinicId } });
  if (!row) return null;
  if (row.provider === WhatsappProvider.EVOLUTION) {
    return row.evolutionInstanceName
      ? { provider: "EVOLUTION", clinicId, instanceName: row.evolutionInstanceName }
      : null;
  }
  if (!row.phoneNumberId || !row.wabaId || !row.accessTokenCipher) return null;
  return {
    provider: "META_CLOUD",
    clinicId,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    accessToken: decryptSecret(row.accessTokenCipher),
  };
}

/**
 * Whether Meta's 24-hour customer-service window gates free-form messages.
 * Only the official API has it — WhatsApp Web can message anyone, any time.
 */
export function hasServiceWindow(provider: WhatsAppTransport["provider"] | null): boolean {
  return provider !== "EVOLUTION";
}

/** The clinic's provider (cheap — no decryption), or null if not connected. */
export async function getClinicWhatsappProvider(
  clinicId: string
): Promise<WhatsAppTransport["provider"] | null> {
  const row = await prisma.whatsappConfig.findUnique({
    where: { clinicId },
    select: { provider: true },
  });
  return row?.provider ?? null;
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

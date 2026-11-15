/**
 * Parses Evolution API (WhatsApp Web / Baileys) `messages.upsert` webhook events
 * into the same `InboundEnvelope` the Meta parser produces, so both providers
 * share one ingest path (server/services/whatsappIngest.ts).
 *
 * Baileys message shape: `data.message` holds exactly one content key
 * (`conversation`, `extendedTextMessage`, `imageMessage`, …), sometimes wrapped
 * in `ephemeralMessage` / `viewOnceMessage*` / `documentWithCaptionMessage`.
 * Media is referenced by the message id (`key.id`), which Evolution resolves
 * when we ask it to download (lib/evolution/client.ts).
 */

import { MEDIA_NOTICES } from "@/lib/meta/inbound";
import type { InboundEnvelope, InboundWhatsAppMessage } from "@/lib/meta/whatsapp-inbound";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Wrapper keys whose `.message` holds the real content. */
const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

/** Keys that ride alongside the content and are never the content itself. */
const NON_CONTENT_KEYS = new Set([
  "messageContextInfo",
  "senderKeyDistributionMessage",
  "base64",
  "mediaUrl",
]);

/** Pure bookkeeping — drop without a trace. */
const SILENT_TYPES = new Set([
  "protocolMessage", // deletes, ephemeral-setting changes, history sync
  "editedMessage",
  "pollUpdateMessage",
  "keepInChatMessage",
  "pinInChatMessage",
]);

function unwrap(message: Obj): Obj {
  let m = message;
  for (let i = 0; i < 3; i++) {
    const key = WRAPPERS.find((k) => obj(m[k]));
    const inner = key ? obj(obj(m[key])?.message) : undefined;
    if (!inner) break;
    m = inner;
  }
  return m;
}

/** The single content key of a (unwrapped) Baileys message. */
function contentType(message: Obj): string | undefined {
  return Object.keys(message).find((k) => !NON_CONTENT_KEYS.has(k) && message[k] != null);
}

function quotedId(content: unknown): string | null {
  return str(obj(obj(content)?.contextInfo)?.stanzaId) ?? null;
}

function classify(
  type: string | undefined,
  message: Obj,
  messageId: string
): InboundWhatsAppMessage {
  if (!type || SILENT_TYPES.has(type)) return { kind: "ignore" };
  const c = obj(message[type]) ?? {};
  const text = (s: string | undefined): InboundWhatsAppMessage =>
    s?.trim() ? { kind: "text", text: s.trim() } : { kind: "ignore" };

  switch (type) {
    case "conversation":
      return text(str(message.conversation));
    case "extendedTextMessage":
      return text(str(c.text));
    // Button / list taps read as the label the patient picked.
    case "buttonsResponseMessage":
    case "templateButtonReplyMessage":
      return text(str(c.selectedDisplayText));
    case "listResponseMessage":
      return text(str(c.title));

    case "audioMessage":
      return { kind: "voice", mediaId: messageId, mimeType: str(c.mimetype) ?? "audio/ogg" };

    case "imageMessage":
      return {
        kind: "image",
        mediaId: messageId,
        mimeType: str(c.mimetype) ?? "image/jpeg",
        caption: str(c.caption)?.trim() || undefined,
      };

    case "videoMessage":
    case "documentMessage":
    case "stickerMessage": {
      const mediaKind =
        type === "videoMessage" ? "video" : type === "documentMessage" ? "document" : "sticker";
      const fallbackMime =
        mediaKind === "video"
          ? "video/mp4"
          : mediaKind === "sticker"
            ? "image/webp"
            : "application/octet-stream";
      return {
        kind: "media",
        mediaKind,
        mediaId: messageId,
        mimeType: str(c.mimetype) ?? fallbackMime,
        filename: str(c.fileName)?.trim() || undefined,
        caption: str(c.caption)?.trim() || undefined,
      };
    }

    case "locationMessage":
    case "liveLocationMessage": {
      const lat = c.degreesLatitude;
      const lng = c.degreesLongitude;
      const label = str(c.name)?.trim() || str(c.address)?.trim() || "";
      const link = lat != null && lng != null ? ` https://maps.google.com/?q=${lat},${lng}` : "";
      return {
        kind: "structured",
        structuredKind: "location",
        data: { latitude: lat, longitude: lng, name: c.name, address: c.address },
        summary: `📍 موقع${label ? `: ${label}` : ""}${link}`.trim(),
      };
    }

    case "contactMessage":
    case "contactsArrayMessage": {
      const list = type === "contactMessage" ? [c] : ((c.contacts as Obj[] | undefined) ?? []);
      const names = list.map((x) => str(x.displayName)).filter(Boolean);
      return {
        kind: "structured",
        structuredKind: "contacts",
        data: list,
        summary: `👤 جهة اتصال${names.length ? `: ${names.join("، ")}` : ""}`,
      };
    }

    case "reactionMessage": {
      const target = str(obj(c.key)?.id);
      if (!target) return { kind: "ignore" };
      return { kind: "reaction", emoji: str(c.text)?.trim() ?? "", targetWamid: target };
    }

    default:
      return { kind: "unsupported", ...MEDIA_NOTICES.unknown };
  }
}

const isUserJid = (j: string | undefined) => !!j?.endsWith("@s.whatsapp.net");
const isLidJid = (j: string | undefined) => !!j?.endsWith("@lid");

/** Digits of a phone JID ("2010…@s.whatsapp.net" or "2010…:12@s.whatsapp.net"). */
const jidPhone = (j: string) => j.split("@")[0].split(":")[0];

/** One `data` object of a messages.upsert event → envelope, or null to skip. */
function toEnvelope(data: Obj, instanceName: string): InboundEnvelope | null {
  const key = obj(data.key);
  if (!key || key.fromMe === true) return null; // our own sends echo back here
  const messageId = str(key.id);
  const remoteJid = str(key.remoteJid);
  if (!messageId || !remoteJid) return null;

  // 1:1 chats only — groups (@g.us), status broadcasts and channels are ignored.
  // Newer WhatsApp addresses many contacts by a privacy "LID" (…@lid), with the
  // phone JID in remoteJidAlt / senderPn when WhatsApp shares it.
  const candidates = [remoteJid, str(key.remoteJidAlt), str(key.senderPn)];
  const phoneJid = candidates.find(isUserJid);
  const lidJid = candidates.find(isLidJid);
  if (!phoneJid && !lidJid) return null;

  const phone = phoneJid ? jidPhone(phoneJid) : null;
  // The LID is a stable per-contact id — kept as the conversation's userId so a
  // contact who later shows up LID-only still lands in the same thread.
  const userId = lidJid ?? null;

  const message = unwrap(obj(data.message) ?? {});
  const type = contentType(message);

  return {
    phone,
    userId,
    name: str(data.pushName)?.trim() || phone || userId || "WhatsApp",
    messageId,
    quotedWamid: type ? quotedId(message[type]) : null,
    phoneNumberId: instanceName,
    message: classify(type, message, messageId),
  };
}

/** Normalised event name: "messages.upsert" / "MESSAGES_UPSERT" → "messages_upsert". */
export function evolutionEventName(payload: Obj): string {
  return (str(payload.event) ?? "").toLowerCase().replace(/\./g, "_");
}

/** Flattens a messages.upsert event into envelopes (data may be one or many). */
export function parseEvolutionMessages(payload: Obj): InboundEnvelope[] {
  if (evolutionEventName(payload) !== "messages_upsert") return [];
  const instanceName = str(payload.instance) ?? "";
  const items = Array.isArray(payload.data) ? payload.data : [payload.data];
  return items
    .map((d) => obj(d))
    .filter((d): d is Obj => !!d)
    .map((d) => toEnvelope(d, instanceName))
    .filter((e): e is InboundEnvelope => e !== null);
}

/**
 * Classifies inbound WhatsApp Cloud API webhook payloads.
 *
 * Every message a patient sends is archived so the clinic keeps a record
 * independent of WhatsApp. Text and voice are answerable directly; an image is
 * answerable when the clinic enabled image analysis. Everything else (video,
 * document, sticker, location, contacts, order) is stored and handed to a human.
 * Reactions are archived silently; only true bookkeeping (system notices, edits)
 * is dropped.
 */

import { MEDIA_NOTICES, type UnsupportedMediaType } from "./inbound";

export type { UnsupportedMediaType };

/** Downloadable, human-only media kinds (image is handled separately). */
export type ArchivedMediaKind = "video" | "document" | "sticker";
/** Structured (no-file) message kinds. */
export type StructuredKind = "location" | "contacts" | "order";

export type InboundWhatsAppMessage =
  | { kind: "text"; text: string }
  /** A voice note / audio message — downloaded, transcribed, then fed to the
   *  agent as a text turn (issue #49). */
  | { kind: "voice"; mediaId: string; mimeType: string }
  /** A photo — downloaded + archived; read by the agent only when the clinic
   *  enabled image analysis (issue #52). */
  | { kind: "image"; mediaId: string; mimeType: string; caption?: string }
  /** Downloadable media the agent can't read — archived, then escalated. */
  | {
      kind: "media";
      mediaKind: ArchivedMediaKind;
      mediaId: string;
      mimeType: string;
      filename?: string;
      caption?: string;
    }
  /** A structured message (location / contact card / order) — no file to store,
   *  so the raw payload is kept and a readable summary is the content. */
  | {
      kind: "structured";
      structuredKind: StructuredKind;
      data: unknown;
      summary: string;
    }
  /** An emoji reaction to a previous message — archived, no reply. */
  | { kind: "reaction"; emoji: string }
  /** A type we don't recognise — archived with a placeholder, then escalated. */
  | ({ kind: "unsupported" } & UnsupportedMediaType)
  /** Bookkeeping traffic (system notices, edits, reaction removals) — answering
   *  it would be noise, so the webhook drops it without a trace. */
  | { kind: "ignore" };

const UNKNOWN_TYPE: UnsupportedMediaType = MEDIA_NOTICES.unknown;

/** Carry no answerable content — dropped without a trace. Reactions are NOT
 *  here anymore: they're archived (see `classify`). */
const SILENT_TYPES = new Set([
  // Number changes, identity updates, "security code changed" notices.
  "system",
]);

/** Builds a readable Arabic one-liner for a structured message. */
function summariseStructured(kind: StructuredKind, data: Record<string, unknown>): string {
  if (kind === "location") {
    const lat = data.latitude;
    const lng = data.longitude;
    const name = (data.name as string | undefined)?.trim();
    const address = (data.address as string | undefined)?.trim();
    const label = name || address || "";
    const link = lat != null && lng != null ? ` https://maps.google.com/?q=${lat},${lng}` : "";
    return `📍 موقع${label ? `: ${label}` : ""}${link}`.trim();
  }
  if (kind === "contacts") {
    const list = Array.isArray(data) ? data : [];
    const names = list
      .map((c) => (c as { name?: { formatted_name?: string } }).name?.formatted_name)
      .filter(Boolean);
    return `👤 جهة اتصال${names.length ? `: ${names.join("، ")}` : ""}`;
  }
  // order
  const items = (data.product_items as unknown[] | undefined)?.length ?? 0;
  return `🛒 طلب${items ? ` (${items} منتج)` : ""}`;
}

/**
 * Pulls the WhatsApp sender id (`metadata.phone_number_id`) out of a raw
 * payload without trusting anything else in it. The webhook needs this *before*
 * signature verification, to look up which clinic's app secret to verify with.
 * Present on message payloads and status receipts alike.
 */
export function extractPhoneNumberId(payload: Record<string, unknown>): string | undefined {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as
        Record<string, unknown> | undefined;
      const id = (value?.metadata as { phone_number_id?: string } | undefined)?.phone_number_id;
      if (id) return id;
    }
  }
  return undefined;
}

export interface InboundEnvelope {
  /**
   * Sender's number, digits only — matches `Conversation.whatsappPhone`. Null
   * when the contact's phone is hidden (WhatsApp username): the payload then
   * carries only `userId` (a BSUID). At least one of phone/userId is present.
   */
  phone: string | null;
  /**
   * Meta Business-Scoped User ID (`contacts[].user_id` / `messages[].from_user_id`,
   * format "CC.alphanumeric") — matches `Conversation.whatsappUserId`. Always
   * present on new-format payloads; null on legacy phone-only ones.
   */
  userId: string | null;
  /** WhatsApp profile name, falling back to the phone number or BSUID. */
  name: string;
  /** Meta's message id (`wamid.…`), needed to mark read / show typing. */
  messageId: string;
  /** The clinic's WhatsApp sender id this arrived on — routes to a clinic. */
  phoneNumberId: string;
  message: InboundWhatsAppMessage;
}

function classify(msg: Record<string, unknown>): InboundWhatsAppMessage {
  const type = msg.type as string | undefined;

  if (type === "text") {
    const text = (msg.text as { body?: string } | undefined)?.body;
    // A text message with no body is degenerate, not an unsupported type —
    // don't answer it with the "send text only" notice.
    return text?.trim() ? { kind: "text", text: text.trim() } : { kind: "ignore" };
  }

  // Replies to interactive buttons/lists carry their label as the user's
  // intent, so they read as ordinary text to the agent.
  if (type === "interactive") {
    const interactive = msg.interactive as Record<string, unknown> | undefined;
    const reply = (interactive?.button_reply ?? interactive?.list_reply) as
      { title?: string } | undefined;
    return reply?.title?.trim() ? { kind: "text", text: reply.title.trim() } : { kind: "ignore" };
  }

  // Quick-reply button on a template we sent.
  if (type === "button") {
    const text = (msg.button as { text?: string } | undefined)?.text;
    return text?.trim() ? { kind: "text", text: text.trim() } : { kind: "ignore" };
  }

  // Voice notes arrive as type "audio" (with `audio.voice = true`); some legacy
  // payloads use "voice". Either way we carry the media id + mime downstream to
  // download, store and transcribe.
  if (type === "audio" || type === "voice") {
    const media = (msg.audio ?? msg.voice) as { id?: string; mime_type?: string } | undefined;
    if (media?.id) {
      return { kind: "voice", mediaId: media.id, mimeType: media.mime_type ?? "audio/ogg" };
    }
    return { kind: "ignore" };
  }

  // A photo: downloaded + archived, and read by the agent only if the clinic
  // enabled image analysis (decided downstream, not here).
  if (type === "image") {
    const img = msg.image as { id?: string; mime_type?: string; caption?: string } | undefined;
    if (img?.id) {
      return {
        kind: "image",
        mediaId: img.id,
        mimeType: img.mime_type ?? "image/jpeg",
        caption: img.caption?.trim() || undefined,
      };
    }
    return { kind: "ignore" };
  }

  // Video / document / sticker: downloadable but the agent can't read them —
  // archived, then escalated to a human.
  if (type === "video" || type === "document" || type === "sticker") {
    const media = msg[type] as
      { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined;
    if (media?.id) {
      return {
        kind: "media",
        mediaKind: type,
        mediaId: media.id,
        mimeType:
          media.mime_type ??
          (type === "video"
            ? "video/mp4"
            : type === "sticker"
              ? "image/webp"
              : "application/octet-stream"),
        filename: media.filename?.trim() || undefined,
        caption: media.caption?.trim() || undefined,
      };
    }
    return { kind: "ignore" };
  }

  // Structured, no-file messages: kept verbatim + summarised, then escalated.
  if (type === "location" || type === "contacts" || type === "order") {
    const data = msg[type] as Record<string, unknown> | unknown[] | undefined;
    if (data) {
      return {
        kind: "structured",
        structuredKind: type,
        data,
        summary: summariseStructured(type, data as Record<string, unknown>),
      };
    }
    return { kind: "ignore" };
  }

  // Emoji reaction to an earlier message — archived, no reply. An empty emoji is
  // a reaction *removal*: nothing to record.
  if (type === "reaction") {
    const emoji = (msg.reaction as { emoji?: string } | undefined)?.emoji?.trim();
    return emoji ? { kind: "reaction", emoji } : { kind: "ignore" };
  }

  if (!type || SILENT_TYPES.has(type)) return { kind: "ignore" };

  return { kind: "unsupported", ...UNKNOWN_TYPE };
}

/**
 * Flattens a webhook body into one envelope per inbound message.
 *
 * A single POST can legitimately batch several messages across several
 * entries. Delivery/read receipts arrive on this same subscription under
 * `statuses` rather than `messages`, and are skipped — there is no `messages`
 * array to iterate on those payloads.
 */
export function parseWebhookPayload(payload: Record<string, unknown>): InboundEnvelope[] {
  const envelopes: InboundEnvelope[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as
        Record<string, unknown> | undefined;
      const messages = value?.messages;
      if (!Array.isArray(messages)) {
        // Status/read receipts land here (they carry `statuses`, not `messages`).
        const keys = value ? Object.keys(value) : [];
        console.log(
          `[wa-debug] parse: change has no messages[] (keys=${keys.join(",")}) — skipped`
        );
        continue;
      }

      // The sender id these messages came in on — the routing key to a clinic.
      const phoneNumberId = (value?.metadata as { phone_number_id?: string } | undefined)
        ?.phone_number_id;
      if (!phoneNumberId) {
        console.warn(
          "[wa-debug] parse: change value missing metadata.phone_number_id — whole change skipped"
        );
        continue;
      }

      // identity (wa_id / phone OR user_id / BSUID) → profile name, so batched
      // messages from different contacts each get the right display name.
      const names = new Map<string, string>();
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const contact of contacts) {
        const c = contact as Record<string, unknown>;
        const name = (c.profile as { name?: string } | undefined)?.name;
        if (!name) continue;
        const waId = c.wa_id as string | undefined;
        const userId = c.user_id as string | undefined;
        if (waId) names.set(waId, name);
        if (userId) names.set(userId, name);
      }

      for (const raw of messages) {
        const msg = raw as Record<string, unknown>;
        // Classic payloads carry `from` (phone); since the usernames rollout a
        // contact with a hidden phone carries only `from_user_id` (a BSUID).
        const phone = (msg.from as string | undefined) ?? null;
        const userId = (msg.from_user_id as string | undefined) ?? null;
        const messageId = msg.id as string | undefined;
        // Need the message id plus at least one way to identify/reply to the sender.
        if (!messageId || (!phone && !userId)) {
          console.warn(
            `[wa-debug] parse: message missing id and/or sender identity (type=${msg.type}) — skipped, not stored`
          );
          continue;
        }

        const message = classify(msg);
        console.log(
          `[wa-debug] parse: message phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} id=${messageId} type=${msg.type} → kind=${message.kind}`
        );
        envelopes.push({
          phone,
          userId,
          name: names.get(phone ?? "") ?? names.get(userId ?? "") ?? phone ?? userId ?? "",
          messageId,
          phoneNumberId,
          message,
        });
      }
    }
  }

  return envelopes;
}

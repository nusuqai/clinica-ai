/**
 * Classifies inbound WhatsApp Cloud API webhook payloads.
 *
 * The agent only understands text, so anything else has to be recognised and
 * answered with a notice rather than fed to the LLM as a placeholder string.
 */

import { MEDIA_NOTICES, type UnsupportedMediaType } from "./inbound";

export type { UnsupportedMediaType };

export type InboundWhatsAppMessage =
  | { kind: "text"; text: string }
  | ({ kind: "unsupported" } & UnsupportedMediaType)
  /** Bookkeeping traffic (reactions, edits, deletions) — answering it would be
   *  noise, so the webhook drops it without a trace. */
  | { kind: "ignore" };

/** Cloud API `type` values the agent can't read, with their Arabic notices. */
const UNSUPPORTED_TYPES: Record<string, UnsupportedMediaType> = {
  image: MEDIA_NOTICES.image,
  video: MEDIA_NOTICES.video,
  audio: MEDIA_NOTICES.audio,
  voice: MEDIA_NOTICES.audio,
  document: MEDIA_NOTICES.file,
  sticker: MEDIA_NOTICES.sticker,
  location: MEDIA_NOTICES.location,
  contacts: MEDIA_NOTICES.contact,
  order: MEDIA_NOTICES.order,
};

const UNKNOWN_TYPE: UnsupportedMediaType = MEDIA_NOTICES.unknown;

/** Carry no answerable content — dropped without a trace. */
const SILENT_TYPES = new Set([
  "reaction",
  // Number changes, identity updates, "security code changed" notices.
  "system",
]);

/**
 * Pulls the WhatsApp sender id (`metadata.phone_number_id`) out of a raw
 * payload without trusting anything else in it. The webhook needs this *before*
 * signature verification, to look up which clinic's app secret to verify with.
 * Present on message payloads and status receipts alike.
 */
export function extractPhoneNumberId(
  payload: Record<string, unknown>,
): string | undefined {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as
        | Record<string, unknown>
        | undefined;
      const id = (value?.metadata as { phone_number_id?: string } | undefined)
        ?.phone_number_id;
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
      | { title?: string }
      | undefined;
    return reply?.title?.trim()
      ? { kind: "text", text: reply.title.trim() }
      : { kind: "ignore" };
  }

  // Quick-reply button on a template we sent.
  if (type === "button") {
    const text = (msg.button as { text?: string } | undefined)?.text;
    return text?.trim() ? { kind: "text", text: text.trim() } : { kind: "ignore" };
  }

  if (!type || SILENT_TYPES.has(type)) return { kind: "ignore" };

  return { kind: "unsupported", ...(UNSUPPORTED_TYPES[type] ?? UNKNOWN_TYPE) };
}

/**
 * Flattens a webhook body into one envelope per inbound message.
 *
 * A single POST can legitimately batch several messages across several
 * entries. Delivery/read receipts arrive on this same subscription under
 * `statuses` rather than `messages`, and are skipped — there is no `messages`
 * array to iterate on those payloads.
 */
export function parseWebhookPayload(
  payload: Record<string, unknown>,
): InboundEnvelope[] {
  const envelopes: InboundEnvelope[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as
        | Record<string, unknown>
        | undefined;
      const messages = value?.messages;
      if (!Array.isArray(messages)) {
        // Status/read receipts land here (they carry `statuses`, not `messages`).
        const keys = value ? Object.keys(value) : [];
        console.log(
          `[wa-debug] parse: change has no messages[] (keys=${keys.join(",")}) — skipped`,
        );
        continue;
      }

      // The sender id these messages came in on — the routing key to a clinic.
      const phoneNumberId = (value?.metadata as { phone_number_id?: string } | undefined)
        ?.phone_number_id;
      if (!phoneNumberId) {
        console.warn(
          "[wa-debug] parse: change value missing metadata.phone_number_id — whole change skipped",
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
            `[wa-debug] parse: message missing id and/or sender identity (type=${msg.type}) — skipped, not stored`,
          );
          continue;
        }

        const message = classify(msg);
        console.log(
          `[wa-debug] parse: message phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} id=${messageId} type=${msg.type} → kind=${message.kind}`,
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

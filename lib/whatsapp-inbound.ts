/**
 * Classifies the `data.message` object of an Evolution/Baileys
 * `messages.upsert` webhook payload. The agent only understands text, so
 * anything else has to be recognised and answered with a notice rather than
 * fed to the LLM as a placeholder string.
 */

export interface UnsupportedMediaType {
  /** Shown in the admin inbox in place of the content we can't store. */
  placeholder: string;
  /** Reads as the object of "لا يمكننا استقبال …" in the auto-reply. */
  noun: string;
}

export type InboundWhatsAppMessage =
  | { kind: "text"; text: string }
  | ({ kind: "unsupported" } & UnsupportedMediaType)
  /** Bookkeeping traffic (reactions, edits, deletions) — answering it would be
   *  noise, so the webhook drops it without a trace. */
  | { kind: "ignore" };

/** Keys that ride along with a real message and never carry content. */
const METADATA_KEYS = new Set([
  "messageContextInfo",
  "senderKeyDistributionMessage",
]);

/** Real message types we deliberately stay silent about. */
const SILENT_KEYS = new Set([
  "reactionMessage",
  "protocolMessage", // edits, deletions, ephemeral-timer changes
  "pollUpdateMessage",
]);

/** Envelopes whose actual message sits one level down, under `.message`. */
const WRAPPER_KEYS = new Set([
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
]);

const UNSUPPORTED_TYPES: Record<string, UnsupportedMediaType> = {
  imageMessage: { placeholder: "[صورة]", noun: "الصور" },
  videoMessage: { placeholder: "[فيديو]", noun: "مقاطع الفيديو" },
  ptvMessage: { placeholder: "[فيديو]", noun: "مقاطع الفيديو" },
  audioMessage: { placeholder: "[رسالة صوتية]", noun: "الرسائل الصوتية" },
  documentMessage: { placeholder: "[ملف]", noun: "الملفات" },
  stickerMessage: { placeholder: "[ملصق]", noun: "الملصقات" },
  locationMessage: { placeholder: "[موقع]", noun: "مواقع الخريطة" },
  liveLocationMessage: { placeholder: "[موقع]", noun: "مواقع الخريطة" },
  contactMessage: { placeholder: "[جهة اتصال]", noun: "جهات الاتصال" },
  contactsArrayMessage: { placeholder: "[جهات اتصال]", noun: "جهات الاتصال" },
  pollCreationMessage: { placeholder: "[استطلاع]", noun: "الاستطلاعات" },
  pollCreationMessageV3: { placeholder: "[استطلاع]", noun: "الاستطلاعات" },
};

const UNKNOWN_TYPE: UnsupportedMediaType = {
  placeholder: "[رسالة غير مدعومة]",
  noun: "هذا النوع من الرسائل",
};

/** Envelopes can nest (a view-once inside a disappearing message); this caps
 *  how far we follow them. */
const MAX_UNWRAP_DEPTH = 3;

export function parseInboundMessage(
  message: unknown,
  depth = 0,
): InboundWhatsAppMessage {
  if (!message || typeof message !== "object") return { kind: "ignore" };
  const msg = message as Record<string, unknown>;

  const extended = msg.extendedTextMessage as
    | Record<string, unknown>
    | undefined;
  const text =
    typeof msg.conversation === "string"
      ? msg.conversation
      : typeof extended?.text === "string"
        ? extended.text
        : undefined;
  if (text?.trim()) return { kind: "text", text: text.trim() };
  // A text message that carries no text is degenerate, not an unsupported
  // type — don't answer it with the "send text only" notice.
  if ("conversation" in msg || "extendedTextMessage" in msg) {
    return { kind: "ignore" };
  }

  const keys = Object.keys(msg).filter((k) => !METADATA_KEYS.has(k));

  // Unwrap disappearing / view-once envelopes and classify what's inside. Note
  // this deliberately rejects a captioned photo rather than reading its caption
  // as the message.
  if (depth < MAX_UNWRAP_DEPTH) {
    for (const key of keys) {
      if (!WRAPPER_KEYS.has(key)) continue;
      const inner = (msg[key] as Record<string, unknown> | undefined)?.message;
      const parsed = parseInboundMessage(inner, depth + 1);
      if (parsed.kind !== "ignore") return parsed;
    }
  }

  const contentKey = keys.find((k) => !WRAPPER_KEYS.has(k));
  if (!contentKey || SILENT_KEYS.has(contentKey)) return { kind: "ignore" };

  return { kind: "unsupported", ...(UNSUPPORTED_TYPES[contentKey] ?? UNKNOWN_TYPE) };
}

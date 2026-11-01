/**
 * One-line snippet of a quoted message — shown in the inbox's quoted-reply
 * preview and fed to the agent as "this turn replies to …". Plain module so the
 * server (message loader, agent context) and the client (realtime rows,
 * composer) render a quote identically.
 */

/** What the quoted message carried besides text, for its leading label. */
export type QuoteAttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "voice"
  | "location"
  | "contacts"
  | "order";

const LABELS: Record<QuoteAttachmentKind, string> = {
  image: "📷 صورة",
  video: "🎥 فيديو",
  audio: "🎤 رسالة صوتية",
  voice: "🎤 رسالة صوتية",
  document: "📄 ملف",
  sticker: "ملصق",
  location: "📍 موقع",
  contacts: "👤 جهة اتصال",
  order: "🛒 طلب",
};

/** Placeholders like "[صورة]" stand in for missing text — not worth quoting. */
const PLACEHOLDER = /^\[[^\]]*\]$/;

/** Kinds whose stored content is already an emoji summary ("📍 موقع: …"). */
const SELF_LABELLED = new Set<QuoteAttachmentKind>(["location", "contacts", "order"]);

/** The attachment kind of a message, from its stored metadata shape. */
export function quoteKindOf(
  meta:
    | {
        voice?: unknown;
        media?: { kind: QuoteAttachmentKind } | null;
        structured?: { kind: QuoteAttachmentKind } | null;
      }
    | null
    | undefined
): QuoteAttachmentKind | null {
  if (!meta) return null;
  if (meta.voice) return "voice";
  return meta.media?.kind ?? meta.structured?.kind ?? null;
}

export function quoteSnippet(
  content: string,
  kind: QuoteAttachmentKind | null = null,
  maxLength = 160
): string {
  const text = content.replace(/\s+/g, " ").trim();
  const body = PLACEHOLDER.test(text) ? "" : text;
  const label = kind && !(SELF_LABELLED.has(kind) && body) ? LABELS[kind] : "";
  const joined = [label, body].filter(Boolean).join(" ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1)}…` : joined;
}

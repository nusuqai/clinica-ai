import { SenderType } from "@prisma/client";
import { quoteSnippet, type QuoteAttachmentKind } from "@/lib/message-quote";
import type { MessageItem, MessageReplyPreview } from "@/server/services/messages";

/**
 * `sending` → in flight. `sent` → persisted and delivered, kept only until the
 * server row arrives. `failed_sync` → nothing was written to the database.
 * `failed_whatsapp` → the row exists but WhatsApp delivery failed.
 */
export type PendingStatus = "sending" | "sent" | "failed_sync" | "failed_whatsapp";

/** Optimistic media on a pending staff attachment (kept until the server row
 *  arrives). `file` is retained so a failed send can be retried. */
export interface PendingMedia {
  kind: "image" | "video" | "audio" | "document";
  mimeType: string;
  filename?: string;
  /** Local object URL for instant preview before the upload lands. */
  localUrl?: string;
  caption?: string;
  file: File;
  /** Intrinsic dimensions for an image (read client-side before upload). */
  width?: number;
  height?: number;
}

/** Optimistic staff voice note (recorded in the browser as OGG/Opus). */
export interface PendingVoice {
  file: File;
  localUrl: string;
  durationSec: number;
}

/** An admin reply rendered optimistically, before/independently of the server
 *  round-trip. Client-side only — these do not survive a reload. */
export interface PendingMessage {
  clientId: string;
  conversationId: string;
  content: string;
  createdAt: Date;
  status: PendingStatus;
  /** Set once the message row exists; lets it replace the server bubble. */
  serverId?: string;
  /** Set when this is a media attachment, not a text reply. */
  media?: PendingMedia;
  /** Set when this is a voice note. */
  voice?: PendingVoice;
  /** Set when this was sent straight from the quick-replies pool. */
  quickReplyId?: string;
  /** The message this reply quotes — shown on the bubble and resent on retry. */
  replyTo?: MessageReplyPreview;
}

/** The fields a quote preview can be built from — both a server message and a
 *  rendered (possibly optimistic) bubble carry them. */
export interface Quotable {
  id?: string;
  content: string;
  senderType: SenderType;
  senderName?: string | null;
  agentName?: string | null;
  voice?: unknown;
  media?: { kind: QuoteAttachmentKind } | null;
  structured?: { kind: QuoteAttachmentKind } | null;
}

/** Builds the quoted-preview for a message (mirrors getMessages server-side). */
export function toReplyPreview(m: Quotable & { id: string }): MessageReplyPreview {
  return {
    id: m.id,
    senderType: m.senderType,
    authorName:
      m.senderType === SenderType.ADMIN
        ? (m.senderName ?? null)
        : m.senderType === SenderType.AGENT
          ? (m.agentName ?? null)
          : null,
    snippet: quoteSnippet(
      m.content,
      m.voice ? "voice" : (m.media?.kind ?? m.structured?.kind ?? null)
    ),
  };
}

/** Who wrote a quoted message, as the inbox labels it. */
export function quoteAuthor(preview: MessageReplyPreview, contactName: string): string {
  if (preview.senderType === SenderType.USER) return contactName;
  if (preview.senderType === SenderType.AGENT) return preview.authorName ?? "المساعد الذكي";
  return preview.authorName ?? "فريق العيادة";
}

/** Categorises a browser File's mime into the outbound media kind. */
export function clientMediaKind(mime: string): "image" | "video" | "audio" | "document" {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
}

export interface RenderedMessage {
  kind: "message";
  key: string;
  /** Server message id (absent on optimistic bubbles) — used for media playback. */
  id?: string;
  content: string;
  senderType: MessageItem["senderType"];
  /** Who sent a manual reply — shown above the bubble. */
  senderName?: string | null;
  /** The AI employee behind an AGENT reply — shown above the bubble. */
  agentName?: string | null;
  sessionId: string | null;
  createdAt: Date;
  pending?: PendingMessage;
  voice?: MessageItem["voice"];
  /** Local preview URL for a still-uploading voice note. */
  voiceLocalUrl?: string;
  media?: MessageItem["media"];
  /** Local preview URL for a still-uploading attachment (no server id yet). */
  mediaLocalUrl?: string;
  structured?: MessageItem["structured"];
  escalation?: MessageItem["escalation"];
  reaction?: MessageItem["reaction"];
  replyTo?: MessageItem["replyTo"];
  notes?: MessageItem["notes"];
}

/** A staff-only internal note interleaved in the thread. */
export interface RenderedInternalNote {
  kind: "internal";
  key: string;
  id: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  pending?: boolean;
}

export type TimelineItem = RenderedMessage | RenderedInternalNote;

import "server-only";
import { MessageDelivery, SenderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MEDIA_NOTICES } from "@/lib/meta/inbound";
import { markdownToWhatsApp } from "@/lib/meta/whatsapp";
import type { InboundWhatsAppMessage } from "@/lib/meta/whatsapp-inbound";
import { downloadMessageMedia, findChatMessages } from "@/lib/evolution/client";
import { parseEvolutionRecord, type EvolutionRecord } from "@/lib/evolution/inbound";
import { outboundMediaKind, uploadPatientMedia } from "@/lib/supabase/storage";
import { resolveActiveSession } from "@/server/services/agentSession";
import { resolveConversation } from "@/server/services/whatsappIngest";
import type { MediaAttachmentMetadata } from "@/agent/types";

/**
 * Keeps the inbox in step with what happens on an Evolution (WhatsApp Web)
 * clinic's phone, beyond the patient messages the webhook already handles:
 *
 *  - HISTORY IMPORT — past 1:1 chats the phone synced when it linked are copied
 *    into the inbox as plain records (media as placeholders). They never reach
 *    the AI agent, the debounce, or the AI meter: imported patient messages are
 *    stored already-processed.
 *  - PHONE MIRROR — a message staff type on the phone itself shows up in the
 *    inbox as a staff message, and pauses the AI for that conversation (a human
 *    took over), exactly like replying from the inbox does.
 *
 * Both are idempotent on the WhatsApp message id, so re-running an import or a
 * redelivered webhook never duplicates a message.
 */

/** How far back the history import reaches. */
export const HISTORY_IMPORT_DAYS = 90;

/** Inbox text for a message we store without its media bytes. */
function placeholderContent(message: InboundWhatsAppMessage): string | null {
  const withCaption = (placeholder: string, caption?: string) =>
    caption ? `${placeholder} ${caption}` : placeholder;
  switch (message.kind) {
    case "text":
      return message.text;
    case "voice":
      return MEDIA_NOTICES.audio.placeholder;
    case "image":
      return withCaption(MEDIA_NOTICES.image.placeholder, message.caption);
    case "media": {
      const notice =
        message.mediaKind === "video"
          ? MEDIA_NOTICES.video
          : message.mediaKind === "sticker"
            ? MEDIA_NOTICES.sticker
            : MEDIA_NOTICES.file;
      return withCaption(notice.placeholder, message.caption ?? message.filename);
    }
    case "structured":
      return message.summary;
    case "unsupported":
      return message.placeholder;
    // Reactions and bookkeeping aren't messages of their own.
    case "reaction":
    case "ignore":
      return null;
  }
}

// ─── History import ──────────────────────────────────────────────────────────

/**
 * Imports one chat's messages since `since` into the clinic's inbox, tagged with
 * the clinic number (`configId`) they went through. The patient's existing
 * conversation is reused whichever number it started on, so chats from several
 * numbers merge into one thread ordered by each message's real time. Returns how
 * many new messages were written, and whether the whole chat got done —
 * `shouldContinue` is checked before every page, so a stop request takes
 * effect mid-chat. Safe to re-run: already-imported (or live-received)
 * messages are skipped by their WhatsApp id.
 */
export async function importChatHistory(
  clinicId: string,
  configId: string,
  instanceName: string,
  remoteJid: string,
  since: Date,
  shouldContinue: () => Promise<boolean> = async () => true
): Promise<{ written: number; complete: boolean }> {
  let written = 0;
  let complete = true;
  let conversationId: string | null = null;

  for (let page = 1; ; page++) {
    if (!(await shouldContinue())) {
      complete = false;
      break;
    }
    const { records, pages } = await findChatMessages(instanceName, remoteJid, since, page);
    const rows = records
      .map((r) => parseEvolutionRecord(r, instanceName))
      .filter((r): r is EvolutionRecord => r !== null)
      .map((r) => ({ record: r, content: placeholderContent(r.envelope.message) }))
      .filter((r): r is { record: EvolutionRecord; content: string } => !!r.content?.trim());

    if (rows.length > 0) {
      if (!conversationId) {
        // Prefer a patient-sent message: it carries the contact's own name.
        const named = rows.find((r) => !r.record.fromMe) ?? rows[0];
        const { phone, userId, name } = named.record.envelope;
        conversationId = (await resolveConversation(clinicId, { phone, userId, name })).id;
      }
      const convId = conversationId;

      const ids = rows.map((r) => r.record.envelope.messageId);
      const existing = await prisma.message.findMany({
        where: { conversationId: convId, whatsappMessageId: { in: ids } },
        select: { whatsappMessageId: true },
      });
      const seen = new Set(existing.map((m) => m.whatsappMessageId));
      const now = new Date();

      const data: Prisma.MessageCreateManyInput[] = rows
        .filter((r) => !seen.has(r.record.envelope.messageId))
        .map(({ record, content }) => ({
          conversationId: convId,
          clinicId,
          senderType: record.fromMe ? SenderType.ADMIN : SenderType.USER,
          content,
          whatsappMessageId: record.envelope.messageId,
          whatsappConfigId: configId,
          metadata: { imported: true, ...(record.fromMe ? { source: "phone" } : {}) },
          isRead: true,
          createdAt: record.sentAt ?? now,
          // Already "answered" history — the debounce must never pick it up.
          processedAt: record.fromMe ? null : now,
          deliveryStatus: MessageDelivery.SENT,
        }));
      if (data.length > 0) {
        const { count } = await prisma.message.createMany({ data });
        written += count;
      }
    }

    if (page >= pages || records.length === 0) break;
  }

  // Order the thread in the inbox by its real last message, not "imported now".
  if (conversationId && written > 0) {
    const last = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: last.createdAt },
      });
    }
  }
  return { written, complete };
}

// ─── Phone mirror (live) ─────────────────────────────────────────────────────

/** How recent an unconfirmed inbox send must be to count as this echo. */
const ECHO_WINDOW_MS = 2 * 60 * 1000;

/**
 * Our own API sends (agent + inbox replies) can echo back as fromMe events. The
 * row exists already, but its WhatsApp id is written only after the send call
 * returns — so match a recent un-id'd staff/agent row with the same text and
 * claim the id, instead of storing a duplicate.
 */
async function claimOwnEcho(conversationId: string, record: EvolutionRecord): Promise<boolean> {
  const { messageId, message } = record.envelope;
  const already = await prisma.message.findFirst({
    where: { conversationId, whatsappMessageId: messageId },
    select: { id: true },
  });
  if (already) return true;

  const recent = await prisma.message.findMany({
    where: {
      conversationId,
      senderType: { in: [SenderType.ADMIN, SenderType.AGENT] },
      whatsappMessageId: null,
      createdAt: { gte: new Date(Date.now() - ECHO_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, metadata: true },
  });
  const text = message.kind === "text" ? message.text.trim() : null;
  const match = recent.find((m) => {
    // Text echoes: compare with both the stored Markdown and what we sent.
    if (text) return m.content.trim() === text || markdownToWhatsApp(m.content).trim() === text;
    // Media/voice echoes: any recent attachment send from us.
    const meta = m.metadata as { media?: unknown; voice?: unknown } | null;
    return !!(meta?.media || meta?.voice);
  });
  if (!match) return false;
  await prisma.message.update({ where: { id: match.id }, data: { whatsappMessageId: messageId } });
  return true;
}

/** Downloads + stores a phone-sent attachment; null if it can't be fetched. */
async function storePhoneMedia(
  clinicId: string,
  conversationId: string,
  instanceName: string,
  message: InboundWhatsAppMessage
): Promise<MediaAttachmentMetadata | null> {
  if (message.kind !== "voice" && message.kind !== "image" && message.kind !== "media") {
    return null;
  }
  try {
    const dl = await downloadMessageMedia(instanceName, message.mediaId);
    const stored = await uploadPatientMedia({
      clinicId,
      conversationId,
      bytes: dl.bytes,
      contentType: dl.mimeType,
    });
    return {
      kind:
        message.kind === "media" && message.mediaKind === "sticker"
          ? "sticker"
          : outboundMediaKind(stored.contentType),
      storagePath: stored.path,
      mimeType: stored.contentType,
      sizeBytes: dl.bytes.byteLength,
      ...(message.kind === "media" && message.filename ? { filename: message.filename } : {}),
      ...(message.kind !== "voice" && message.caption ? { caption: message.caption } : {}),
    };
  } catch (err) {
    console.error("[evolution] failed to store phone-sent media:", err);
    return null;
  }
}

/**
 * Records a message staff sent from the clinic's phone: stores it as a staff
 * message, then pauses the AI on the conversation and resolves open
 * escalations — a human is handling it now.
 */
export async function recordPhoneMessage(
  clinicId: string,
  configId: string,
  instanceName: string,
  record: EvolutionRecord
): Promise<void> {
  const { envelope } = record;
  const content = placeholderContent(envelope.message);
  if (content === null) return; // reactions / bookkeeping

  const conversation = await resolveConversation(clinicId, {
    phone: envelope.phone,
    userId: envelope.userId,
    name: "", // the clinic's own pushName must not become the contact's name
  });
  if (await claimOwnEcho(conversation.id, record)) return;

  const media = await storePhoneMedia(clinicId, conversation.id, instanceName, envelope.message);
  const sessionId = await resolveActiveSession(conversation.id, clinicId);
  const caption =
    envelope.message.kind === "image" || envelope.message.kind === "media"
      ? (envelope.message.caption ?? "")
      : "";

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      clinicId,
      sessionId,
      senderType: SenderType.ADMIN,
      // With the file attached, the bubble shows it — keep only the caption.
      content: media ? caption : content,
      whatsappMessageId: envelope.messageId,
      whatsappConfigId: configId,
      metadata: {
        source: "phone",
        ...(media ? { media } : {}),
      } as unknown as Prisma.InputJsonValue,
      isRead: true,
      ...(record.sentAt ? { createdAt: record.sentAt } : {}),
    },
  });

  // A human answered from the phone: hand the conversation to staff.
  const now = new Date();
  await prisma.chatSession.updateMany({
    where: { id: sessionId, clinicId, aiEnabled: true },
    data: { aiEnabled: false, aiToggledById: null, aiToggledAt: now },
  });
  await prisma.escalation.updateMany({
    where: { conversationId: conversation.id, resolvedAt: null },
    data: { resolvedAt: now },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: now },
  });
}

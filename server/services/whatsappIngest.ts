import "server-only";
import { mergeConversations } from "@/server/services/conversationMerge";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  handleWhatsAppMessage,
  handleWhatsAppVoiceMessage,
  handleWhatsAppImageMessage,
  handleWhatsAppMediaMessage,
  handleWhatsAppStructuredMessage,
  handleWhatsAppReaction,
  handleUnsupportedWhatsAppMessage,
} from "@/server/services/agentRunner";
import type { InboundEnvelope } from "@/lib/meta/whatsapp-inbound";
import type { WhatsAppTransport } from "@/lib/whatsapp/transport";
import { routeStaffInbound } from "@/server/services/staff/ingest";

/**
 * Routes one inbound WhatsApp message to its handler — shared by the Meta Cloud
 * API webhook and the Evolution webhook, which each parse their own payload
 * format into an `InboundEnvelope`. `creds` is the clinic's transport, used to
 * download media and send any immediate notice back.
 */
export async function processInboundWhatsApp(
  envelope: InboundEnvelope,
  creds: WhatsAppTransport
): Promise<void> {
  const { phone, userId, name, messageId, quotedWamid, message } = envelope;
  console.log(
    `[wa-debug] processMessage phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} messageId=${messageId} kind=${message.kind}`
  );
  // Reactions, system notices and empty bodies carry nothing to answer.
  if (message.kind === "ignore") {
    console.log(
      `[wa-debug] DROP: kind=ignore (reaction/system/empty body) — not stored. messageId=${messageId}`
    );
    return;
  }

  // Team assistant (#89): a link code, or a linked clinic member writing from
  // their own WhatsApp — never the patient pipeline. Their text/voice continue
  // below on their own (inbox-hidden) assistant thread.
  const staffRoute = await routeStaffInbound(envelope, creds);
  if (staffRoute === "handled") return;

  const conversation = staffRoute
    ? { id: staffRoute.staffConversationId }
    : await resolveConversation(creds.clinicId, {
        phone,
        userId,
        name,
      });

  // Voice notes are downloaded, stored, transcribed, then answered like text.
  if (message.kind === "voice") {
    console.log(`[wa-debug] routing → voice handler convId=${conversation.id}`);
    await handleWhatsAppVoiceMessage(
      conversation.id,
      { phone, userId },
      { mediaId: message.mediaId, mimeType: message.mimeType },
      messageId,
      creds,
      quotedWamid
    );
    return;
  }

  // Images are archived, and read by the agent only if the clinic enabled it.
  if (message.kind === "image") {
    console.log(`[wa-debug] routing → image handler convId=${conversation.id}`);
    await handleWhatsAppImageMessage(
      conversation.id,
      { phone, userId },
      { mediaId: message.mediaId, mimeType: message.mimeType, caption: message.caption },
      messageId,
      creds,
      quotedWamid
    );
    return;
  }

  // Video / document / sticker: archived, then escalated to a human.
  if (message.kind === "media") {
    console.log(
      `[wa-debug] routing → media(${message.mediaKind}) handler convId=${conversation.id}`
    );
    await handleWhatsAppMediaMessage(
      conversation.id,
      { phone, userId },
      {
        mediaKind: message.mediaKind,
        mediaId: message.mediaId,
        mimeType: message.mimeType,
        filename: message.filename,
        caption: message.caption,
      },
      messageId,
      creds,
      quotedWamid
    );
    return;
  }

  // Location / contact card / order: stored as text, then escalated.
  if (message.kind === "structured") {
    console.log(
      `[wa-debug] routing → structured(${message.structuredKind}) handler convId=${conversation.id}`
    );
    await handleWhatsAppStructuredMessage(
      conversation.id,
      { phone, userId },
      { structuredKind: message.structuredKind, data: message.data, summary: message.summary },
      messageId,
      creds,
      quotedWamid
    );
    return;
  }

  // Emoji reaction: attached to the message it reacts to (by wamid), not stored
  // as a separate bubble.
  if (message.kind === "reaction") {
    console.log(`[wa-debug] routing → reaction handler convId=${conversation.id}`);
    await handleWhatsAppReaction(conversation.id, message.targetWamid, message.emoji);
    return;
  }

  // An unknown/unsupported type — record what came in and escalate to a human.
  if (message.kind === "unsupported") {
    console.log(`[wa-debug] routing → unsupported-media handler convId=${conversation.id}`);
    await handleUnsupportedWhatsAppMessage(
      creds.clinicId,
      conversation.id,
      { phone, userId },
      message,
      creds
    );
    return;
  }

  // Hands off to the agent: it persists the user message + reply (linked to the
  // active session) and sends the reply back over the Cloud API.
  console.log(`[wa-debug] routing → text handler convId=${conversation.id}`);
  await handleWhatsAppMessage(
    conversation.id,
    { phone, userId },
    message.text,
    messageId,
    creds,
    quotedWamid
  );
}

/**
 * Finds (or creates) the one conversation for this contact within the clinic.
 *
 * A contact is identified by phone (classic) and/or BSUID (`userId`, present
 * once they message with a hidden phone). Either can arrive alone, and the same
 * person may show up as phone-only on one message and BSUID-only on the next, so
 * we look up by BSUID first (the stable, always-present-going-forward key), fall
 * back to the legacy phone key, and backfill whichever identifier was missing.
 */
export async function resolveConversation(
  clinicId: string,
  { phone, userId, name }: { phone: string | null; userId: string | null; name: string }
) {
  let conversation =
    (userId &&
      (await prisma.conversation.findUnique({
        where: { clinicId_whatsappUserId: { clinicId, whatsappUserId: userId } },
      }))) ||
    null;
  const byPhone = phone
    ? await prisma.conversation.findUnique({
        where: { clinicId_whatsappPhone: { clinicId, whatsappPhone: phone } },
      })
    : null;
  if (conversation && byPhone && conversation.id !== byPhone.id) {
    // The same person had two threads — one known by phone, one by hidden id
    // (e.g. different clinic numbers saw them differently). This message carries
    // both, so merge them into one conversation.
    try {
      const keptId = await mergeConversations(conversation.id, byPhone.id);
      conversation = await prisma.conversation.findUnique({ where: { id: keptId } });
    } catch (err) {
      // Never lose the message over a failed merge — it'll be retried the next
      // time this contact writes with both identifiers.
      console.error("[wa] failed to merge duplicate conversations:", err);
    }
  } else if (!conversation) {
    conversation = byPhone;
  }
  console.log(
    `[wa-debug] conversation lookup phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} → ${
      conversation ? `found id=${conversation.id}` : "NOT FOUND (will create)"
    }`
  );

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId,
        channel: Channel.WHATSAPP,
        whatsappPhone: phone,
        whatsappUserId: userId,
        // A thread opened by the clinic's own message has no contact name yet.
        whatsappName: name || phone,
      },
    });
    console.log(`[wa-debug] conversation CREATED id=${conversation.id}`);
    return conversation;
  }

  // Backfill any identifier/name we now know but the stored row is missing, so
  // the phone and BSUID views of the same person stay one thread.
  const patch: { whatsappPhone?: string; whatsappUserId?: string; whatsappName?: string } = {};
  if (phone && !conversation.whatsappPhone) patch.whatsappPhone = phone;
  if (userId && !conversation.whatsappUserId) patch.whatsappUserId = userId;
  if (name && conversation.whatsappName !== name) patch.whatsappName = name;
  if (Object.keys(patch).length > 0) {
    try {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: patch,
      });
    } catch (e) {
      // A unique clash here would mean the identifier belongs to another thread,
      // which the merge above already handles — never fail the message for it.
      console.warn(`[wa-debug] conversation backfill skipped (unique clash):`, e);
    }
  }
  return conversation;
}

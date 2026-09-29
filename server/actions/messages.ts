"use server";

import { revalidatePath } from "next/cache";
import { Channel, Role, SenderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  uploadMedia,
  type WhatsAppRecipient,
} from "@/lib/meta/whatsapp";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import {
  createPatientMediaUploadUrl,
  downloadPatientMedia,
  outboundMediaKind,
} from "@/lib/supabase/storage";
import { resolveActiveSession } from "@/server/services/agentSession";
import type { AgentMessageMetadata, MediaAttachmentMetadata } from "@/agent/types";

/**
 * How to address an outbound message to a conversation's WhatsApp contact:
 * their phone, or their BSUID when the phone is hidden behind a username.
 * Returns null for a non-WhatsApp or unidentifiable conversation.
 */
function whatsappRecipient(conversation: {
  channel: Channel;
  whatsappPhone: string | null;
  whatsappUserId: string | null;
}): WhatsAppRecipient | null {
  if (conversation.channel !== Channel.WHATSAPP) return null;
  if (!conversation.whatsappPhone && !conversation.whatsappUserId) return null;
  return {
    phone: conversation.whatsappPhone,
    userId: conversation.whatsappUserId,
  };
}

export type SendAdminReplyFailure =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  // WhatsApp 24-hour window closed — free-form text is refused, use a template.
  | "outside_window"
  | "server_error";

/** The contact's last inbound message time — anchors the WhatsApp window. */
async function lastInboundAt(conversationId: string): Promise<Date | null> {
  const m = await prisma.message.findFirst({
    where: { conversationId, senderType: SenderType.USER },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return m?.createdAt ?? null;
}

/**
 * The inbox renders each reply optimistically and needs to tell "never saved"
 * apart from "saved but undelivered", so this action reports every expected
 * failure as a value instead of throwing.
 */
export type SendAdminReplyResult =
  | {
      ok: true;
      messageId: string;
      createdAt: string;
      whatsappSendFailed: boolean;
    }
  | { ok: false; reason: SendAdminReplyFailure };

export async function sendAdminReply(
  conversationId: string,
  content: string
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
  });
  if (!conversation) return { ok: false, reason: "not_found" };

  // Defend Meta's rule server-side: free-form text can't reach a WhatsApp
  // contact who's been silent for 24h. The inbox disables the box in this case,
  // but a stale client or a direct call must be rejected before we persist a
  // reply that could never be delivered.
  if (conversation.channel === Channel.WHATSAPP) {
    const within = isWithinWhatsappWindow(await lastInboundAt(conversationId));
    if (!within) return { ok: false, reason: "outside_window" };
  }

  let message;
  try {
    const sessionId = await resolveActiveSession(conversationId, ctx.clinic.id);

    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content,
        isRead: true,
        clinicId: ctx.clinic.id,
      },
    });

    // A human reply counts as handling the escalation, whether or not the AI
    // gets turned back on afterwards.
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  } catch (err) {
    // Nothing was persisted (or the reply is in an unknown state) — the inbox
    // keeps the bubble and offers a retry.
    console.error("Failed to save admin reply:", err);
    return { ok: false, reason: "server_error" };
  }

  let whatsappSendFailed = false;
  const recipient = whatsappRecipient(conversation);
  if (recipient) {
    try {
      const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
      if (!creds) throw new Error("WhatsApp is not configured for this clinic");
      await sendTextMessage(recipient, content, creds);
    } catch (err) {
      // The reply is already saved in the conversation; a failed WhatsApp
      // delivery (missing config, closed window, API error) shouldn't crash the
      // admin UI — the inbox shows a retry.
      console.error("Failed to send WhatsApp message:", err);
      whatsappSendFailed = true;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  revalidatePath("/admin/messages", "page");
  return {
    ok: true,
    messageId: message.id,
    createdAt: message.createdAt.toISOString(),
    whatsappSendFailed,
  };
}

/**
 * Mints a one-time signed URL so the staff browser can upload an attachment
 * DIRECTLY to the private bucket (bypassing the server request-body limit, so
 * files up to 100 MB work). The browser then calls `sendAdminMediaReply` with the
 * returned path. Rejected before the upload if the WhatsApp window has closed.
 */
export type CreateUploadResult =
  | { ok: true; path: string; token: string; bucket: string }
  | { ok: false; reason: SendAdminReplyFailure };

export async function createStaffMediaUpload(
  conversationId: string,
  mimeType: string
): Promise<CreateUploadResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
    select: { id: true, channel: true },
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (conversation.channel === Channel.WHATSAPP) {
    if (!isWithinWhatsappWindow(await lastInboundAt(conversationId))) {
      return { ok: false, reason: "outside_window" };
    }
  }

  try {
    const target = await createPatientMediaUploadUrl({
      clinicId: ctx.clinic.id,
      conversationId,
      mimeType: mimeType || "application/octet-stream",
    });
    return { ok: true, path: target.path, token: target.token, bucket: target.bucket };
  } catch (err) {
    console.error("Failed to create staff media upload url:", err);
    return { ok: false, reason: "server_error" };
  }
}

/**
 * Persists a staff attachment (already uploaded to the bucket by the browser) as
 * an ADMIN message and relays it to the patient over WhatsApp. Free for the
 * clinic (staff replies never touch the AI meter). Mirrors `sendAdminReply`'s
 * optimistic-friendly result shape.
 */
export async function sendAdminMediaReply(
  conversationId: string,
  media: { path: string; mimeType: string; filename?: string; caption?: string }
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
  });
  if (!conversation) return { ok: false, reason: "not_found" };

  // Never trust a client-supplied path: it must live under this clinic +
  // conversation's prefix (the same prefix the signed URL was minted for).
  if (!media.path.startsWith(`${ctx.clinic.id}/${conversationId}/`)) {
    return { ok: false, reason: "forbidden" };
  }
  if (conversation.channel === Channel.WHATSAPP) {
    if (!isWithinWhatsappWindow(await lastInboundAt(conversationId))) {
      return { ok: false, reason: "outside_window" };
    }
  }

  // Read the bytes back for the WhatsApp relay + the stored size. A missing
  // object means the browser upload never landed.
  const bytes = await downloadPatientMedia(media.path);
  if (!bytes) return { ok: false, reason: "server_error" };

  const kind = outboundMediaKind(media.mimeType);
  const baseMime = media.mimeType.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  const caption = media.caption?.trim() ?? "";

  let message;
  try {
    const sessionId = await resolveActiveSession(conversationId, ctx.clinic.id);
    const mediaMeta: MediaAttachmentMetadata = {
      kind,
      storagePath: media.path,
      mimeType: baseMime,
      sizeBytes: bytes.byteLength,
      ...(media.filename ? { filename: media.filename } : {}),
      ...(caption ? { caption } : {}),
    };
    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content: caption,
        isRead: true,
        clinicId: ctx.clinic.id,
        metadata: { media: mediaMeta } as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  } catch (err) {
    console.error("Failed to save admin media reply:", err);
    return { ok: false, reason: "server_error" };
  }

  let whatsappSendFailed = false;
  const recipient = whatsappRecipient(conversation);
  if (recipient) {
    try {
      const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
      if (!creds) throw new Error("WhatsApp is not configured for this clinic");
      const waMediaId = await uploadMedia(creds, bytes, baseMime, media.filename ?? "attachment");
      await sendMediaMessage(
        recipient,
        { kind, mediaId: waMediaId, caption: caption || undefined, filename: media.filename },
        creds
      );
    } catch (err) {
      console.error("Failed to send WhatsApp media:", err);
      whatsappSendFailed = true;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  revalidatePath("/admin/messages", "page");
  return {
    ok: true,
    messageId: message.id,
    createdAt: message.createdAt.toISOString(),
    whatsappSendFailed,
  };
}

/**
 * Re-sends an already-persisted reply over WhatsApp. Used by the inbox retry
 * action after a delivery failure — it must not create a second message row.
 * Handles both text and media replies.
 */
export async function retryWhatsappDelivery(messageId: string): Promise<{ ok: boolean }> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  // Only retry messages in the admin's own clinic.
  if (!message || message.conversation.clinicId !== ctx.clinic.id) {
    return { ok: false };
  }

  const { conversation } = message;
  const recipient = whatsappRecipient(conversation);
  // Nothing to deliver on the web channel — treat it as already delivered.
  if (!recipient) {
    return { ok: true };
  }

  try {
    const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
    if (!creds) return { ok: false };

    const mediaMeta = (message.metadata as AgentMessageMetadata | null)?.media;
    if (mediaMeta?.storagePath) {
      const bytes = await downloadPatientMedia(mediaMeta.storagePath);
      if (!bytes) return { ok: false };
      const kind = outboundMediaKind(mediaMeta.mimeType);
      const waMediaId = await uploadMedia(
        creds,
        bytes,
        mediaMeta.mimeType,
        mediaMeta.filename ?? "attachment"
      );
      await sendMediaMessage(
        recipient,
        { kind, mediaId: waMediaId, caption: mediaMeta.caption, filename: mediaMeta.filename },
        creds
      );
      return { ok: true };
    }

    await sendTextMessage(recipient, message.content, creds);
    return { ok: true };
  } catch (err) {
    console.error("Failed to retry WhatsApp delivery:", err);
    return { ok: false };
  }
}

export type SendTemplateResult =
  | { ok: true; messageId: string; createdAt: string }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "not_whatsapp"
        | "not_configured"
        | "send_failed"
        | "server_error";
    };

/**
 * Sends an approved template to a conversation's WhatsApp contact — the way to
 * reach someone after the 24-hour window has closed. `renderedText` is the body
 * with its variables already substituted; it is what we persist so the sent
 * template reads naturally in the thread.
 */
export async function sendWhatsappTemplate(
  conversationId: string,
  input: {
    name: string;
    language: string;
    variables: string[];
    renderedText: string;
  }
): Promise<SendTemplateResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  const recipient = whatsappRecipient(conversation);
  if (!recipient) {
    return { ok: false, reason: "not_whatsapp" };
  }

  const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    await sendTemplateMessage(
      recipient,
      {
        name: input.name,
        languageCode: input.language,
        variables: input.variables,
      },
      creds
    );
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    return { ok: false, reason: "send_failed" };
  }

  try {
    const sessionId = await resolveActiveSession(conversationId, ctx.clinic.id);
    const message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content: input.renderedText,
        isRead: true,
        clinicId: ctx.clinic.id,
      },
    });
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    revalidatePath("/admin/messages", "page");
    return {
      ok: true,
      messageId: message.id,
      createdAt: message.createdAt.toISOString(),
    };
  } catch (err) {
    // The template already went out; failing to persist it is a display gap,
    // not a delivery failure.
    console.error("Template sent but failed to persist:", err);
    return { ok: false, reason: "server_error" };
  }
}

/**
 * Resolves a single message-level escalation (the "mark as resolved" button
 * beside an escalated media message). Clinic-scoped to the admin. Does NOT touch
 * the AI switch — it only clears the flag so the bubble's badge disappears.
 */
export async function resolveMessageEscalation(escalationId: string): Promise<{ ok: boolean }> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) return { ok: false };

  const result = await prisma.escalation.updateMany({
    where: { id: escalationId, clinicId: ctx.clinic.id, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  if (result.count === 0) return { ok: false };

  revalidatePath("/admin/messages", "page");
  return { ok: true };
}

export async function setSessionAiEnabled(sessionId: string, enabled: boolean): Promise<void> {
  const ctx = await getClinicContext();
  if (!ctx) throw new Error("Unauthorized");
  if (ctx.role !== Role.ADMIN) throw new Error("Forbidden");

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { aiEnabled: enabled },
  });

  // Handing control back to the AI counts as resolving any open escalation
  // on this session.
  if (enabled) {
    await prisma.escalation.updateMany({
      where: { sessionId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  revalidatePath("/admin/messages", "page");
}

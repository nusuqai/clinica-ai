"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Channel, SenderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, getClinicContext } from "@/lib/auth";
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
  uploadPatientMedia,
} from "@/lib/supabase/storage";
import { resolveActiveSession } from "@/server/services/agentSession";
import { resolveMyEscalationAlerts } from "@/server/services/inbox";
import { transcribeAudio } from "@/server/services/transcription";
import { chargeTranscription, isDuplicateChargeError } from "@/server/services/aiCredit";
import type {
  AgentMessageMetadata,
  MediaAttachmentMetadata,
  VoiceMessageMetadata,
} from "@/agent/types";

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

/**
 * The message a staff reply quotes, accepted only if it lives in this same
 * conversation — a client-supplied id is never trusted beyond that. An unknown
 * id degrades to a plain (unquoted) reply rather than failing the send.
 */
async function quotedMessage(
  conversationId: string,
  replyToId: string | null | undefined
): Promise<{ id: string; whatsappMessageId: string | null } | null> {
  if (!replyToId) return null;
  return prisma.message.findFirst({
    where: { id: replyToId, conversationId },
    select: { id: true, whatsappMessageId: true },
  });
}

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
  content: string,
  /** The message this reply quotes (picked in the inbox), if any. */
  replyToId?: string | null
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

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
  let quoted: Awaited<ReturnType<typeof quotedMessage>> = null;
  try {
    const sessionId = await resolveActiveSession(conversationId, ctx.clinic.id);
    quoted = await quotedMessage(conversationId, replyToId);

    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content,
        isRead: true,
        clinicId: ctx.clinic.id,
        replyToId: quoted?.id ?? null,
      },
    });

    // A human reply counts as handling the escalation, whether or not the AI
    // gets turned back on afterwards.
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
    });
    // ...and answers any escalation a colleague raised to this staff member.
    await resolveMyEscalationAlerts(conversationId, ctx.user.id);
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
      const wamid = await sendTextMessage(recipient, content, creds, {
        replyToWamid: quoted?.whatsappMessageId,
      });
      // Record the wamid so a patient's reaction can attach to this reply.
      if (wamid) {
        await prisma.message
          .update({ where: { id: message.id }, data: { whatsappMessageId: wamid } })
          .catch(() => {});
      }
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
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

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
  media: {
    path: string;
    mimeType: string;
    filename?: string;
    caption?: string;
    width?: number;
    height?: number;
    /** The message this attachment quotes (picked in the inbox), if any. */
    replyToId?: string | null;
  }
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

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
  let quoted: Awaited<ReturnType<typeof quotedMessage>> = null;
  try {
    const sessionId = await resolveActiveSession(conversationId, ctx.clinic.id);
    quoted = await quotedMessage(conversationId, media.replyToId);
    const mediaMeta: MediaAttachmentMetadata = {
      kind,
      storagePath: media.path,
      mimeType: baseMime,
      sizeBytes: bytes.byteLength,
      ...(media.filename ? { filename: media.filename } : {}),
      ...(caption ? { caption } : {}),
      ...(media.width && media.height ? { width: media.width, height: media.height } : {}),
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
        replyToId: quoted?.id ?? null,
      },
    });
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
    });
    // ...and answers any escalation a colleague raised to this staff member.
    await resolveMyEscalationAlerts(conversationId, ctx.user.id);
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
      const wamid = await sendMediaMessage(
        recipient,
        { kind, mediaId: waMediaId, caption: caption || undefined, filename: media.filename },
        creds,
        { replyToWamid: quoted?.whatsappMessageId }
      );
      if (wamid) {
        await prisma.message
          .update({ where: { id: message.id }, data: { whatsappMessageId: wamid } })
          .catch(() => {});
      }
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
  if (!can(ctx, "messages")) return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true, replyTo: { select: { whatsappMessageId: true } } },
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
    // Re-deliver with the same quote the original send carried.
    const options = { replyToWamid: message.replyTo?.whatsappMessageId };

    const voiceMeta = (message.metadata as AgentMessageMetadata | null)?.voice;
    if (message.senderType === SenderType.ADMIN && voiceMeta?.storagePath) {
      const bytes = await downloadPatientMedia(voiceMeta.storagePath);
      if (!bytes) return { ok: false };
      const waMediaId = await uploadMedia(creds, bytes, voiceMeta.mimeType, "voice.ogg");
      await sendMediaMessage(
        recipient,
        { kind: "audio", mediaId: waMediaId, voice: isOggOpus(voiceMeta.mimeType) },
        creds,
        options
      );
      return { ok: true };
    }

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
        creds,
        options
      );
      return { ok: true };
    }

    await sendTextMessage(recipient, message.content, creds, options);
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
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

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

  let templateWamid: string | null = null;
  try {
    templateWamid = await sendTemplateMessage(
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
        whatsappMessageId: templateWamid,
      },
    });
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
    });
    // ...and answers any escalation a colleague raised to this staff member.
    await resolveMyEscalationAlerts(conversationId, ctx.user.id);
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
  if (!can(ctx, "messages")) return { ok: false };

  const result = await prisma.escalation.updateMany({
    where: { id: escalationId, clinicId: ctx.clinic.id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
  });
  if (result.count === 0) return { ok: false };

  revalidatePath("/admin/messages", "page");
  return { ok: true };
}

export async function setSessionAiEnabled(sessionId: string, enabled: boolean): Promise<void> {
  const ctx = await getClinicContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!can(ctx, "messages")) throw new Error("Forbidden");

  // Scoped to the caller's clinic, and stamped with who flipped it.
  const updated = await prisma.chatSession.updateMany({
    where: { id: sessionId, clinicId: ctx.clinic.id },
    data: { aiEnabled: enabled, aiToggledById: ctx.user.id, aiToggledAt: new Date() },
  });
  if (updated.count === 0) throw new Error("Not found");

  // Handing control back to the AI counts as resolving any open escalation
  // on this session.
  if (enabled) {
    await prisma.escalation.updateMany({
      where: { sessionId, clinicId: ctx.clinic.id, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
    });
  }

  revalidatePath("/admin/messages", "page");
}

/** WhatsApp only renders OGG/Opus as a voice note (with the waveform). */
function isOggOpus(mime: string): boolean {
  const base = mime.split(";")[0].trim().toLowerCase();
  return base === "audio/ogg" || base === "audio/opus";
}

/** Staff placeholder content until the transcript lands — keeps the agent's
 *  history (and the inbox preview) meaningful in the meantime. */
const STAFF_VOICE_PLACEHOLDER = "[رسالة صوتية من الفريق]";

/**
 * Sends a staff voice note (recorded in the browser as OGG/Opus and uploaded
 * straight to the bucket via `createStaffMediaUpload`) to the patient as a real
 * WhatsApp voice message. The transcript is produced AFTER the response (it never
 * delays delivery) and written back onto the message, so the inbox shows it and
 * the AI knows what was said if it takes the conversation back. Transcription is
 * metered as its own ledger line (TRANSCRIPTION), like a patient voice note.
 */
export async function sendAdminVoiceReply(
  conversationId: string,
  voice: { path: string; mimeType: string; durationSec?: number | null; replyToId?: string | null }
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (!voice.path.startsWith(`${ctx.clinic.id}/${conversationId}/`)) {
    return { ok: false, reason: "forbidden" };
  }
  if (!voice.mimeType.toLowerCase().startsWith("audio/")) return { ok: false, reason: "forbidden" };
  if (conversation.channel === Channel.WHATSAPP) {
    if (!isWithinWhatsappWindow(await lastInboundAt(conversationId))) {
      return { ok: false, reason: "outside_window" };
    }
  }

  const bytes = await downloadPatientMedia(voice.path);
  if (!bytes) return { ok: false, reason: "server_error" };
  const baseMime = voice.mimeType.split(";")[0].trim().toLowerCase();
  const clinicId = ctx.clinic.id;
  const durationSec =
    typeof voice.durationSec === "number" && voice.durationSec > 0
      ? Math.round(voice.durationSec)
      : null;

  let message;
  let quoted: Awaited<ReturnType<typeof quotedMessage>> = null;
  let sessionId: string | null = null;
  try {
    sessionId = await resolveActiveSession(conversationId, clinicId);
    quoted = await quotedMessage(conversationId, voice.replyToId);
    const voiceMeta: VoiceMessageMetadata = {
      storagePath: voice.path,
      mimeType: baseMime,
      durationSec,
      transcript: "",
      model: "",
      status: "transcribing",
    };
    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content: STAFF_VOICE_PLACEHOLDER,
        isRead: true,
        clinicId,
        metadata: { voice: voiceMeta } as unknown as Prisma.InputJsonValue,
        replyToId: quoted?.id ?? null,
      },
    });
    await prisma.escalation.updateMany({
      where: { conversationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
    });
    await resolveMyEscalationAlerts(conversationId, ctx.user.id);
  } catch (err) {
    console.error("Failed to save staff voice reply:", err);
    return { ok: false, reason: "server_error" };
  }

  let whatsappSendFailed = false;
  const recipient = whatsappRecipient(conversation);
  if (recipient) {
    try {
      const creds = await getClinicWhatsappCredentials(clinicId);
      if (!creds) throw new Error("WhatsApp is not configured for this clinic");
      const waMediaId = await uploadMedia(creds, bytes, baseMime, "voice.ogg");
      const wamid = await sendMediaMessage(
        recipient,
        { kind: "audio", mediaId: waMediaId, voice: isOggOpus(baseMime) },
        creds,
        { replyToWamid: quoted?.whatsappMessageId }
      );
      if (wamid) {
        await prisma.message
          .update({ where: { id: message.id }, data: { whatsappMessageId: wamid } })
          .catch(() => {});
      }
    } catch (err) {
      console.error("Failed to send WhatsApp voice:", err);
      whatsappSendFailed = true;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Transcribe off the response path. The UPDATE reaches the inbox over
  // realtime, swapping the placeholder for the transcript.
  const messageId = message.id;
  after(async () => {
    let next: VoiceMessageMetadata;
    let transcript = "";
    try {
      const result = await transcribeAudio({ bytes, mimeType: baseMime });
      transcript = result.text;
      next = {
        storagePath: voice.path,
        mimeType: baseMime,
        durationSec: durationSec ?? result.durationSec,
        transcript,
        model: result.model,
        status: transcript ? "transcribed" : "failed",
      };
      await chargeTranscription({
        clinicId,
        sessionId,
        messageId,
        model: result.model,
        audioSeconds: next.durationSec,
      }).catch((err) => {
        if (!isDuplicateChargeError(err)) {
          console.error("[aiCredit] failed to charge staff transcription", err);
        }
      });
    } catch (err) {
      console.error("[staff-voice] transcription failed:", err);
      next = {
        storagePath: voice.path,
        mimeType: baseMime,
        durationSec,
        transcript: "",
        model: "",
        status: "failed",
      };
    }
    // Merge, so a reaction that landed meanwhile isn't overwritten.
    const current = await prisma.message.findUnique({
      where: { id: messageId },
      select: { metadata: true },
    });
    const meta = (current?.metadata as AgentMessageMetadata | null) ?? {};
    await prisma.message
      .update({
        where: { id: messageId },
        data: {
          content: transcript || STAFF_VOICE_PLACEHOLDER,
          metadata: { ...meta, voice: next } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch((err) => console.error("[staff-voice] failed to store transcript:", err));
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
 * Sends a saved quick reply straight into the conversation: its text as a
 * normal staff reply, and its image (if any) copied into the conversation's
 * folder and sent as an attachment with the text as caption. Bumps the reply's
 * usage count so the pool stays sorted by what the team actually uses.
 */
export async function sendQuickReply(
  conversationId: string,
  quickReplyId: string,
  replyToId?: string | null
): Promise<SendAdminReplyResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (!can(ctx, "messages")) return { ok: false, reason: "forbidden" };

  const qr = await prisma.quickReply.findFirst({
    where: { id: quickReplyId, clinicId: ctx.clinic.id },
  });
  if (!qr) return { ok: false, reason: "not_found" };

  let result: SendAdminReplyResult;
  if (qr.mediaPath && qr.mediaMimeType) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, clinicId: ctx.clinic.id },
      select: { id: true, channel: true },
    });
    if (!conversation) return { ok: false, reason: "not_found" };
    if (
      conversation.channel === Channel.WHATSAPP &&
      !isWithinWhatsappWindow(await lastInboundAt(conversationId))
    ) {
      return { ok: false, reason: "outside_window" };
    }
    const bytes = await downloadPatientMedia(qr.mediaPath);
    if (!bytes) return { ok: false, reason: "server_error" };
    // A per-message copy: deleting / replacing the quick reply later must not
    // break images already sent in conversations.
    const stored = await uploadPatientMedia({
      clinicId: ctx.clinic.id,
      conversationId,
      bytes,
      contentType: qr.mediaMimeType,
    }).catch((err) => {
      console.error("Failed to copy quick-reply media:", err);
      return null;
    });
    if (!stored) return { ok: false, reason: "server_error" };
    result = await sendAdminMediaReply(conversationId, {
      path: stored.path,
      mimeType: stored.contentType,
      caption: qr.content,
      width: qr.mediaWidth ?? undefined,
      height: qr.mediaHeight ?? undefined,
      replyToId,
    });
  } else {
    result = await sendAdminReply(conversationId, qr.content, replyToId);
  }

  if (result.ok) {
    await prisma.quickReply
      .update({ where: { id: qr.id }, data: { usageCount: { increment: 1 } } })
      .catch(() => {});
  }
  return result;
}

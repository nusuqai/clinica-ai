"use server";

import { revalidatePath } from "next/cache";
import { Channel, Role, SenderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveClinicContext } from "@/lib/auth";
import { sendTextMessage, sendTemplateMessage } from "@/lib/meta/whatsapp";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import { resolveActiveSession } from "@/server/services/agentSession";

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
  content: string,
): Promise<SendAdminReplyResult> {
  const ctx = await getActiveClinicContext();
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
    const sessionId = await resolveActiveSession(conversationId);

    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content,
        isRead: true,
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
  if (conversation.channel === Channel.WHATSAPP && conversation.whatsappPhone) {
    try {
      const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
      if (!creds) throw new Error("WhatsApp is not configured for this clinic");
      await sendTextMessage(conversation.whatsappPhone, content, creds);
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

  revalidatePath("/clinic/[slug]/admin/messages", "page");
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
 */
export async function retryWhatsappDelivery(
  messageId: string,
): Promise<{ ok: boolean }> {
  const ctx = await getActiveClinicContext();
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
  // Nothing to deliver on the web channel — treat it as already delivered.
  if (conversation.channel !== Channel.WHATSAPP || !conversation.whatsappPhone) {
    return { ok: true };
  }

  try {
    const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
    if (!creds) return { ok: false };
    await sendTextMessage(conversation.whatsappPhone, message.content, creds);
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
  },
): Promise<SendTemplateResult> {
  const ctx = await getActiveClinicContext();
  if (!ctx) return { ok: false, reason: "unauthorized" };
  if (ctx.role !== Role.ADMIN) return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (conversation.channel !== Channel.WHATSAPP || !conversation.whatsappPhone) {
    return { ok: false, reason: "not_whatsapp" };
  }

  const creds = await getClinicWhatsappCredentials(ctx.clinic.id);
  if (!creds) return { ok: false, reason: "not_configured" };

  try {
    await sendTemplateMessage(
      conversation.whatsappPhone,
      {
        name: input.name,
        languageCode: input.language,
        variables: input.variables,
      },
      creds,
    );
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    return { ok: false, reason: "send_failed" };
  }

  try {
    const sessionId = await resolveActiveSession(conversationId);
    const message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: ctx.user.id,
        content: input.renderedText,
        isRead: true,
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

    revalidatePath("/clinic/[slug]/admin/messages", "page");
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

export async function setSessionAiEnabled(
  sessionId: string,
  enabled: boolean,
): Promise<void> {
  const ctx = await getActiveClinicContext();
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

  revalidatePath("/clinic/[slug]/admin/messages", "page");
}

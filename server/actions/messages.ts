"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/evolution";
import { resolveActiveSession } from "@/server/services/agentSession";

export type SendAdminReplyFailure =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server_error";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "ADMIN") return { ok: false, reason: "forbidden" };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return { ok: false, reason: "not_found" };

  let message;
  try {
    const sessionId = await resolveActiveSession(conversationId);

    message = await prisma.message.create({
      data: {
        conversationId,
        sessionId,
        senderType: "ADMIN",
        senderId: user.id,
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
  if (conversation.channel === "WHATSAPP" && conversation.whatsappPhone) {
    try {
      await sendTextMessage(conversation.whatsappPhone, content);
    } catch (err) {
      // The reply is already saved in the conversation; a failed WhatsApp
      // delivery (e.g. instance disconnected) shouldn't crash the admin UI.
      console.error("Failed to send WhatsApp message:", err);
      whatsappSendFailed = true;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  revalidatePath("/admin/messages");
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "ADMIN") return { ok: false };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });
  if (!message) return { ok: false };

  const { conversation } = message;
  // Nothing to deliver on the web channel — treat it as already delivered.
  if (conversation.channel !== "WHATSAPP" || !conversation.whatsappPhone) {
    return { ok: true };
  }

  try {
    await sendTextMessage(conversation.whatsappPhone, message.content);
    return { ok: true };
  } catch (err) {
    console.error("Failed to retry WhatsApp delivery:", err);
    return { ok: false };
  }
}

export async function setSessionAiEnabled(
  sessionId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "ADMIN") throw new Error("Forbidden");

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

  revalidatePath("/admin/messages");
}

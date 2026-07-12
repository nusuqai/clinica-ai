"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/evolution";
import { resolveActiveSession } from "@/server/services/agentSession";

export interface SendAdminReplyResult {
  whatsappSendFailed: boolean;
}

export async function sendAdminReply(
  conversationId: string,
  content: string,
): Promise<SendAdminReplyResult> {
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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error("Conversation not found");

  const sessionId = await resolveActiveSession(conversationId);

  await prisma.message.create({
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
  return { whatsappSendFailed };
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

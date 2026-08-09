import { NextRequest, NextResponse } from "next/server";
import { Channel, SenderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CLINIC_ID } from "@/lib/tenant";
import {
  handleWhatsAppMessage,
  handleUnsupportedWhatsAppMessage,
} from "@/server/services/agentRunner";
import { parseInboundMessage } from "@/lib/whatsapp-inbound";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  console.log("Received WhatsApp webhook request");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[webhook] raw body:", JSON.stringify(body, null, 2));

  const apiKey = body.apikey as string | undefined;
  if (apiKey && apiKey !== process.env.EVOLUTION_INSTANCE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = (body.event as string | undefined)?.toLowerCase().replace(".", "_");
  console.log("[webhook] event:", body.event, "| normalized:", event);

  // Only handle new incoming messages (handles both "messages.upsert" and "MESSAGES_UPSERT")
  if (event !== "messages_upsert") {
    return NextResponse.json({ ok: true });
  }

  const data = body.data as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;

  // Skip our own outgoing messages
  if (key?.fromMe) {
    return NextResponse.json({ ok: true });
  }

  const remoteJid = key?.remoteJid as string | undefined;
  // Only process individual chats (ignore groups which end with @g.us)
  if (!remoteJid || !remoteJid.endsWith("@s.whatsapp.net")) {
    return NextResponse.json({ ok: true });
  }

  const phone = remoteJid.replace("@s.whatsapp.net", "");
  const pushName = (data?.pushName as string | undefined) || phone;

  const inbound = parseInboundMessage(data?.message);
  console.log("[webhook] message kind:", inbound.kind);

  // Reactions, edits and deletions carry nothing to answer.
  if (inbound.kind === "ignore") {
    return NextResponse.json({ ok: true });
  }

  // Find or create a conversation keyed by phone number, in the default clinic
  // (multi-clinic WhatsApp routing lands with #4/#7).
  let conversation = await prisma.conversation.findUnique({
    where: {
      clinicId_whatsappPhone: {
        clinicId: DEFAULT_CLINIC_ID,
        whatsappPhone: phone,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId: DEFAULT_CLINIC_ID,
        channel: Channel.WHATSAPP,
        whatsappPhone: phone,
        whatsappName: pushName,
      },
    });
  } else if (conversation.whatsappName !== pushName) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { whatsappName: pushName },
    });
  }

  // The agent only reads text, so media never reaches it — record what came in
  // and tell the contact to send text instead.
  if (inbound.kind === "unsupported") {
    try {
      await handleUnsupportedWhatsAppMessage(conversation.id, phone, inbound);
    } catch (e) {
      console.error("[webhook] unsupported-message error:", e);
    }
    return NextResponse.json({ ok: true });
  }

  const content = inbound.text;

  // Hand off to the AI agent: it persists the user message + agent reply
  // (linked to the active session) and sends the reply back via WhatsApp.
  try {
    await handleWhatsAppMessage(conversation.id, phone, content);
  } catch (e) {
    console.error("[webhook] agent error:", e);
    // Still store the inbound message so the admin can follow up manually.
    await prisma.message.create({
      data: { conversationId: conversation.id, senderType: SenderType.USER, content },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

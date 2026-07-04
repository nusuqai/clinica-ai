import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage } from "@/server/services/agentRunner";

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

  const msg = data?.message as Record<string, unknown> | undefined;
  const content =
    (msg?.conversation as string | undefined) ||
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as
      | string
      | undefined) ||
    "[رسالة غير مدعومة]";

  // Find or create a conversation keyed by phone number
  let conversation = await prisma.conversation.findUnique({
    where: { whatsappPhone: phone },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channel: "WHATSAPP",
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

  // Hand off to the AI agent: it persists the user message + agent reply
  // (linked to the active session) and sends the reply back via WhatsApp.
  try {
    await handleWhatsAppMessage(conversation.id, phone, content);
  } catch (e) {
    console.error("[webhook] agent error:", e);
    // Still store the inbound message so the admin can follow up manually.
    await prisma.message.create({
      data: { conversationId: conversation.id, senderType: "USER", content },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

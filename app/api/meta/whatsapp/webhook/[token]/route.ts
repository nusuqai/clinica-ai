import { NextRequest, NextResponse } from "next/server";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  handleWhatsAppMessage,
  handleUnsupportedWhatsAppMessage,
} from "@/server/services/agentRunner";
import { handleVerification } from "@/lib/meta/webhook";
import {
  parseWebhookPayload,
  extractPhoneNumberId,
  type InboundEnvelope,
} from "@/lib/meta/whatsapp-inbound";
import {
  getWebhookConfigByToken,
  type ClinicWhatsappCredentials,
} from "@/lib/meta/whatsapp-config";

export const runtime = "nodejs";

/**
 * Per-clinic WhatsApp Cloud API webhook (Meta official).
 *
 * Every clinic runs its own Meta app and gets its OWN callback URL, ending in
 * an unguessable `token`. That token both identifies the clinic and — since we
 * don't collect app secrets to verify `X-Hub-Signature-256` — gates the
 * endpoint. The token is a secret: it is never logged.
 *
 * Each clinic pastes its unique URL + its verify token into their App
 * Dashboard → WhatsApp → Configuration and subscribes to the `messages` field.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const config = await getWebhookConfigByToken(token);
  // Pass the clinic's verify token (or undefined → 403 on a real handshake).
  return handleVerification(request, config?.verifyToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const creds = await getWebhookConfigByToken(token);
  if (!creds) {
    // Unknown/rotated token — reject without confirming anything about it.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // Meta retries non-2xx; an unparseable body won't parse on retry either.
    console.error("[meta-whatsapp] body was not valid JSON");
    return NextResponse.json({ ok: true });
  }

  // Defense in depth: the event's target number must match the clinic this URL
  // belongs to. A mismatch means a wrong URL was pasted (or a spoof) — ignore.
  const phoneNumberId = extractPhoneNumberId(payload);
  if (phoneNumberId && phoneNumberId !== creds.phoneNumberId) {
    console.warn(
      "[meta-whatsapp] phone_number_id does not match this clinic's config — ignoring",
    );
    return NextResponse.json({ ok: true });
  }

  const envelopes = parseWebhookPayload(payload);
  // Delivery/read receipts parse to nothing — the common case.
  if (envelopes.length === 0) return NextResponse.json({ ok: true });

  for (const envelope of envelopes) {
    try {
      await processMessage(envelope, creds);
    } catch (e) {
      // One bad message must not abort the rest of the batch, and must not
      // turn into a non-2xx — Meta would redeliver the whole payload.
      console.error("[meta-whatsapp] failed to process message:", e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function processMessage(
  { phone, name, messageId, message }: InboundEnvelope,
  creds: ClinicWhatsappCredentials,
): Promise<void> {
  // Reactions, system notices and empty bodies carry nothing to answer.
  if (message.kind === "ignore") return;

  // One conversation per contact within a clinic, keyed by phone, so a
  // contact's history is one continuous thread across sessions.
  let conversation = await prisma.conversation.findUnique({
    where: {
      clinicId_whatsappPhone: {
        clinicId: creds.clinicId,
        whatsappPhone: phone,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId: creds.clinicId,
        channel: Channel.WHATSAPP,
        whatsappPhone: phone,
        whatsappName: name,
      },
    });
  } else if (conversation.whatsappName !== name) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { whatsappName: name },
    });
  }

  // The agent only reads text, so media never reaches it — record what came in
  // and tell the contact to send text instead.
  if (message.kind === "unsupported") {
    await handleUnsupportedWhatsAppMessage(conversation.id, phone, message, creds);
    return;
  }

  // Hands off to the agent: it persists the user message + reply (linked to the
  // active session) and sends the reply back over the Cloud API.
  await handleWhatsAppMessage(
    conversation.id,
    phone,
    message.text,
    messageId,
    creds,
  );
}

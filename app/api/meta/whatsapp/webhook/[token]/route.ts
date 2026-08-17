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

  console.log("[wa-debug] POST webhook hit");

  const creds = await getWebhookConfigByToken(token);
  if (!creds) {
    // Unknown/rotated token — reject without confirming anything about it.
    console.warn("[wa-debug] DROP: unknown/rotated webhook token → 404");
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.log(
    `[wa-debug] token resolved → clinicId=${creds.clinicId} configuredPhoneNumberId=${creds.phoneNumberId}`,
  );

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    // Meta retries non-2xx; an unparseable body won't parse on retry either.
    console.error("[meta-whatsapp] body was not valid JSON");
    console.warn("[wa-debug] DROP: body was not valid JSON");
    return NextResponse.json({ ok: true });
  }
  // Full raw payload — the ground truth for what Meta actually sent.
  console.log("[wa-debug] raw payload:", JSON.stringify(payload));

  // Defense in depth: the event's target number must match the clinic this URL
  // belongs to. A mismatch means a wrong URL was pasted (or a spoof) — ignore.
  const phoneNumberId = extractPhoneNumberId(payload);
  console.log(
    `[wa-debug] payload phone_number_id=${phoneNumberId ?? "(none)"} vs configured=${creds.phoneNumberId}`,
  );
  if (phoneNumberId && phoneNumberId !== creds.phoneNumberId) {
    console.warn(
      "[meta-whatsapp] phone_number_id does not match this clinic's config — ignoring",
    );
    console.warn(
      `[wa-debug] DROP: phone_number_id mismatch — entire payload discarded (got ${phoneNumberId}, expected ${creds.phoneNumberId})`,
    );
    return NextResponse.json({ ok: true });
  }

  const envelopes = parseWebhookPayload(payload);
  console.log(
    `[wa-debug] parsed ${envelopes.length} envelope(s): ${JSON.stringify(
      envelopes.map((e) => ({
        phone: e.phone,
        userId: e.userId,
        messageId: e.messageId,
        kind: e.message.kind,
      })),
    )}`,
  );
  // Delivery/read receipts parse to nothing — the common case.
  if (envelopes.length === 0) {
    console.log(
      "[wa-debug] 0 envelopes — likely a status/read receipt (no messages array), nothing to store",
    );
    return NextResponse.json({ ok: true });
  }

  for (const envelope of envelopes) {
    try {
      await processMessage(envelope, creds);
    } catch (e) {
      // One bad message must not abort the rest of the batch, and must not
      // turn into a non-2xx — Meta would redeliver the whole payload.
      console.error("[meta-whatsapp] failed to process message:", e);
      console.error(
        `[wa-debug] DROP: processMessage threw for phone=${envelope.phone} messageId=${envelope.messageId} kind=${envelope.message.kind} — message LOST (Meta told ok, no retry):`,
        e,
      );
    }
  }

  console.log("[wa-debug] POST done → ok");
  return NextResponse.json({ ok: true });
}

async function processMessage(
  { phone, userId, name, messageId, message }: InboundEnvelope,
  creds: ClinicWhatsappCredentials,
): Promise<void> {
  console.log(
    `[wa-debug] processMessage phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} messageId=${messageId} kind=${message.kind}`,
  );
  // Reactions, system notices and empty bodies carry nothing to answer.
  if (message.kind === "ignore") {
    console.log(
      `[wa-debug] DROP: kind=ignore (reaction/system/empty body) — not stored. messageId=${messageId}`,
    );
    return;
  }

  const conversation = await resolveConversation(creds.clinicId, {
    phone,
    userId,
    name,
  });

  // The agent only reads text, so media never reaches it — record what came in
  // and tell the contact to send text instead.
  if (message.kind === "unsupported") {
    console.log(
      `[wa-debug] routing → unsupported-media handler convId=${conversation.id}`,
    );
    await handleUnsupportedWhatsAppMessage(
      conversation.id,
      { phone, userId },
      message,
      creds,
    );
    return;
  }

  // Hands off to the agent: it persists the user message + reply (linked to the
  // active session) and sends the reply back over the Cloud API.
  console.log(
    `[wa-debug] routing → text handler convId=${conversation.id}`,
  );
  await handleWhatsAppMessage(
    conversation.id,
    { phone, userId },
    message.text,
    messageId,
    creds,
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
async function resolveConversation(
  clinicId: string,
  { phone, userId, name }: { phone: string | null; userId: string | null; name: string },
) {
  let conversation =
    (userId &&
      (await prisma.conversation.findUnique({
        where: { clinicId_whatsappUserId: { clinicId, whatsappUserId: userId } },
      }))) ||
    null;
  if (!conversation && phone) {
    conversation = await prisma.conversation.findUnique({
      where: { clinicId_whatsappPhone: { clinicId, whatsappPhone: phone } },
    });
  }
  console.log(
    `[wa-debug] conversation lookup phone=${phone ?? "(hidden)"} userId=${userId ?? "(none)"} → ${
      conversation ? `found id=${conversation.id}` : "NOT FOUND (will create)"
    }`,
  );

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId,
        channel: Channel.WHATSAPP,
        whatsappPhone: phone,
        whatsappUserId: userId,
        whatsappName: name,
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
      // A unique clash means the other identifier already belongs to a separate
      // thread — keep the one we matched rather than fail the message.
      console.warn(`[wa-debug] conversation backfill skipped (unique clash):`, e);
    }
  }
  return conversation;
}

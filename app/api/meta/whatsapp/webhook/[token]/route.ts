import { NextRequest, NextResponse } from "next/server";
import { handleVerification } from "@/lib/meta/webhook";
import { parseWebhookPayload, extractPhoneNumberId } from "@/lib/meta/whatsapp-inbound";
import { getWebhookConfigByToken } from "@/lib/meta/whatsapp-config";
import { processInboundWhatsApp } from "@/server/services/whatsappIngest";

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
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const config = await getWebhookConfigByToken(token);
  // Pass the clinic's verify token (or undefined → 403 on a real handshake).
  return handleVerification(request, config?.verifyToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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
    `[wa-debug] token resolved → clinicId=${creds.clinicId} configuredPhoneNumberId=${creds.phoneNumberId}`
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
    `[wa-debug] payload phone_number_id=${phoneNumberId ?? "(none)"} vs configured=${creds.phoneNumberId}`
  );
  if (phoneNumberId && phoneNumberId !== creds.phoneNumberId) {
    console.warn("[meta-whatsapp] phone_number_id does not match this clinic's config — ignoring");
    console.warn(
      `[wa-debug] DROP: phone_number_id mismatch — entire payload discarded (got ${phoneNumberId}, expected ${creds.phoneNumberId})`
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
      }))
    )}`
  );
  // Delivery/read receipts parse to nothing — the common case.
  if (envelopes.length === 0) {
    console.log(
      "[wa-debug] 0 envelopes — likely a status/read receipt (no messages array), nothing to store"
    );
    return NextResponse.json({ ok: true });
  }

  for (const envelope of envelopes) {
    try {
      await processInboundWhatsApp(envelope, { provider: "META_CLOUD", ...creds });
    } catch (e) {
      // One bad message must not abort the rest of the batch, and must not
      // turn into a non-2xx — Meta would redeliver the whole payload.
      console.error("[meta-whatsapp] failed to process message:", e);
      console.error(
        `[wa-debug] DROP: processMessage threw for phone=${envelope.phone} messageId=${envelope.messageId} kind=${envelope.message.kind} — message LOST (Meta told ok, no retry):`,
        e
      );
    }
  }

  console.log("[wa-debug] POST done → ok");
  return NextResponse.json({ ok: true });
}

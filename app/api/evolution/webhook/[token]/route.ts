import { NextRequest, NextResponse } from "next/server";
import { adoptLinkedPhone, getEvolutionConfigByToken } from "@/lib/evolution/config";
import { getInstanceOwner } from "@/lib/evolution/client";
import { evolutionEventName, parseEvolutionMessages } from "@/lib/evolution/inbound";
import { processInboundWhatsApp } from "@/server/services/whatsappIngest";
import { recordPhoneMessage } from "@/server/services/evolutionSync";

export const runtime = "nodejs";

/**
 * Per-clinic Evolution API webhook (unofficial WhatsApp).
 *
 * Each clinic's Evolution instance is created pointing at its OWN URL ending in
 * an unguessable `token` (see lib/evolution/config.ts) — the token identifies
 * the clinic and gates the endpoint, exactly like the Meta webhook. It is a
 * secret: never logged.
 *
 * Always answers 200 once the token resolves: Evolution retries non-2xx, and a
 * message that failed to process won't succeed on a blind retry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const config = await getEvolutionConfigByToken(token);
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    console.error("[evolution] body was not valid JSON");
    return NextResponse.json({ ok: true });
  }

  // Defense in depth: the event must come from this clinic's own instance.
  if (payload.instance !== config.instanceName) {
    console.warn(`[evolution] instance mismatch for clinic ${config.clinicId} — ignoring`);
    return NextResponse.json({ ok: true });
  }

  const event = evolutionEventName(payload);
  if (event === "connection_update") {
    const state = (payload.data as { state?: string } | undefined)?.state;
    console.log(`[evolution] clinic ${config.clinicId} connection → ${state}`);
    if (state === "open") {
      await recordOwnerPhone(config.clinicId, config.configId, config.instanceName);
    }
    return NextResponse.json({ ok: true });
  }

  const records = parseEvolutionMessages(payload);
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[evolution] ${event}: ${records.length} record(s)`,
      records.map((r) => ({
        fromMe: r.fromMe,
        phone: r.envelope.phone,
        userId: r.envelope.userId,
        kind: r.envelope.message.kind,
      }))
    );
  }

  const transport = { provider: "EVOLUTION", ...config } as const;
  for (const record of records) {
    try {
      if (record.fromMe) {
        // Typed on the clinic's phone (or an echo of our own send).
        await recordPhoneMessage(config.clinicId, config.configId, config.instanceName, record);
      } else {
        await processInboundWhatsApp(record.envelope, transport);
      }
    } catch (e) {
      // One bad message must not abort the rest of the batch.
      console.error(
        `[evolution] failed to process message ${record.envelope.messageId} (${record.envelope.message.kind}):`,
        e
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Records which phone this number is (and merges an earlier link of the same
 * phone into it — see adoptLinkedPhone). Best-effort: the status poll does it
 * too.
 */
async function recordOwnerPhone(
  clinicId: string,
  configId: string,
  instanceName: string
): Promise<void> {
  try {
    const { phone } = await getInstanceOwner(instanceName);
    if (phone) await adoptLinkedPhone(clinicId, configId, phone);
  } catch (err) {
    console.error("[evolution] failed to record the linked phone:", err);
  }
}

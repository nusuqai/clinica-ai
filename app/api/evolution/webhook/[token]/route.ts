import { NextRequest, NextResponse } from "next/server";
import { getEvolutionConfigByToken } from "@/lib/evolution/config";
import { evolutionEventName, parseEvolutionMessages } from "@/lib/evolution/inbound";
import { processInboundWhatsApp } from "@/server/services/whatsappIngest";

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
    return NextResponse.json({ ok: true });
  }

  const envelopes = parseEvolutionMessages(payload);
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[evolution] ${event}: ${envelopes.length} envelope(s)`,
      envelopes.map((e) => ({ phone: e.phone, userId: e.userId, kind: e.message.kind }))
    );
  }

  const transport = { provider: "EVOLUTION", ...config } as const;
  for (const envelope of envelopes) {
    try {
      await processInboundWhatsApp(envelope, transport);
    } catch (e) {
      // One bad message must not abort the rest of the batch.
      console.error(
        `[evolution] failed to process message ${envelope.messageId} (${envelope.message.kind}):`,
        e
      );
    }
  }

  return NextResponse.json({ ok: true });
}

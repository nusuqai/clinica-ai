import { NextRequest, NextResponse } from "next/server";
import { adoptLinkedPhone, getEvolutionConfigByToken } from "@/lib/evolution/config";
import { getInstanceOwner } from "@/lib/evolution/client";
import { evolutionEventName, parseEvolutionMessages } from "@/lib/evolution/inbound";
import { processInboundWhatsApp } from "@/server/services/whatsappIngest";
import { recordPhoneMessage } from "@/server/services/evolutionSync";
import { prisma } from "@/lib/prisma";
import { startHistorySync } from "@/server/services/evolutionHistorySync";

/** WhatsApp pushes history to a newly linked phone in the background — give it
 *  a few minutes before importing. */
const AUTO_IMPORT_DELAY_SECONDS = 180;

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
      await autoImportHistory(config.clinicId, config.configId);
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

/**
 * First link of a number → import its recent chats once. Reconnects (server
 * restarts, phone back online) also report "open", so skip numbers that have a
 * sync on record (running, stopped, or done — staff decide what happens to it)
 * or imported before syncs were tracked; the settings panel re-runs it on demand.
 */
async function autoImportHistory(clinicId: string, configId: string): Promise<void> {
  const [sync, imported] = await Promise.all([
    prisma.whatsappHistorySync.findUnique({
      where: { whatsappConfigId: configId },
      select: { id: true },
    }),
    prisma.message.findFirst({
      where: { whatsappConfigId: configId, metadata: { path: ["imported"], equals: true } },
      select: { id: true },
    }),
  ]);
  if (sync || imported) return;
  const res = await startHistorySync(clinicId, configId, "fresh", {
    delaySeconds: AUTO_IMPORT_DELAY_SECONDS,
  });
  if (!res.ok) console.error("[evolution] failed to queue history import:", res.message);
}

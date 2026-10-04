import { NextRequest, NextResponse } from "next/server";
import { claimDueConversations, DEBOUNCE_BATCH } from "@/server/services/debounce";
import { processDebouncedConversation } from "@/server/services/agentRunner";

export const runtime = "nodejs";
// One run drains a bounded batch; each conversation may call the LLM + WhatsApp.
export const maxDuration = 300;
// Never cache — every hit must read live DB state.
export const dynamic = "force-dynamic";

/**
 * Debounce processor — the drain side of the message-debounce feature.
 *
 * Supabase pg_cron POSTs here every ~15s (via pg_net) whenever a conversation's
 * debounce window has elapsed. It is NOT behind the Supabase session auth (see
 * middleware PUBLIC_API_ROUTES); instead it is gated by a shared CRON_SECRET
 * bearer token, so only the scheduler (which holds the secret in Supabase Vault)
 * can trigger it.
 *
 * The handler claims a bounded batch of due conversations (FOR UPDATE SKIP LOCKED,
 * so overlapping ticks never collide) and answers each one. A failure in one
 * conversation never aborts the batch — processDebouncedConversation swallows its
 * own errors and transitions the row to a retry/failed state.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[debounce] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const claimed = await claimDueConversations(DEBOUNCE_BATCH);
  if (claimed.length === 0) {
    return NextResponse.json({ claimed: 0, processed: 0 });
  }

  const results = await Promise.allSettled(claimed.map(processDebouncedConversation));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    // Should not happen — the processor is self-contained — but log if it does.
    console.error(`[debounce] ${failed}/${claimed.length} conversation runs rejected`);
  }

  return NextResponse.json({ claimed: claimed.length, processed: claimed.length - failed });
}

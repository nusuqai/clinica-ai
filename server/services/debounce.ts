import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * DB-driven message debounce — state transitions only.
 *
 * Rapid patient messages are consolidated into ONE agent reply: the webhook
 * ingests each message (persists it, does media work) and only *arms* a debounce
 * here; a pg_cron job (every ~15s) then POSTs /api/cron/process-debounce, which
 * claims conversations whose debounce window has elapsed and answers them once.
 *
 * This module owns the `ConversationProcessing` row + `Message.processedAt` /
 * `deliveryStatus` transitions. The actual agent reply lives in agentRunner's
 * `processDebouncedConversation`, which calls these helpers. Keeping the SQL here
 * (and the reply there) avoids a circular import. See memory message-debounce-pgcron.
 */

/** Max reply attempts before a conversation is parked as FAILED for a human. */
export const DEBOUNCE_MAX_RETRIES = (() => {
  const n = Number(process.env.DEBOUNCE_MAX_RETRIES);
  return Number.isFinite(n) && n > 0 ? n : 3;
})();

/** Constant backoff between reply retries (AI or send failure). */
const RETRY_DELAY_SECONDS = (() => {
  const n = Number(process.env.DEBOUNCE_RETRY_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

/** A PROCESSING row older than this is assumed crashed and is reclaimed. */
const STUCK_MINUTES = 5;

/** How many conversations one processor run claims. Bounds its wall-clock. */
export const DEBOUNCE_BATCH = (() => {
  const n = Number(process.env.DEBOUNCE_BATCH);
  return Number.isFinite(n) && n > 0 ? n : 25;
})();

/**
 * Arms (or re-arms) the debounce for a conversation on a new answerable inbound.
 *
 * `readyAt = now + debounceSeconds` is the gate the processor claims on; storing
 * it (rather than an interval in SQL) keeps per-clinic windows out of the hot
 * query and makes a clinic's live debounce change take effect on the next
 * message. Each new message resets the window AND clears any pending retry/
 * failure — a fresh message is fresh intent and deserves a full set of attempts.
 */
export async function armDebounce(
  conversationId: string,
  clinicId: string,
  wasVoice: boolean,
  debounceSeconds: number
): Promise<void> {
  const now = new Date();
  const readyAt = new Date(now.getTime() + debounceSeconds * 1000);
  await prisma.conversationProcessing.upsert({
    where: { conversationId },
    create: {
      conversationId,
      clinicId,
      status: "PENDING",
      lastInboundAt: now,
      readyAt,
      lastInboundWasVoice: wasVoice,
    },
    update: {
      status: "PENDING",
      lastInboundAt: now,
      readyAt,
      lastInboundWasVoice: wasVoice,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

/** One conversation handed to the processor by {@link claimDueConversations}. */
export interface ClaimedConversation {
  conversationId: string;
  clinicId: string;
  lastInboundWasVoice: boolean;
  retryCount: number;
}

/**
 * Atomically claims up to `limit` conversations that are due to answer, flipping
 * them to PROCESSING so overlapping ticks never grab the same row.
 *
 * Due = a PENDING row whose debounce window elapsed and whose retry backoff (if
 * any) has passed, OR a PROCESSING row left stuck by a crashed run. `FOR UPDATE
 * SKIP LOCKED` is what makes concurrent/overlapping ticks safe.
 */
export async function claimDueConversations(
  limit: number = DEBOUNCE_BATCH
): Promise<ClaimedConversation[]> {
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000);
  const rows = await prisma.$queryRaw<
    {
      conversationId: string;
      clinicId: string;
      lastInboundWasVoice: boolean;
      retryCount: number;
    }[]
  >`
    WITH due AS (
      SELECT "conversationId"
      FROM conversation_processing
      WHERE (
              status = 'PENDING'
              AND "readyAt" <= now()
              AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
            )
         OR (status = 'PROCESSING' AND "claimedAt" < ${stuckBefore})
      ORDER BY "readyAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE conversation_processing p
    SET status = 'PROCESSING', "claimedAt" = now()
    FROM due
    WHERE p."conversationId" = due."conversationId"
    RETURNING
      p."conversationId"      AS "conversationId",
      p."clinicId"            AS "clinicId",
      p."lastInboundWasVoice" AS "lastInboundWasVoice",
      p."retryCount"          AS "retryCount";
  `;
  return rows;
}

/**
 * Marks exactly these inbound messages as answered. Called with the snapshot of
 * ids the agent actually consolidated — a message that arrived mid-run is NOT in
 * the list, so it stays unprocessed and gets its own reply next tick.
 */
export async function markMessagesProcessed(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: messageIds } },
    data: { processedAt: new Date() },
  });
}

/**
 * Finalizes a conversation after a successful reply (or a deliberate no-reply):
 * back to IDLE, ready for the next burst.
 *
 * The `status: "PROCESSING"` guard is the race fix: if a message arrived while
 * we were working, its `armDebounce` already set the row back to PENDING, so this
 * update matches nothing and the new PENDING state (which triggers the next tick)
 * is preserved. No message is ever stranded.
 */
export async function finalizeIdle(conversationId: string): Promise<void> {
  await prisma.conversationProcessing.updateMany({
    where: { conversationId, status: "PROCESSING" },
    data: {
      status: "IDLE",
      claimedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

/**
 * Finalizes after work completes, but requeues instead of idling when the
 * conversation still has unanswered inbound messages — e.g. the resume path
 * re-delivered an old reply yet a newer message had arrived before the claim, or
 * a burst message slipped in. Keeps the PROCESSING guard so a concurrent
 * armDebounce (which already set PENDING) is never clobbered.
 */
export async function finalizeIdleOrRequeue(conversationId: string): Promise<void> {
  const remaining = await prisma.message.count({
    where: { conversationId, senderType: "USER", processedAt: null },
  });
  if (remaining === 0) {
    await finalizeIdle(conversationId);
    return;
  }
  await prisma.conversationProcessing.updateMany({
    where: { conversationId, status: "PROCESSING" },
    data: {
      status: "PENDING",
      readyAt: new Date(), // answer the leftovers on the next tick
      claimedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

/**
 * Records a failed reply attempt and either schedules a retry (constant backoff)
 * or parks the conversation as FAILED once attempts are exhausted. Same
 * PROCESSING guard as {@link finalizeIdle}: if a newer message re-armed the row
 * to PENDING mid-run, we don't clobber it.
 *
 * Returns the outcome so the caller can escalate on terminal failure.
 */
export async function scheduleRetryOrFail(
  conversationId: string,
  currentRetryCount: number,
  error: string
): Promise<"retry" | "failed"> {
  const next = currentRetryCount + 1;
  if (next >= DEBOUNCE_MAX_RETRIES) {
    await prisma.conversationProcessing.updateMany({
      where: { conversationId, status: "PROCESSING" },
      data: {
        status: "FAILED",
        retryCount: next,
        lastError: error.slice(0, 1000),
        claimedAt: null,
      },
    });
    return "failed";
  }
  await prisma.conversationProcessing.updateMany({
    where: { conversationId, status: "PROCESSING" },
    data: {
      status: "PENDING",
      retryCount: next,
      nextRetryAt: new Date(Date.now() + RETRY_DELAY_SECONDS * 1000),
      lastError: error.slice(0, 1000),
      claimedAt: null,
    },
  });
  return "retry";
}

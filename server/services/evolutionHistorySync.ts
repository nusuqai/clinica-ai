import "server-only";
import { randomUUID } from "node:crypto";
import { HistorySyncStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { HISTORY_IMPORT_DAYS } from "@/server/services/evolutionSync";

/**
 * The saved state of a WhatsApp Web number's chat-history import
 * (WhatsappHistorySync, one per number), and the three things staff can do with
 * it: start a fresh 90-day sync, continue a stopped one, or stop the one
 * running. Every function takes the clinic AND the number, and only acts when
 * the number is that clinic's. The background work itself is the
 * `whatsapp-history-import` Inngest function, which reports progress here
 * after every chat.
 */

/** What the settings panel shows — plain JSON, safe to hand to the client. */
export interface HistorySyncState {
  status: HistorySyncStatus;
  totalChats: number;
  /** Chats fully imported so far. */
  doneChats: number;
  messagesImported: number;
  startedAt: string;
  finishedAt: string | null;
  /** True when a stopped/failed sync still has chats left to continue. */
  resumable: boolean;
}

export type HistorySyncMode = "fresh" | "resume";

export type HistorySyncResult =
  | { ok: true; state: HistorySyncState }
  | { ok: false; reason: "not_configured" | "error"; message?: string };

function toState(row: {
  status: HistorySyncStatus;
  chats: Prisma.JsonValue;
  totalChats: number;
  nextIndex: number;
  messagesImported: number;
  startedAt: Date;
  finishedAt: Date | null;
}): HistorySyncState {
  const unfinished =
    row.status === HistorySyncStatus.STOPPED || row.status === HistorySyncStatus.FAILED;
  return {
    status: row.status,
    totalChats: row.totalChats,
    doneChats: row.nextIndex,
    messagesImported: row.messagesImported,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    // Never listed (stopped before the first step) also counts as resumable.
    resumable: unfinished && (row.chats === null || row.nextIndex < row.totalChats),
  };
}

export async function getHistorySyncState(
  clinicId: string,
  configId: string
): Promise<HistorySyncState | null> {
  const row = await prisma.whatsappHistorySync.findFirst({
    where: { clinicId, whatsappConfigId: configId },
  });
  return row ? toState(row) : null;
}

/** Whether `configId` is one of the clinic's WhatsApp Web numbers. */
async function isEvolutionNumber(clinicId: string, configId: string): Promise<boolean> {
  const n = await prisma.whatsappConfig.count({
    where: { id: configId, clinicId, provider: "EVOLUTION" },
  });
  return n > 0;
}

/**
 * Starts the import in the background. "fresh" re-plans the last 90 days from
 * now (already-imported messages are still skipped); "resume" continues a
 * stopped/failed sync from the first unfinished chat.
 */
export async function startHistorySync(
  clinicId: string,
  configId: string,
  mode: HistorySyncMode,
  opts: { delaySeconds?: number } = {}
): Promise<HistorySyncResult> {
  if (!(await isEvolutionNumber(clinicId, configId))) {
    return { ok: false, reason: "not_configured" };
  }
  const current = await prisma.whatsappHistorySync.findUnique({
    where: { whatsappConfigId: configId },
  });
  if (current?.status === HistorySyncStatus.RUNNING) {
    return { ok: false, reason: "error", message: "المزامنة تعمل بالفعل." };
  }
  if (mode === "resume" && !(current && toState(current).resumable)) {
    return { ok: false, reason: "error", message: "لا توجد مزامنة سابقة غير مكتملة للمتابعة." };
  }

  const runId = randomUUID();
  const row =
    mode === "resume"
      ? await prisma.whatsappHistorySync.update({
          where: { whatsappConfigId: configId },
          data: { status: HistorySyncStatus.RUNNING, runId, error: null, finishedAt: null },
        })
      : await prisma.whatsappHistorySync.upsert({
          where: { whatsappConfigId: configId },
          create: {
            clinicId,
            whatsappConfigId: configId,
            status: HistorySyncStatus.RUNNING,
            runId,
            since: new Date(Date.now() - HISTORY_IMPORT_DAYS * 24 * 60 * 60 * 1000),
          },
          update: {
            status: HistorySyncStatus.RUNNING,
            runId,
            since: new Date(Date.now() - HISTORY_IMPORT_DAYS * 24 * 60 * 60 * 1000),
            chats: Prisma.DbNull,
            totalChats: 0,
            nextIndex: 0,
            messagesImported: 0,
            error: null,
            startedAt: new Date(),
            finishedAt: null,
          },
        });

  try {
    await inngest.send({
      name: "whatsapp/history.import",
      data: { clinicId, configId, runId, delaySeconds: opts.delaySeconds },
    });
  } catch (err) {
    console.error("Failed to queue WhatsApp history import:", err);
    await prisma.whatsappHistorySync.updateMany({
      where: { whatsappConfigId: configId, runId },
      data: { status: HistorySyncStatus.FAILED, error: "queue_failed" },
    });
    return { ok: false, reason: "error", message: "تعذّر بدء المزامنة." };
  }
  return { ok: true, state: toState(row) };
}

/**
 * Stops the running sync. Progress so far is kept; the background run notices
 * before its next page of messages and exits.
 */
export async function stopHistorySync(
  clinicId: string,
  configId: string
): Promise<HistorySyncResult> {
  await prisma.whatsappHistorySync.updateMany({
    where: { clinicId, whatsappConfigId: configId, status: HistorySyncStatus.RUNNING },
    data: { status: HistorySyncStatus.STOPPED },
  });
  const state = await getHistorySyncState(clinicId, configId);
  if (!state) return { ok: false, reason: "not_configured" };
  return { ok: true, state };
}

/** Whether `runId` is still the number's live, running sync. */
export async function isHistorySyncActive(configId: string, runId: string): Promise<boolean> {
  const row = await prisma.whatsappHistorySync.findUnique({
    where: { whatsappConfigId: configId },
    select: { status: true, runId: true },
  });
  return row?.status === HistorySyncStatus.RUNNING && row.runId === runId;
}

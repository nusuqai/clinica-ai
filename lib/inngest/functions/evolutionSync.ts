import "server-only";
import { HistorySyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest, type WhatsappHistoryImportData } from "@/lib/inngest/client";
import { getWhatsappTransportById } from "@/lib/whatsapp/transport";
import { listDirectChats } from "@/lib/evolution/client";
import { importChatHistory } from "@/server/services/evolutionSync";
import { isHistorySyncActive } from "@/server/services/evolutionHistorySync";

/**
 * Imports one WhatsApp Web number's 1:1 chats (last 90 days) into the inbox,
 * driven by that number's WhatsappHistorySync row
 * (server/services/evolutionHistorySync.ts). A patient who already has a
 * conversation with the clinic — through another of its numbers — gets these
 * messages merged into that same conversation, ordered by their real time:
 *
 *
 *  - the chat list is fixed on the first run and saved, so a resumed sync walks
 *    the same chats;
 *  - progress (`nextIndex`, message count) is saved after every chat, so a stop
 *    or a crash loses at most the chat in progress — and redoing that chat is
 *    harmless, messages are deduplicated by WhatsApp id;
 *  - every write is conditioned on this run still being the live one (`runId`
 *    + RUNNING), and the import checks it before each page of messages, so
 *    "stop" takes effect within seconds and a stale run can't clobber a newer
 *    sync's progress.
 *
 * Fired from the settings panel (fresh / resume), and automatically a few
 * minutes after a phone first links.
 */
export const whatsappHistoryImport = inngest.createFunction(
  {
    id: "whatsapp-history-import",
    triggers: [{ event: "whatsapp/history.import" }],
    // One import per clinic at a time (several numbers may share patients'
    // conversations); a second request waits its turn, then finds itself stale
    // or resumes where the first stopped.
    concurrency: { key: "event.data.clinicId", limit: 1 },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const { configId, runId } = event.data.event.data as WhatsappHistoryImportData;
      await prisma.whatsappHistorySync.updateMany({
        where: { whatsappConfigId: configId, runId, status: HistorySyncStatus.RUNNING },
        data: { status: HistorySyncStatus.FAILED, error: error.message.slice(0, 500) },
      });
    },
  },
  async ({ event, step }) => {
    const { clinicId, configId, runId, delaySeconds } = event.data as WhatsappHistoryImportData;
    if (delaySeconds && delaySeconds > 0) {
      await step.sleep("wait-for-phone-history", `${delaySeconds}s`);
    }

    const plan = await step.run("load-plan", async () => {
      const row = await prisma.whatsappHistorySync.findUnique({
        where: { whatsappConfigId: configId },
      });
      if (!row || row.runId !== runId || row.status !== HistorySyncStatus.RUNNING) return null;

      const transport = await getWhatsappTransportById(clinicId, configId);
      if (transport?.provider !== "EVOLUTION") {
        await prisma.whatsappHistorySync.updateMany({
          where: { whatsappConfigId: configId, runId },
          data: { status: HistorySyncStatus.FAILED, error: "not_evolution" },
        });
        return null;
      }

      let chats = row.chats as string[] | null;
      if (!chats) {
        chats = await listDirectChats(transport.instanceName);
        await prisma.whatsappHistorySync.updateMany({
          where: { whatsappConfigId: configId, runId },
          data: { chats, totalChats: chats.length },
        });
      }
      return {
        instanceName: transport.instanceName,
        chats,
        start: row.nextIndex,
        since: row.since.toISOString(),
      };
    });
    if (!plan) return { clinicId, skipped: "stopped, replaced, or not an Evolution clinic" };

    const since = new Date(plan.since);
    for (let i = plan.start; i < plan.chats.length; i++) {
      const outcome = await step.run(`chat-${i}`, async () => {
        const active = () => isHistorySyncActive(configId, runId);
        const { written, complete } = await importChatHistory(
          clinicId,
          configId,
          plan.instanceName,
          plan.chats[i],
          since,
          active
        );
        // Count what was written even if stopped mid-chat; only a finished
        // chat moves the resume point forward.
        await prisma.whatsappHistorySync.updateMany({
          where: { whatsappConfigId: configId, runId },
          data: {
            messagesImported: { increment: written },
            ...(complete ? { nextIndex: i + 1 } : {}),
          },
        });
        return complete ? "done" : "stopped";
      });
      if (outcome === "stopped") return { clinicId, stoppedAt: i };
    }

    await step.run("finish", () =>
      prisma.whatsappHistorySync.updateMany({
        where: { whatsappConfigId: configId, runId, status: HistorySyncStatus.RUNNING },
        data: { status: HistorySyncStatus.COMPLETED, finishedAt: new Date() },
      })
    );
    return { clinicId, chats: plan.chats.length };
  }
);

import "server-only";
import { inngest, type WhatsappHistoryImportData } from "@/lib/inngest/client";
import { getClinicWhatsappTransport } from "@/lib/whatsapp/transport";
import { listDirectChats } from "@/lib/evolution/client";
import { HISTORY_IMPORT_DAYS, importChatHistory } from "@/server/services/evolutionSync";

/**
 * Imports the last HISTORY_IMPORT_DAYS of an Evolution clinic's 1:1 chats into
 * the inbox. Fired from the platform console ("sync chats"), and automatically
 * a few minutes after a phone links — WhatsApp pushes its history to the new
 * device in the background, so the import waits for that to land.
 *
 * One step per chat: a failure retries just that chat, and a re-run skips what
 * is already imported, so it's safe to fire again at any time.
 */
export const whatsappHistoryImport = inngest.createFunction(
  {
    id: "whatsapp-history-import",
    triggers: [{ event: "whatsapp/history.import" }],
    // One import per clinic at a time; a second request waits its turn.
    concurrency: { key: "event.data.clinicId", limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { clinicId, delaySeconds } = event.data as WhatsappHistoryImportData;
    if (delaySeconds && delaySeconds > 0) {
      await step.sleep("wait-for-phone-history", `${delaySeconds}s`);
    }

    const chats = await step.run("list-chats", async () => {
      const transport = await getClinicWhatsappTransport(clinicId);
      if (transport?.provider !== "EVOLUTION") return null;
      return {
        instanceName: transport.instanceName,
        jids: await listDirectChats(transport.instanceName),
      };
    });
    if (!chats) return { clinicId, skipped: "not an Evolution clinic" };

    const since = new Date(Date.now() - HISTORY_IMPORT_DAYS * 24 * 60 * 60 * 1000);
    let messages = 0;
    for (const [i, jid] of chats.jids.entries()) {
      messages += await step.run(`chat-${i}`, () =>
        importChatHistory(clinicId, chats.instanceName, jid, since)
      );
    }
    return { clinicId, chats: chats.jids.length, messages };
  }
);

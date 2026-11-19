import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Merges two WhatsApp conversations that turned out to be the same patient.
 *
 * A contact is matched by phone OR by WhatsApp's hidden id (LID / BSUID). With
 * several clinic numbers, one number may see the patient by phone and another
 * only by the hidden id, so two threads get created. The moment a message
 * carries BOTH identifiers we know they're one person — and merge:
 *
 *  - the OLDER conversation is kept; everything of the other moves into it:
 *    messages (each keeps its own timestamp and clinic-number tag, so the
 *    thread interleaves by time), sessions, escalations, reminders, notes,
 *    staff alerts, pins and labels (a pin/label already on the kept thread
 *    isn't duplicated), and its pending AI-processing state;
 *  - identifiers, contact name, linked patient and assignee missing on the kept
 *    thread are taken over;
 *  - the emptied duplicate is deleted.
 *
 * All in one transaction. Returns the kept conversation's id.
 */
export async function mergeConversations(aId: string, bId: string): Promise<string> {
  if (aId === bId) return aId;

  return prisma.$transaction(
    async (tx) => {
      const [a, b] = await Promise.all([
        tx.conversation.findUnique({ where: { id: aId } }),
        tx.conversation.findUnique({ where: { id: bId } }),
      ]);
      if (!a || !b) return (a ?? b)?.id ?? aId; // already merged by a concurrent call
      if (a.clinicId !== b.clinicId) throw new Error("Refusing to merge across clinics");

      const [keep, drop] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
      const move = { where: { conversationId: drop.id }, data: { conversationId: keep.id } };

      await tx.message.updateMany(move);
      await tx.chatSession.updateMany(move);
      await tx.escalation.updateMany(move);
      await tx.conversationReminder.updateMany(move);
      await tx.internalNote.updateMany(move);
      await tx.messageNote.updateMany(move);
      await tx.staffAlert.updateMany(move);

      // Composite keys: move only what the kept thread doesn't already have;
      // the rest goes with the duplicate (cascade).
      const keptPins = await tx.conversationPin.findMany({
        where: { conversationId: keep.id },
        select: { userId: true },
      });
      await tx.conversationPin.updateMany({
        where: { conversationId: drop.id, userId: { notIn: keptPins.map((p) => p.userId) } },
        data: { conversationId: keep.id },
      });
      const keptLabels = await tx.conversationLabel.findMany({
        where: { conversationId: keep.id },
        select: { labelId: true },
      });
      await tx.conversationLabel.updateMany({
        where: { conversationId: drop.id, labelId: { notIn: keptLabels.map((l) => l.labelId) } },
        data: { conversationId: keep.id },
      });

      // One processing row per conversation. If only the duplicate had one
      // (unanswered messages pending), carry it over so they still get a reply;
      // if both had, the kept row's run picks up every unprocessed message.
      const keptProcessing = await tx.conversationProcessing.findUnique({
        where: { conversationId: keep.id },
        select: { conversationId: true },
      });
      if (!keptProcessing) {
        await tx.conversationProcessing.updateMany(move);
      }

      // Delete the duplicate BEFORE taking over its identifiers — they're unique
      // per clinic (phone, hidden id, linked patient).
      await tx.conversation.delete({ where: { id: drop.id } });
      await tx.conversation.update({
        where: { id: keep.id },
        data: {
          whatsappPhone: keep.whatsappPhone ?? drop.whatsappPhone,
          whatsappUserId: keep.whatsappUserId ?? drop.whatsappUserId,
          whatsappName: keep.whatsappName ?? drop.whatsappName,
          userId: keep.userId ?? drop.userId,
          assignedToId: keep.assignedToId ?? drop.assignedToId,
          updatedAt: keep.updatedAt > drop.updatedAt ? keep.updatedAt : drop.updatedAt,
        },
      });

      console.log(`[wa] merged duplicate conversation ${drop.id} into ${keep.id}`);
      return keep.id;
    },
    { timeout: 30_000 }
  );
}

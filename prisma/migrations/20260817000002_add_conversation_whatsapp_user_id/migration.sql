-- Meta's WhatsApp usernames rollout (Business-Scoped User IDs) means a contact
-- can message with their phone hidden — the webhook then carries only a BSUID
-- (contacts[].user_id / messages[].from_user_id, format "CC.alphanumeric") and
-- no phone number. Store that id so such threads have a stable per-clinic key
-- and can be replied to. Null for web + legacy (phone-based) WhatsApp rows.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "whatsappUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_clinicId_whatsappUserId_key" ON "conversations"("clinicId", "whatsappUserId");

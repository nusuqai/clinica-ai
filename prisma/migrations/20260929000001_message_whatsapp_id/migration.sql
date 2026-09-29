-- Store the WhatsApp Cloud API message id (wamid) on messages, so an inbound
-- reaction (which references the reacted message by wamid) can be attached to the
-- right message instead of becoming its own bubble.
-- Applied by hand with `prisma migrate deploy` (see 20260928000001 for why).

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "whatsappMessageId" TEXT;

CREATE INDEX IF NOT EXISTS "messages_conversationId_whatsappMessageId_idx"
  ON "messages"("conversationId", "whatsappMessageId");

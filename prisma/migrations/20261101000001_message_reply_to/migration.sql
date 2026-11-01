-- Quoted replies: a message can point at the earlier message it replies to
-- (WhatsApp `context.id` inbound, or a staff reply picked in the inbox).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Everything here is additive +
-- idempotent.

-- ── Message: self-reference to the quoted message ────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "replyToId" UUID;

CREATE INDEX IF NOT EXISTS "messages_replyToId_idx"
  ON "messages"("replyToId");

-- SET NULL: deleting the quoted message keeps the reply, just unlinked.
DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Voice messages (issue #49): per-clinic TTS toggle, and multi-kind AI usage
-- rows so transcription / reply / TTS each bill on their own auditable ledger
-- line. Hand-written (not `migrate dev`) because this project's Supabase
-- cross-schema FK (public.profiles -> auth.users) breaks Prisma's shadow DB;
-- applied via `prisma migrate deploy`, which never touches a shadow database.

-- New usage discriminator.
CREATE TYPE "AiUsageKind" AS ENUM ('REPLY', 'TRANSCRIPTION', 'TTS');

-- New ledger types so voice costs are filterable in reporting. (Not referenced
-- elsewhere in this migration, so adding the values here is transaction-safe.)
ALTER TYPE "AiLedgerType" ADD VALUE 'TRANSCRIPTION';
ALTER TYPE "AiLedgerType" ADD VALUE 'TTS';

-- Per-clinic voice-reply switch (default off).
ALTER TABLE "clinic_ai_credits"
  ADD COLUMN "voiceReplyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- A message can now carry several usage rows (a voice message: TRANSCRIPTION on
-- the inbound + REPLY/TTS on the answer), so swap the single-column unique on
-- messageId for a composite (messageId, kind).
DROP INDEX "ai_usage_logs_messageId_key";

ALTER TABLE "ai_usage_logs"
  ADD COLUMN "kind" "AiUsageKind" NOT NULL DEFAULT 'REPLY',
  ADD COLUMN "audioSeconds" INTEGER,
  ALTER COLUMN "promptTokens" DROP NOT NULL,
  ALTER COLUMN "completionTokens" DROP NOT NULL,
  ALTER COLUMN "totalTokens" DROP NOT NULL;

CREATE UNIQUE INDEX "ai_usage_logs_messageId_kind_key"
  ON "ai_usage_logs" ("messageId", "kind");

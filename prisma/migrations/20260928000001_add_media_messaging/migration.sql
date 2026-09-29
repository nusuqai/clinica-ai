-- Media messaging (WhatsApp, issue #52): image vision toggle + EXTRACTION cost
-- line, plus per-message escalation linking.
--
-- Applied by hand with `prisma migrate deploy` because `migrate dev` breaks on
-- this project's cross-schema FK (public.profiles -> auth.users) shadow DB.

-- Per-clinic image-analysis (vision) switch (mirrors voiceReplyEnabled). Default
-- off so a clinic never pays for vision until it opts in.
ALTER TABLE "clinic_ai_credits"
  ADD COLUMN IF NOT EXISTS "imageAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Billing discriminator for the one-time image-description (vision) call.
-- USD-only, no unit — same treatment as TRANSCRIPTION/TTS.
ALTER TYPE "AiUsageKind" ADD VALUE IF NOT EXISTS 'EXTRACTION';
ALTER TYPE "AiLedgerType" ADD VALUE IF NOT EXISTS 'EXTRACTION';

-- Link an escalation to the specific inbound message that triggered it, so the
-- CRM inbox can mark that exact bubble and offer a per-message "resolve" button.
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "messageId" UUID;

ALTER TABLE "escalations"
  ADD CONSTRAINT "escalations_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "escalations_messageId_idx" ON "escalations"("messageId");

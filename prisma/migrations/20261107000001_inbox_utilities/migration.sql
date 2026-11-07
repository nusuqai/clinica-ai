-- Inbox utilities: per-user pins + labels, clinic-wide assignment, reminders,
-- staff-only internal notes, message notes, the quick-replies pool, and
-- per-recipient staff alerts (colleague escalation / assignment).
--
-- Hand-written from `prisma migrate diff` (migrate dev breaks on this project's
-- shadow DB). Purely additive. Apply locally with `npm run prisma:deploy`.

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'CLINIC');

-- CreateEnum
CREATE TYPE "StaffAlertKind" AS ENUM ('ESCALATION', 'ASSIGNMENT');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" UUID,
ADD COLUMN     "assignedToId" UUID;

-- CreateTable
CREATE TABLE "conversation_pins" (
    "userId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pins_pkey" PRIMARY KEY ("userId","conversationId")
);

-- CreateTable
CREATE TABLE "inbox_labels" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_labels" (
    "labelId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_labels_pkey" PRIMARY KEY ("labelId","conversationId")
);

-- CreateTable
CREATE TABLE "conversation_reminders" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "authorId" UUID,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_notes" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "mediaPath" TEXT,
    "mediaMimeType" TEXT,
    "mediaWidth" INTEGER,
    "mediaHeight" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_alerts" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID,
    "recipientId" UUID NOT NULL,
    "actorId" UUID,
    "kind" "StaffAlertKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "staff_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_pins_conversationId_idx" ON "conversation_pins"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_pins_clinicId_userId_idx" ON "conversation_pins"("clinicId", "userId");

-- CreateIndex
CREATE INDEX "inbox_labels_ownerId_idx" ON "inbox_labels"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_labels_clinicId_ownerId_name_key" ON "inbox_labels"("clinicId", "ownerId", "name");

-- CreateIndex
CREATE INDEX "conversation_labels_conversationId_idx" ON "conversation_labels"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_reminders_conversationId_idx" ON "conversation_reminders"("conversationId");

-- CreateIndex
CREATE INDEX "conversation_reminders_clinicId_doneAt_dueAt_idx" ON "conversation_reminders"("clinicId", "doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "conversation_reminders_createdById_doneAt_idx" ON "conversation_reminders"("createdById", "doneAt");

-- CreateIndex
CREATE INDEX "conversation_reminders_doneById_idx" ON "conversation_reminders"("doneById");

-- CreateIndex
CREATE INDEX "internal_notes_conversationId_createdAt_idx" ON "internal_notes"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "internal_notes_clinicId_idx" ON "internal_notes"("clinicId");

-- CreateIndex
CREATE INDEX "internal_notes_authorId_idx" ON "internal_notes"("authorId");

-- CreateIndex
CREATE INDEX "message_notes_conversationId_idx" ON "message_notes"("conversationId");

-- CreateIndex
CREATE INDEX "message_notes_messageId_idx" ON "message_notes"("messageId");

-- CreateIndex
CREATE INDEX "message_notes_clinicId_idx" ON "message_notes"("clinicId");

-- CreateIndex
CREATE INDEX "message_notes_authorId_idx" ON "message_notes"("authorId");

-- CreateIndex
CREATE INDEX "quick_replies_clinicId_idx" ON "quick_replies"("clinicId");

-- CreateIndex
CREATE INDEX "quick_replies_createdById_idx" ON "quick_replies"("createdById");

-- CreateIndex
CREATE INDEX "staff_alerts_recipientId_resolvedAt_idx" ON "staff_alerts"("recipientId", "resolvedAt");

-- CreateIndex
CREATE INDEX "staff_alerts_conversationId_idx" ON "staff_alerts"("conversationId");

-- CreateIndex
CREATE INDEX "staff_alerts_messageId_idx" ON "staff_alerts"("messageId");

-- CreateIndex
CREATE INDEX "staff_alerts_clinicId_idx" ON "staff_alerts"("clinicId");

-- CreateIndex
CREATE INDEX "staff_alerts_actorId_idx" ON "staff_alerts"("actorId");

-- CreateIndex
CREATE INDEX "staff_alerts_resolvedById_idx" ON "staff_alerts"("resolvedById");

-- CreateIndex
CREATE INDEX "conversations_assignedToId_idx" ON "conversations"("assignedToId");

-- CreateIndex
CREATE INDEX "conversations_assignedById_idx" ON "conversations"("assignedById");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_labels" ADD CONSTRAINT "inbox_labels_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_labels" ADD CONSTRAINT "inbox_labels_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_labels" ADD CONSTRAINT "conversation_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "inbox_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_labels" ADD CONSTRAINT "conversation_labels_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reminders" ADD CONSTRAINT "conversation_reminders_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reminders" ADD CONSTRAINT "conversation_reminders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reminders" ADD CONSTRAINT "conversation_reminders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reminders" ADD CONSTRAINT "conversation_reminders_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_notes" ADD CONSTRAINT "message_notes_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_notes" ADD CONSTRAINT "message_notes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_notes" ADD CONSTRAINT "message_notes_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_notes" ADD CONSTRAINT "message_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Realtime ────────────────────────────────────────────────────────────────
-- staff_alerts: toast + sound for the ONE recipient (filtered client-side by
-- recipientId) on the same channel as escalations. internal_notes: colleagues
-- see a staff-only note appear live in the open thread. message_notes: a note
-- pinned to a message appears live too (the client drops someone else's
-- PRIVATE note; getMessages applies the same visibility rule).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "staff_alerts";
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "internal_notes";
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "message_notes";
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END $$;

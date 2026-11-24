-- Team assistant (#89): members manage the clinic through the AI (WhatsApp +
-- dashboard bubble) and get grouped WhatsApp alerts per routed event.

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('CUSTOMER', 'STAFF_ASSISTANT');

-- CreateEnum
CREATE TYPE "StaffEvent" AS ENUM ('AI_ESCALATION', 'COLLEAGUE_ESCALATION', 'ASSIGNMENT', 'REMINDER_DUE', 'NEW_BOOKING', 'PATIENT_CANCELLED', 'UNITS_LOW', 'UNITS_OUT');

-- AlterEnum
ALTER TYPE "AiUsageKind" ADD VALUE 'STAFF_REPLY';

-- AlterTable
ALTER TABLE "clinic_members" ADD COLUMN     "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "kind" "ConversationKind" NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "conversation_reminders" ADD COLUMN     "whatsappNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "staff_assistant_settings" (
    "clinicId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "batchMinutes" INTEGER NOT NULL DEFAULT 5,
    "alertTemplateName" TEXT,
    "alertTemplateLanguage" TEXT,
    "alertVariableMap" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alertBodyText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_assistant_settings_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "member_whatsapp_links" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "phone" TEXT,
    "whatsappUserId" TEXT,
    "whatsappConfigId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "linkCode" TEXT,
    "linkCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_event_recipients" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "event" "StaffEvent" NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_event_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_notifications" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "event" "StaffEvent" NOT NULL,
    "text" TEXT NOT NULL,
    "conversationId" UUID,
    "appointmentId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "detailsPending" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_pending_actions" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "staff_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_whatsapp_links_memberId_key" ON "member_whatsapp_links"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "member_whatsapp_links_linkCode_key" ON "member_whatsapp_links"("linkCode");

-- CreateIndex
CREATE INDEX "member_whatsapp_links_whatsappConfigId_idx" ON "member_whatsapp_links"("whatsappConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "member_whatsapp_links_clinicId_phone_key" ON "member_whatsapp_links"("clinicId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "member_whatsapp_links_clinicId_whatsappUserId_key" ON "member_whatsapp_links"("clinicId", "whatsappUserId");

-- CreateIndex
CREATE INDEX "staff_event_recipients_clinicId_event_idx" ON "staff_event_recipients"("clinicId", "event");

-- CreateIndex
CREATE INDEX "staff_event_recipients_memberId_idx" ON "staff_event_recipients"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_event_recipients_event_memberId_key" ON "staff_event_recipients"("event", "memberId");

-- CreateIndex
CREATE INDEX "staff_notifications_sentAt_createdAt_idx" ON "staff_notifications"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "staff_notifications_memberId_detailsPending_idx" ON "staff_notifications"("memberId", "detailsPending");

-- CreateIndex
CREATE INDEX "staff_notifications_clinicId_idx" ON "staff_notifications"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_notifications_memberId_dedupeKey_key" ON "staff_notifications"("memberId", "dedupeKey");

-- CreateIndex
CREATE INDEX "staff_pending_actions_conversationId_consumedAt_idx" ON "staff_pending_actions"("conversationId", "consumedAt");

-- CreateIndex
CREATE INDEX "staff_pending_actions_clinicId_idx" ON "staff_pending_actions"("clinicId");

-- CreateIndex
CREATE INDEX "staff_pending_actions_actorId_idx" ON "staff_pending_actions"("actorId");

-- CreateIndex
CREATE INDEX "conversations_clinicId_kind_idx" ON "conversations"("clinicId", "kind");

-- AddForeignKey
ALTER TABLE "staff_assistant_settings" ADD CONSTRAINT "staff_assistant_settings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_whatsapp_links" ADD CONSTRAINT "member_whatsapp_links_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_whatsapp_links" ADD CONSTRAINT "member_whatsapp_links_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clinic_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_whatsapp_links" ADD CONSTRAINT "member_whatsapp_links_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_event_recipients" ADD CONSTRAINT "staff_event_recipients_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_event_recipients" ADD CONSTRAINT "staff_event_recipients_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clinic_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clinic_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pending_actions" ADD CONSTRAINT "staff_pending_actions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pending_actions" ADD CONSTRAINT "staff_pending_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pending_actions" ADD CONSTRAINT "staff_pending_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Server-only tables: Prisma (table owner) reads them; browsers never do.
DO $outer$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staff_assistant_settings', 'member_whatsapp_links', 'staff_event_recipients',
    'staff_notifications', 'staff_pending_actions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $outer$;

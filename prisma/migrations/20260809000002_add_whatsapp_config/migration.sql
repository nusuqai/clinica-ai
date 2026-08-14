-- Per-clinic WhatsApp Cloud API (Meta official) credentials, entered manually
-- by an admin. One row per clinic; the access token is stored encrypted at
-- rest (see lib/crypto/secret-box.ts). Each clinic runs its own Meta app, so
-- instead of app-secret webhook signatures we route + gate on an unguessable
-- per-clinic `webhookToken` embedded in a unique callback URL, plus a
-- per-clinic `verifyToken` for the GET handshake.

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_clinicId_key" ON "whatsapp_configs"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_phoneNumberId_key" ON "whatsapp_configs"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_webhookToken_key" ON "whatsapp_configs"("webhookToken");

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

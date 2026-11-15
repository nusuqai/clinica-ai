-- WhatsApp provider per clinic: META_CLOUD (official Cloud API) or EVOLUTION
-- (unofficial WhatsApp Web through a self-hosted Evolution API).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent; every
-- existing row stays META_CLOUD via the default. The Meta-only columns become
-- nullable because an Evolution clinic has none of them.

DO $$ BEGIN
  CREATE TYPE "WhatsappProvider" AS ENUM ('META_CLOUD', 'EVOLUTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "whatsapp_configs"
  ADD COLUMN IF NOT EXISTS "provider" "WhatsappProvider" NOT NULL DEFAULT 'META_CLOUD',
  ADD COLUMN IF NOT EXISTS "evolutionInstanceName" TEXT;

ALTER TABLE "whatsapp_configs"
  ALTER COLUMN "phoneNumberId" DROP NOT NULL,
  ALTER COLUMN "wabaId" DROP NOT NULL,
  ALTER COLUMN "accessTokenCipher" DROP NOT NULL,
  ALTER COLUMN "verifyToken" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_evolutionInstanceName_key"
  ON "whatsapp_configs"("evolutionInstanceName");

-- AI employees: named assistants with a persona, working hours and usage caps,
-- plus which one wrote an agent reply / spent a unit.
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Everything here is additive +
-- idempotent.
--
-- NOTE: a clinic with no agents gets NO AI replies (nobody is on shift). This
-- migration creates none, so add agents at /platform/agents for every clinic
-- that should keep auto-replying BEFORE deploying the code that reads them.

-- ── AiAgent ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_agents" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"  UUID NOT NULL,
  "name"      TEXT NOT NULL,
  "jobTitle"  TEXT,
  "persona"   TEXT NOT NULL DEFAULT '',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "alwaysOn"  BOOLEAN NOT NULL DEFAULT false,
  "dailyUnitCap"                INTEGER,
  "dailyUnitCapPerConversation" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_agents_clinicId_name_key"
  ON "ai_agents"("clinicId", "name");

CREATE INDEX IF NOT EXISTS "ai_agents_clinicId_idx"
  ON "ai_agents"("clinicId");

DO $$ BEGIN
  ALTER TABLE "ai_agents"
    ADD CONSTRAINT "ai_agents_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── AiAgentHours: one shift per day ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_agent_hours" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "agentId"   UUID NOT NULL,
  "clinicId"  UUID NOT NULL,
  "dayOfWeek" "DayOfWeek" NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime"   TEXT NOT NULL,
  CONSTRAINT "ai_agent_hours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_agent_hours_agentId_dayOfWeek_key"
  ON "ai_agent_hours"("agentId", "dayOfWeek");

CREATE INDEX IF NOT EXISTS "ai_agent_hours_clinicId_idx"
  ON "ai_agent_hours"("clinicId");

DO $$ BEGIN
  ALTER TABLE "ai_agent_hours"
    ADD CONSTRAINT "ai_agent_hours_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ai_agent_hours"
    ADD CONSTRAINT "ai_agent_hours_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Message: the agent that wrote an AGENT reply ─────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "aiAgentId" UUID;

DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_aiAgentId_fkey"
    FOREIGN KEY ("aiAgentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── AiUsageLog: the agent a charged reply belongs to ─────────────────────────
-- Feeds the per-agent rolling-24h usage caps and the per-agent reports.
ALTER TABLE "ai_usage_logs"
  ADD COLUMN IF NOT EXISTS "aiAgentId" UUID;

CREATE INDEX IF NOT EXISTS "ai_usage_logs_aiAgentId_createdAt_idx"
  ON "ai_usage_logs"("aiAgentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_aiAgentId_fkey"
    FOREIGN KEY ("aiAgentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

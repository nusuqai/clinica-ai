-- Dynamic per-clinic patient health profile (#101).
--
-- Replaces the fixed `patient_intakes` table (7 free-text columns) with a
-- per-clinic questionnaire: sections → questions → dropdown options, one file per (clinic,
-- patient), typed answers with a frozen question snapshot, and an append-only
-- edit history. The old table is DROPPED without migrating data (dev only).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Idempotent where possible.
--
-- FK notes: answers → question, answers → option, and answers/revisions → editor profile are
-- NO ACTION (checked at statement end), so an answered question can't be
-- deleted on its own, while clinic / patient cascades still complete.

-- ─── Drop the old intake file ────────────────────────────────────────────────

DROP TABLE IF EXISTS "patient_intakes";

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "HealthQuestionType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'BOOLEAN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HealthQuestionAudience" AS ENUM ('PATIENT', 'STAFF');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "HealthAnswerSource" AS ENUM ('PATIENT', 'STAFF', 'AGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "health_profile_sections" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"    UUID         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
  "archivedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "health_profile_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "health_profile_questions" (
  "id"         UUID                     NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"   UUID                     NOT NULL,
  "sectionId"  UUID                     NOT NULL,
  "parentId"   UUID,
  "showWhen"   BOOLEAN,
  "label"      TEXT                     NOT NULL,
  "helpText"   TEXT,
  "type"       "HealthQuestionType"     NOT NULL,
  "audience"   "HealthQuestionAudience" NOT NULL DEFAULT 'PATIENT',
  "required"   BOOLEAN                  NOT NULL DEFAULT false,
  "sortOrder"  INTEGER                  NOT NULL DEFAULT 0,
  "minValue"   DOUBLE PRECISION,
  "maxValue"   DOUBLE PRECISION,
  "unit"       TEXT,
  "multiline"  BOOLEAN                  NOT NULL DEFAULT false,
  "placeholder" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)             NOT NULL,
  CONSTRAINT "health_profile_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "health_question_options" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"   UUID         NOT NULL,
  "questionId" UUID         NOT NULL,
  "label"      TEXT         NOT NULL,
  "sortOrder"  INTEGER      NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "health_question_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "patient_health_profiles" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"  UUID         NOT NULL,
  "patientId" UUID         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patient_health_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "patient_health_answers" (
  "id"               UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "profileId"        UUID                 NOT NULL,
  "clinicId"         UUID                 NOT NULL,
  "questionId"       UUID                 NOT NULL,
  "optionId"         UUID,
  "value"            JSONB,
  "questionSnapshot" JSONB                NOT NULL,
  "source"           "HealthAnswerSource" NOT NULL,
  "updatedById"      UUID                 NOT NULL,
  "createdAt"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)         NOT NULL,
  CONSTRAINT "patient_health_answers_pkey" PRIMARY KEY ("id"),
  -- At most one of optionId (SELECT) / value (TEXT, NUMBER, BOOLEAN); both
  -- null = a cleared answer (row kept so its edit history survives).
  CONSTRAINT "patient_health_answers_one_value_chk"
    CHECK ("optionId" IS NULL OR "value" IS NULL)
);

CREATE TABLE IF NOT EXISTS "patient_health_answer_revisions" (
  "id"         UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "answerId"   UUID                 NOT NULL,
  "clinicId"   UUID                 NOT NULL,
  "oldValue"   JSONB,
  "newValue"   JSONB,
  "source"     "HealthAnswerSource" NOT NULL,
  "editedById" UUID                 NOT NULL,
  "editedAt"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_health_answer_revisions_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "health_profile_sections_clinicId_sortOrder_idx"
  ON "health_profile_sections"("clinicId", "sortOrder");

CREATE INDEX IF NOT EXISTS "health_profile_questions_sectionId_sortOrder_idx"
  ON "health_profile_questions"("sectionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "health_profile_questions_clinicId_idx"
  ON "health_profile_questions"("clinicId");
CREATE INDEX IF NOT EXISTS "health_profile_questions_parentId_idx"
  ON "health_profile_questions"("parentId");

CREATE INDEX IF NOT EXISTS "health_question_options_questionId_sortOrder_idx"
  ON "health_question_options"("questionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "health_question_options_clinicId_idx"
  ON "health_question_options"("clinicId");

CREATE UNIQUE INDEX IF NOT EXISTS "patient_health_profiles_clinicId_patientId_key"
  ON "patient_health_profiles"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "patient_health_profiles_patientId_idx"
  ON "patient_health_profiles"("patientId");

CREATE UNIQUE INDEX IF NOT EXISTS "patient_health_answers_profileId_questionId_key"
  ON "patient_health_answers"("profileId", "questionId");
CREATE INDEX IF NOT EXISTS "patient_health_answers_questionId_idx"
  ON "patient_health_answers"("questionId");
CREATE INDEX IF NOT EXISTS "patient_health_answers_optionId_idx"
  ON "patient_health_answers"("optionId");
CREATE INDEX IF NOT EXISTS "patient_health_answers_clinicId_idx"
  ON "patient_health_answers"("clinicId");
CREATE INDEX IF NOT EXISTS "patient_health_answers_updatedById_idx"
  ON "patient_health_answers"("updatedById");

CREATE INDEX IF NOT EXISTS "patient_health_answer_revisions_answerId_editedAt_idx"
  ON "patient_health_answer_revisions"("answerId", "editedAt");
CREATE INDEX IF NOT EXISTS "patient_health_answer_revisions_clinicId_idx"
  ON "patient_health_answer_revisions"("clinicId");
CREATE INDEX IF NOT EXISTS "patient_health_answer_revisions_editedById_idx"
  ON "patient_health_answer_revisions"("editedById");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "health_profile_sections" ADD CONSTRAINT "health_profile_sections_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "health_profile_questions" ADD CONSTRAINT "health_profile_questions_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "health_profile_questions" ADD CONSTRAINT "health_profile_questions_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "health_profile_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "health_profile_questions" ADD CONSTRAINT "health_profile_questions_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "health_profile_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "health_question_options" ADD CONSTRAINT "health_question_options_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "health_question_options" ADD CONSTRAINT "health_question_options_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "health_profile_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_profiles" ADD CONSTRAINT "patient_health_profiles_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_profiles" ADD CONSTRAINT "patient_health_profiles_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answers" ADD CONSTRAINT "patient_health_answers_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answers" ADD CONSTRAINT "patient_health_answers_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "patient_health_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answers" ADD CONSTRAINT "patient_health_answers_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "health_profile_questions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answers" ADD CONSTRAINT "patient_health_answers_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "health_question_options"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answers" ADD CONSTRAINT "patient_health_answers_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answer_revisions" ADD CONSTRAINT "patient_health_answer_revisions_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answer_revisions" ADD CONSTRAINT "patient_health_answer_revisions_answerId_fkey"
    FOREIGN KEY ("answerId") REFERENCES "patient_health_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_health_answer_revisions" ADD CONSTRAINT "patient_health_answer_revisions_editedById_fkey"
    FOREIGN KEY ("editedById") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── RLS: server-only tables (Prisma connects as the owner) ──────────────────

DO $outer$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'health_profile_sections', 'health_profile_questions', 'health_question_options',
    'patient_health_profiles',
    'patient_health_answers', 'patient_health_answer_revisions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $outer$;

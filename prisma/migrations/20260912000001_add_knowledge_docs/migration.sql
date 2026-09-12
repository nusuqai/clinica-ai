-- Free-form clinic knowledge documents the agent looks up on demand via the
-- `list_knowledge` / `get_knowledge` tools. Lightweight, tool-based alternative
-- to vector RAG while the per-clinic document set is small. Scoped by clinic.

-- CreateTable
CREATE TABLE "knowledge_docs" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_docs_clinicId_idx" ON "knowledge_docs"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_docs_clinicId_slug_key" ON "knowledge_docs"("clinicId", "slug");

-- AddForeignKey
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

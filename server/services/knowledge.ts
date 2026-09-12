import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma, type KnowledgeDoc } from "@prisma/client";
import { ok, err, type Result } from "./_result";

/** One row in the knowledge catalog (no heavy `content` field). */
export interface KnowledgeDocMeta {
  slug: string;
  title: string;
  summary: string;
}

/** Full knowledge document, including its markdown body. */
export interface KnowledgeDocFull extends KnowledgeDocMeta {
  content: string;
}

/**
 * Catalog of active knowledge docs for a clinic — metadata only, so it stays
 * cheap to hand to the model. Backs the `list_knowledge` tool.
 */
export async function listKnowledgeDocs(clinicId: string): Promise<KnowledgeDocMeta[]> {
  return prisma.knowledgeDoc.findMany({
    where: { clinicId, isActive: true },
    orderBy: { title: "asc" },
    select: { slug: true, title: true, summary: true },
  });
}

/**
 * Full content of one active knowledge doc by slug. Returns null when the slug
 * doesn't exist (or is inactive) for this clinic. Backs the `get_knowledge` tool.
 */
export async function getKnowledgeDoc(
  clinicId: string,
  slug: string
): Promise<KnowledgeDocFull | null> {
  return prisma.knowledgeDoc.findFirst({
    where: { clinicId, slug, isActive: true },
    select: { slug: true, title: true, summary: true, content: true },
  });
}

// ─── Admin CRUD ────────────────────────────────────────────────────────────────
// The two functions above back the agent tools and hard-filter to active docs.
// The functions below back the admin UI, so they include inactive docs and the
// full row (id, flags, timestamps).

/** Every knowledge doc for a clinic (active + inactive), newest edits first. */
export async function listKnowledgeDocsForAdmin(clinicId: string): Promise<KnowledgeDoc[]> {
  return prisma.knowledgeDoc.findMany({
    where: { clinicId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}

/** One doc by id, scoped to the clinic (ownership). Null if not found here. */
export async function getKnowledgeDocById(
  clinicId: string,
  id: string
): Promise<KnowledgeDoc | null> {
  return prisma.knowledgeDoc.findFirst({ where: { id, clinicId } });
}

export interface CreateKnowledgeDocInput {
  clinicId: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive?: boolean;
}

/** Normalize a raw slug into a stable handle (lowercase, dashed, url-safe). */
function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validate(input: {
  slug: string;
  title: string;
  summary: string;
  content: string;
}): string | null {
  if (!input.slug) return "المعرّف (slug) مطلوب ويجب أن يحتوي على أحرف إنجليزية أو أرقام.";
  if (!input.title.trim()) return "العنوان مطلوب.";
  if (!input.summary.trim()) return "الوصف المختصر مطلوب.";
  if (!input.content.trim()) return "المحتوى مطلوب.";
  return null;
}

export async function createKnowledgeDoc(
  input: CreateKnowledgeDocInput
): Promise<Result<{ id: string }>> {
  const slug = normalizeSlug(input.slug);
  const fields = {
    slug,
    title: input.title.trim(),
    summary: input.summary.trim(),
    content: input.content.trim(),
  };
  const invalid = validate(fields);
  if (invalid) return err(invalid);
  try {
    const doc = await prisma.knowledgeDoc.create({
      data: {
        clinicId: input.clinicId,
        ...fields,
        isActive: input.isActive ?? true,
      },
    });
    return ok({ id: doc.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("يوجد مستند آخر بنفس المعرّف (slug) في هذه العيادة.");
    }
    return err(e instanceof Error ? e.message : "فشل إنشاء المستند");
  }
}

export interface UpdateKnowledgeDocInput {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
}

export async function updateKnowledgeDoc(input: UpdateKnowledgeDocInput): Promise<Result<void>> {
  const slug = normalizeSlug(input.slug);
  const fields = {
    slug,
    title: input.title.trim(),
    summary: input.summary.trim(),
    content: input.content.trim(),
  };
  const invalid = validate(fields);
  if (invalid) return err(invalid);
  try {
    await prisma.knowledgeDoc.update({
      where: { id: input.id },
      data: { ...fields, isActive: input.isActive },
    });
    return ok(undefined);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("يوجد مستند آخر بنفس المعرّف (slug) في هذه العيادة.");
    }
    return err(e instanceof Error ? e.message : "فشل تعديل المستند");
  }
}

export async function setKnowledgeDocActive(id: string, isActive: boolean): Promise<Result<void>> {
  try {
    await prisma.knowledgeDoc.update({ where: { id }, data: { isActive } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة المستند");
  }
}

export async function deleteKnowledgeDoc(id: string): Promise<Result<void>> {
  try {
    await prisma.knowledgeDoc.delete({ where: { id } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف المستند");
  }
}

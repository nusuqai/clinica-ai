import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Every clinic's knowledge documents in one query, for the platform console —
 * the same shape getPlatformWhatsappOverview uses, since both answer "what is
 * the state of this feature across all clinics?".
 *
 * Includes inactive docs: the platform admin authors and curates these, so they
 * need to see what's switched off, not just what the agent can currently read.
 */

export interface PlatformKnowledgeDoc {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
  /** ISO string — this crosses into a client component. */
  updatedAt: string;
}

export interface PlatformClinicKnowledge {
  clinicId: string;
  name: string;
  slug: string;
  docs: PlatformKnowledgeDoc[];
  activeCount: number;
}

export interface PlatformKnowledgeOverview {
  clinics: PlatformClinicKnowledge[];
  totalDocs: number;
  clinicsWithNoDocs: number;
}

export async function getPlatformKnowledgeOverview(): Promise<PlatformKnowledgeOverview> {
  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      knowledgeDocs: {
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          content: true,
          isActive: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: PlatformClinicKnowledge[] = clinics.map((c) => ({
    clinicId: c.id,
    name: c.name,
    slug: c.slug,
    docs: c.knowledgeDocs.map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      summary: d.summary,
      content: d.content,
      isActive: d.isActive,
      updatedAt: d.updatedAt.toISOString(),
    })),
    activeCount: c.knowledgeDocs.filter((d) => d.isActive).length,
  }));

  return {
    clinics: rows,
    totalDocs: rows.reduce((n, c) => n + c.docs.length, 0),
    clinicsWithNoDocs: rows.filter((c) => c.docs.length === 0).length,
  };
}

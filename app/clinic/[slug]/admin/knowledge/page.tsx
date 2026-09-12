import { requireActiveMember } from "@/lib/auth";
import { listKnowledgeDocsForAdmin } from "@/server/services/knowledge";
import PageHeader from "@/components/admin/page-header";
import KnowledgeManager, { type KnowledgeDocView } from "./_components/knowledge-manager";

export default async function AdminKnowledgePage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const docs = await listKnowledgeDocsForAdmin(clinic.id);
  const views: KnowledgeDocView[] = docs.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    summary: d.summary,
    content: d.content,
    isActive: d.isActive,
    updatedAt: d.updatedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="قاعدة المعرفة"
        subtitle="مستندات ومعلومات العيادة التي يعتمد عليها المساعد الذكي للإجابة على استفسارات المرضى."
      />
      <KnowledgeManager docs={views} />
    </div>
  );
}

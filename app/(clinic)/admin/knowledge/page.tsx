import { BookOpen, Eye, EyeOff } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { listKnowledgeDocsForAdmin } from "@/server/services/knowledge";
import PageHeader from "@/components/admin/page-header";

/**
 * Read-only knowledge base for a clinic admin. Authoring lives in the platform
 * console (/platform/knowledge): each document's `slug` and `summary` are
 * retrieval tuning rather than writing — the summary is what the model reads to
 * decide whether to open a document at all — so getting them wrong silently
 * stops the assistant from finding that doc.
 *
 * The clinic still sees what the assistant knows about them, which is what they
 * need when a patient gets an answer that looks wrong.
 */
export default async function AdminKnowledgePage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const docs = await listKnowledgeDocsForAdmin(clinic.id);

  return (
    <div>
      <PageHeader
        title="قاعدة المعرفة"
        subtitle="المستندات التي يعتمد عليها المساعد الذكي للإجابة على استفسارات المرضى."
      />

      <div className="max-w-3xl space-y-3">
        {docs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-16 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-sans text-muted-foreground">لا توجد مستندات بعد لهذه العيادة.</p>
          </div>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading font-bold text-foreground">{d.title}</h3>
                {d.isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-sans text-xs text-emerald-600">
                    <Eye className="h-3 w-3" />
                    مفعّل
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                    <EyeOff className="h-3 w-3" />
                    غير مفعّل
                  </span>
                )}
              </div>
              <p className="mt-1 font-sans text-sm text-muted-foreground">{d.summary}</p>
              <p className="mt-2 font-sans text-xs text-muted-foreground">
                آخر تعديل:{" "}
                {d.updatedAt.toLocaleDateString("ar-EG", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          ))
        )}

        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-sans text-xs leading-relaxed text-muted-foreground">
          لإضافة مستند أو تعديل محتواه، تواصل مع إدارة المنصّة.
        </p>
      </div>
    </div>
  );
}

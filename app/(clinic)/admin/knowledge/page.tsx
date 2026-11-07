import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { knowledgePageAction } from "@/server/actions/admin";
import PageHeader from "@/components/admin/page-header";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { StackedCardSkeleton } from "@/components/ui/skeleton";
import { FilterBar } from "@/components/ui/filter-bar";
import KnowledgeList from "./_components/knowledge-list";

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

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
export default async function AdminKnowledgePage({ searchParams }: PageProps) {
  await requirePermission("agent");
  const { q, status } = await searchParams;
  const filters = { query: q, status };
  // Not awaited: the header and filters render at once; the list streams in
  // behind a Suspense fallback keyed by the filters.
  const docsPromise = knowledgePageAction(filters, 1);

  return (
    <PendingNavigationProvider>
      <div>
        <PageHeader
          title="قاعدة المعرفة"
          subtitle="المستندات التي يعتمد عليها المساعد الذكي للإجابة على استفسارات المرضى."
        />

        <FilterBar
          fields={[
            { type: "search", param: "q", placeholder: "بحث في العنوان أو الملخص..." },
            {
              type: "select",
              param: "status",
              allLabel: "كل المستندات",
              options: [
                { value: "active", label: "مفعّل" },
                { value: "inactive", label: "غير مفعّل" },
              ],
            },
          ]}
        />

        <div className="max-w-3xl space-y-3">
          <PendingSwap fallback={<StackedCardSkeleton count={4} />}>
            <Suspense key={JSON.stringify(filters)} fallback={<StackedCardSkeleton count={4} />}>
              <Await promise={docsPromise}>
                {(docs) => <KnowledgeList initial={docs} filters={filters} />}
              </Await>
            </Suspense>
          </PendingSwap>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-sans text-xs leading-relaxed text-muted-foreground">
            لإضافة مستند أو تعديل محتواه، تواصل مع إدارة المنصّة.
          </p>
        </div>
      </div>
    </PendingNavigationProvider>
  );
}

"use client";

import { BookOpen, Eye, EyeOff } from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
import type { Paginated } from "@/lib/pagination";
import { knowledgePageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";

// The clinic's knowledge docs: filtered in the database (filters live in the
// URL, see FilterBar); the first page is server-rendered, the rest on scroll.
export default function KnowledgeList({
  initial,
  filters,
}: {
  initial: Paginated<KnowledgeDoc>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { query?: string; status?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    knowledgePageAction(filters, page)
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-16 text-center">
        <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-sans text-muted-foreground">
          {Object.values(filters).some(Boolean)
            ? "لا يوجد مستند مطابق للفلاتر."
            : "لا توجد مستندات بعد لهذه العيادة."}
        </p>
      </div>
    );
  }

  return (
    <>
      {items.map((d) => (
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
            {new Date(d.updatedAt).toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      ))}
      <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
    </>
  );
}

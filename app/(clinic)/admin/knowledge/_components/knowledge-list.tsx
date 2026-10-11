"use client";

import { BookOpen, Eye, EyeOff } from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
import type { Paginated } from "@/lib/pagination";
import { knowledgePageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <Card className="py-16 text-center">
        <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-sans text-muted-foreground">
          {Object.values(filters).some(Boolean)
            ? "لا يوجد مستند مطابق للفلاتر."
            : "لا توجد مستندات بعد لهذه العيادة."}
        </p>
      </Card>
    );
  }

  return (
    <>
      {items.map((d) => (
        <Card key={d.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading font-bold text-foreground">{d.title}</h3>
            {d.isActive ? (
              <Badge className="bg-emerald-500/10 px-2 font-normal text-emerald-600">
                <Eye className="h-3 w-3" />
                مفعّل
              </Badge>
            ) : (
              <Badge variant="muted" className="px-2 font-normal">
                <EyeOff className="h-3 w-3" />
                غير مفعّل
              </Badge>
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
        </Card>
      ))}
      <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
    </>
  );
}

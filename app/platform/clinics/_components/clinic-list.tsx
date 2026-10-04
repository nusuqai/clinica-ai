"use client";

import type { Paginated } from "@/lib/pagination";
import { clinicsPageAction } from "@/server/actions/clinics";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { ClinicCard } from "./clinic-forms";

type ClinicRow = Awaited<ReturnType<typeof clinicsPageAction>>["items"][number];

// All clinics: first page from the server, the rest on scroll.
export default function ClinicList({
  initial,
  filters,
}: {
  initial: Paginated<ClinicRow>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { query?: string; active?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    clinicsPageAction(filters, page)
  );
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((c) => (
          <ClinicCard key={c.id} clinic={c} />
        ))}
      </div>
      <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
    </>
  );
}

"use client";

import RecordTimeline from "@/components/medical/record-timeline";
import type { TreatmentRecordView } from "@/server/services/treatments";
import type { Paginated } from "@/lib/pagination";
import { myRecordsPageAction } from "@/server/actions/patient";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";

// The patient's treatment record on the landing page: the first page is
// server-rendered and the rest load as the patient scrolls — so the full
// clinical history lives here instead of on a removed dashboard page. Records
// are plain-serializable (Decimal → string, Dates), so they cross as data.
export function RecordsPanel({ initial }: { initial: Paginated<TreatmentRecordView> }) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, myRecordsPageAction);

  return (
    <div>
      <RecordTimeline
        records={items}
        emptyMessage="لا يوجد سجل علاجي بعد"
        appointmentBasePath="/appointments"
      />
      <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
    </div>
  );
}

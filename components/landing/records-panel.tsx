"use client";

import RecordTimeline from "@/components/medical/record-timeline";
import type { TreatmentRecordView } from "@/server/services/treatments";
import type { Paginated } from "@/lib/pagination";
import { myRecordsPageAction } from "@/server/actions/patient";
import { useLoadMore } from "@/hooks/use-load-more";
import { HistoryFilters, useHistoryFilters } from "./history-filters";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";

// The patient's treatment record on the landing page, filtered in the database
// by text, doctor and date range: the first page is server-rendered and the
// rest load as the patient scrolls — so the full
// clinical history lives here instead of on a removed dashboard page. Records
// are plain-serializable (Decimal → string, Dates), so they cross as data.
export function RecordsPanel({
  initial,
  doctors,
}: {
  initial: Paginated<TreatmentRecordView>;
  /** Doctors this patient has seen — the doctor filter's options. */
  doctors: { id: string; name: string }[];
}) {
  const filters = useHistoryFilters();
  const { items, hasMore, loading, error, loadMore } = useLoadMore(
    initial,
    (page) => myRecordsPageAction(filters.applied, page),
    filters.key
  );

  return (
    <div>
      {/* Filters only once there's a record to filter. */}
      {initial.total > 0 && (
        <HistoryFilters
          filters={filters}
          doctors={doctors}
          searchPlaceholder="بحث في الشكوى أو التشخيص أو الدواء..."
        />
      )}
      <RecordTimeline
        records={items}
        emptyMessage={filters.active ? "لا توجد سجلات مطابقة للفلاتر" : "لا يوجد سجل علاجي بعد"}
        appointmentBasePath="/appointments"
      />
      <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
    </div>
  );
}

"use client";

import { ClinicRequestStatus } from "@prisma/client";
import type { Paginated } from "@/lib/pagination";
import { requestsPageAction } from "@/server/actions/clinics";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { CLINIC_REQUEST_STATUS_LABELS } from "@/lib/labels";
import { clinicHost, clinicOrigin } from "@/lib/clinic-url";
import RequestActions from "./request-actions";

type RequestRow = Awaited<ReturnType<typeof requestsPageAction>>["items"][number];

// Clinic requests (pending first): first page from the server, the rest on scroll.
export default function RequestsTable({ initial }: { initial: Paginated<RequestRow> }) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, requestsPageAction);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">مقدّم الطلب</th>
              <th className="px-4 py-3 text-start font-medium">العيادة المطلوبة</th>
              <th className="px-4 py-3 text-start font-medium">التواصل</th>
              <th className="px-4 py-3 text-start font-medium">الحالة</th>
              <th className="px-4 py-3 text-start font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground">
                  لا توجد طلبات
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="align-top hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">
                  {r.requesterName}
                  {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {r.requestedClinicName}
                  {r.createdClinic && (
                    <a
                      href={clinicOrigin(r.createdClinic.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs text-muted-foreground hover:text-primary hover:underline"
                      dir="ltr"
                    >
                      {clinicHost(r.createdClinic.slug)}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                  <div>{r.requesterEmail}</div>
                  {r.requesterPhone && <div>{r.requesterPhone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {CLINIC_REQUEST_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.status === ClinicRequestStatus.PENDING ? (
                    <RequestActions requestId={r.id} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { ClinicRequestStatus } from "@prisma/client";
import type { Paginated } from "@/lib/pagination";
import { requestsPageAction } from "@/server/actions/clinics";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { CLINIC_REQUEST_STATUS_LABELS } from "@/lib/labels";
import { clinicHost, clinicOrigin } from "@/lib/clinic-url";
import RequestActions from "./request-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RequestRow = Awaited<ReturnType<typeof requestsPageAction>>["items"][number];

// Clinic requests (pending first): first page from the server, the rest on scroll.
export default function RequestsTable({
  initial,
  filters,
}: {
  initial: Paginated<RequestRow>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { status?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    requestsPageAction(filters, page)
  );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="w-full font-sans text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 text-muted-foreground">
              <TableHead className="px-4 py-3 text-start font-medium">مقدّم الطلب</TableHead>
              <TableHead className="px-4 py-3 text-start font-medium">العيادة المطلوبة</TableHead>
              <TableHead className="px-4 py-3 text-start font-medium">التواصل</TableHead>
              <TableHead className="px-4 py-3 text-start font-medium">الحالة</TableHead>
              <TableHead className="px-4 py-3 text-start font-medium">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  لا توجد طلبات
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id} className="align-top hover:bg-muted/30">
                <TableCell className="px-4 py-3 font-medium text-foreground">
                  {r.requesterName}
                  {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                </TableCell>
                <TableCell className="px-4 py-3 text-foreground">
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
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                  <div>{r.requesterEmail}</div>
                  {r.requesterPhone && <div>{r.requesterPhone}</div>}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge className="bg-muted text-foreground">
                    {CLINIC_REQUEST_STATUS_LABELS[r.status]}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  {r.status === ClinicRequestStatus.PENDING ? (
                    <RequestActions requestId={r.id} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

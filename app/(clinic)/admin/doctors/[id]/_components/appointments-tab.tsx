"use client";

import type { AppointmentStatus } from "@prisma/client";
import type { AdminAppointment } from "@/server/services/appointments";
import type { Paginated } from "@/lib/pagination";
import { appointmentsPageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

// The doctor's appointments tab: first page from the server, the rest on scroll.
export default function DoctorAppointmentsTab({
  doctorId,
  filters,
  initial,
}: {
  doctorId: string;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { status?: AppointmentStatus; date?: string };
  initial: Paginated<AdminAppointment>;
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    appointmentsPageAction({ ...filters, doctorId }, page)
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <p className="font-sans text-sm text-muted-foreground">{initial.total} موعد</p>
      </div>
      <div className="overflow-x-auto">
        <Table className="w-full font-sans text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40">
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                المريض
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                التاريخ
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الوقت
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الحالة
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                ملاحظات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  لا توجد مواعيد لهذا الطبيب
                </TableCell>
              </TableRow>
            )}
            {items.map((appt) => {
              return (
                <TableRow key={appt.id} className="transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {appt.patient.fullName}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {appt.slot
                      ? formatSlotDate(appt.slot.date)
                      : appt.bookingDate
                        ? formatSlotDate(appt.bookingDate)
                        : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {appt.slot ? (
                      <>
                        {formatSlotTime(appt.slot.startTime)}
                        {" – "}
                        {formatSlotTime(appt.slot.endTime)}
                      </>
                    ) : appt.orderNumber != null ? (
                      <span dir="rtl">دور رقم {appt.orderNumber}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                    {appt.patientNotes ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
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

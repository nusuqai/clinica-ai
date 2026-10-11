"use client";

import type { AppointmentStatus } from "@prisma/client";
import type { AdminAppointment } from "@/server/services/appointments";
import type { Paginated } from "@/lib/pagination";
import { appointmentsPageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <p className="font-sans text-sm text-muted-foreground">{initial.total} موعد</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">المريض</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">التاريخ</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الوقت</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  لا توجد مواعيد لهذا الطبيب
                </td>
              </tr>
            )}
            {items.map((appt) => {
              return (
                <tr key={appt.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{appt.patient.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {appt.slot
                      ? formatSlotDate(appt.slot.date)
                      : appt.bookingDate
                        ? formatSlotDate(appt.bookingDate)
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
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
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                    {appt.patientNotes ?? "—"}
                  </td>
                </tr>
              );
            })}
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

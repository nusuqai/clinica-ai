"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import type { DoctorAppointmentView } from "@/server/services/appointments";
import type { Paginated } from "@/lib/pagination";
import { myAppointmentsPageAction } from "@/server/actions/doctor";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RecordFormModal from "@/components/medical/record-form-modal";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import AppointmentActions from "./appointment-actions";

type Row = DoctorAppointmentView & { hasRecord: boolean };

// The doctor's appointments table: first page from the server, the rest
// loaded as the doctor scrolls (same filters).
export default function AppointmentsTable({
  initial,
  filters,
}: {
  initial: Paginated<Row>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { status?: AppointmentStatus; patientQuery?: string; date?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    myAppointmentsPageAction(filters, page)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">المريض</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">التاريخ</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الوقت</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                ملاحظات المريض
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-muted-foreground">
                  لا توجد مواعيد
                </td>
              </tr>
            )}
            {items.map((appt) => {
              return (
                <tr key={appt.id} className="align-top transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <span className="text-xs font-bold text-primary">
                          {appt.patient.fullName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{appt.patient.fullName}</p>
                        {appt.patient.phone && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {appt.patient.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
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
                    {appt.cancellationReason && (
                      <p
                        className="mt-1 max-w-[120px] truncate text-xs text-muted-foreground"
                        title={appt.cancellationReason}
                      >
                        {appt.cancellationReason}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[160px] px-4 py-3 text-muted-foreground">
                    <p className="truncate text-xs" title={appt.patientNotes ?? ""}>
                      {appt.patientNotes || "—"}
                    </p>
                    {appt.doctorNotes && (
                      <p className="mt-0.5 truncate text-xs text-primary" title={appt.doctorNotes}>
                        ✍ {appt.doctorNotes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1.5">
                      <AppointmentActions
                        appointmentId={appt.id}
                        currentStatus={appt.status}
                        currentNotes={appt.doctorNotes}
                      />
                      <RecordFormModal
                        appointmentId={appt.id}
                        patientName={appt.patient.fullName}
                        defaultVisitDate={appt.slot?.date ?? appt.bookingDate}
                        hasRecord={appt.hasRecord}
                      />
                      <Link
                        href={`/doctor/appointments/${appt.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        التفاصيل
                      </Link>
                    </div>
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

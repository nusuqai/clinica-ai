"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, FileText } from "lucide-react";
import type { PatientAppointment } from "@/server/services/appointments";
import type { Paginated } from "@/lib/pagination";
import { myPastVisitsPageAction } from "@/server/actions/patient";
import { useLoadMore } from "@/hooks/use-load-more";
import { HistoryFilters, useHistoryFilters } from "./history-filters";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate } from "@/lib/slot-time";

export type PastVisit = PatientAppointment & { hasRecord: boolean };

/** The visit's day: the slot's date, or the booking date for queue bookings. */
export function visitDate(appt: Pick<PatientAppointment, "slot" | "bookingDate">): Date | null {
  return appt.slot?.date ?? appt.bookingDate;
}

// The patient's completed visits on the clinic home page — filtered in the
// database by doctor and date range; the first page is server-rendered, the
// rest load as the patient scrolls.
export function PastVisitsList({
  initial,
  doctors,
}: {
  initial: Paginated<PastVisit>;
  /** Doctors this patient has seen — the doctor filter's options. */
  doctors: { id: string; name: string }[];
}) {
  const filters = useHistoryFilters();
  const { items, hasMore, loading, error, loadMore } = useLoadMore(
    initial,
    (page) => myPastVisitsPageAction(filters.applied, page),
    filters.key
  );

  // Nothing at all yet — no point offering filters.
  if (initial.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
        <p className="font-sans text-sm text-muted-foreground">لا توجد زيارات مكتملة بعد</p>
      </div>
    );
  }

  return (
    <div>
      <HistoryFilters filters={filters} doctors={doctors} />
      {items.length === 0 && !loading && (
        <p className="py-8 text-center font-sans text-sm text-muted-foreground">
          لا توجد زيارات مطابقة للفلاتر
        </p>
      )}
      <ul className="divide-y divide-border">
        {items.map((appt) => {
          const date = visitDate(appt);
          return (
            <li key={appt.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                {date ? (
                  <>
                    <span className="font-heading text-base font-bold leading-none">
                      {formatSlotDate(date, { day: "numeric" })}
                    </span>
                    <span className="font-sans text-[10px] font-medium">
                      {formatSlotDate(date, { month: "short" })}
                    </span>
                  </>
                ) : (
                  <CalendarDays className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans font-medium text-foreground">
                  د. {appt.doctor.profile.fullName}
                </p>
                <p className="font-sans text-xs text-muted-foreground">
                  {[
                    appt.doctor.specialty,
                    appt.branch?.name,
                    date && formatSlotDate(date, { year: "numeric" }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {appt.hasRecord && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-xs font-medium text-primary">
                  <FileText className="h-3 w-3" />
                  له سجل علاجي
                </span>
              )}
              <AppointmentStatusBadge status={appt.status} />
              <Link
                href={`/appointments/${appt.id}`}
                className="inline-flex items-center gap-1 font-sans text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                التفاصيل
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </li>
          );
        })}
        <InfiniteScroll
          as="li"
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
          error={error}
        />
      </ul>
    </div>
  );
}

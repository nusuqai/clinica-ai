import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { myAppointmentsPageAction } from "@/server/actions/doctor";
import AppointmentsTable from "./_components/appointments-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Await } from "@/components/general/await";
import {
  PendingLink,
  PendingNavigationProvider,
  PendingSwap,
} from "@/components/general/pending-navigation";

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string; date?: string }>;
}

export default async function DoctorAppointmentsPage({ searchParams }: PageProps) {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/`);

  const { status, q, date } = await searchParams;
  const filterStatus = Object.keys(APPOINTMENT_STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const filters = { status: filterStatus, patientQuery: q, date };
  // Not awaited: the header, pills and filters render at once; the count and
  // the table stream in behind Suspense fallbacks keyed by the filters.
  const appointmentsPromise = myAppointmentsPageAction(filters, 1);
  const filtersKey = JSON.stringify(filters);
  const tableSkeleton = <TableSkeleton columns={6} rows={7} />;

  // Status pills are links; keep the search + date when switching status.
  const pillHref = (s?: string) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    if (date) params.set("date", date);
    const qs = params.toString();
    return qs ? `/doctor/appointments?${qs}` : "/doctor/appointments";
  };

  return (
    <PendingNavigationProvider>
      <div>
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">المواعيد</h1>
            <div className="mt-1 font-sans text-sm text-muted-foreground">
              <PendingSwap fallback={<Skeleton className="h-4 w-16" />}>
                <Suspense key={filtersKey} fallback={<Skeleton className="h-4 w-16" />}>
                  <Await promise={appointmentsPromise}>{(a) => `${a.total} موعد`}</Await>
                </Suspense>
              </PendingSwap>
            </div>
          </div>
        </div>

        {/* Status filter pills — client-side navigations, so the table's
            skeleton shows the moment one is clicked. */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            asChild
            variant={!filterStatus ? "default" : "secondary"}
            className="h-auto rounded-full px-3 py-1.5"
          >
            <PendingLink href={pillHref()}>الكل</PendingLink>
          </Button>
          {(Object.entries(APPOINTMENT_STATUS_LABELS) as [AppointmentStatus, string][]).map(
            ([val, label]) => (
              <Button
                asChild
                key={val}
                variant={filterStatus === val ? "default" : "secondary"}
                className="h-auto rounded-full px-3 py-1.5"
              >
                <PendingLink href={pillHref(val)}>{label}</PendingLink>
              </Button>
            )
          )}
        </div>

        <FilterBar
          fields={[
            { type: "search", param: "q", placeholder: "بحث باسم المريض أو رقم الهاتف..." },
            { type: "date", param: "date" },
          ]}
        />

        <PendingSwap fallback={tableSkeleton}>
          <Suspense key={filtersKey} fallback={tableSkeleton}>
            <Await promise={appointmentsPromise}>
              {(appointments) => <AppointmentsTable initial={appointments} filters={filters} />}
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

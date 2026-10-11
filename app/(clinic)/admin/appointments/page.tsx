import { Suspense } from "react";
import { AppointmentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { appointmentsPageAction } from "@/server/actions/admin";
import { listDoctors } from "@/server/services/doctors";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import PageHeader from "@/components/admin/page-header";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { BoardSkeleton, Skeleton } from "@/components/ui/skeleton";
import AppointmentBoard from "./_components/appointment-board";
import BookAppointmentButton from "./_components/book-appointment-button";

const STATUSES = Object.values(AppointmentStatus);

interface PageProps {
  searchParams: Promise<{ doctor?: string; branch?: string; q?: string; date?: string }>;
}

export default async function AdminAppointmentsPage({ searchParams }: PageProps) {
  const { clinic, branchIds: scope } = await requirePermission("appointments");
  const { doctor, branch, q, date } = await searchParams;
  const filters = { doctorId: doctor, branchId: branch, patientQuery: q, date };

  // First page of every column; each column then loads more on scroll. Not
  // awaited here: the header and filters render at once, and the count and the
  // board stream in behind their own Suspense fallbacks (see `Await`).
  const pagesPromise = Promise.all(
    STATUSES.map((status) => appointmentsPageAction({ ...filters, status }, 1))
  );
  const [doctors, branches] = await Promise.all([
    // The doctor / branch pickers offer only what this member's branches cover.
    listDoctors(clinic.id, scope),
    listBranches(clinic.id).then((rows) => branchesInScope(rows, scope)),
  ]);
  // Keyed by the filters, so a filter change (same route, new search params)
  // shows the fallback again instead of the stale board.
  const filtersKey = JSON.stringify(filters);

  const filterFields: FilterField[] = [
    { type: "search", param: "q", placeholder: "بحث باسم المريض أو رقم الهاتف..." },
    {
      type: "select",
      param: "doctor",
      allLabel: "كل الأطباء",
      options: doctors.map((d) => ({
        value: d.id,
        label: `${d.profile.fullName} · ${d.specialty}`,
      })),
    },
    // Only worth a control when the clinic actually has several branches.
    ...(branches.length > 1
      ? [
          {
            type: "select" as const,
            param: "branch",
            allLabel: "كل الفروع",
            options: branches.map((b) => ({ value: b.id, label: b.name })),
          },
        ]
      : []),
    { type: "date", param: "date" },
  ];

  return (
    <PendingNavigationProvider>
      <div>
        <PageHeader
          title="المواعيد"
          subtitle={
            <PendingSwap fallback={<Skeleton className="h-4 w-20" />}>
              <Suspense key={filtersKey} fallback={<Skeleton className="h-4 w-20" />}>
                <Await promise={pagesPromise}>
                  {(pages) => `${pages.reduce((sum, p) => sum + p.total, 0)} موعد`}
                </Await>
              </Suspense>
            </PendingSwap>
          }
          action={
            <BookAppointmentButton
              doctors={doctors
                .filter((d) => d.isActive)
                .map((d) => ({
                  id: d.id,
                  name: d.profile.fullName,
                  specialty: d.specialty,
                  fee: d.consultationFee,
                }))}
            />
          }
        />

        <FilterBar fields={filterFields} />
        <PendingSwap fallback={<BoardSkeleton />}>
          <Suspense key={filtersKey} fallback={<BoardSkeleton />}>
            <Await promise={pagesPromise}>
              {(pages) => (
                <AppointmentBoard
                  columns={
                    Object.fromEntries(STATUSES.map((s, i) => [s, pages[i]])) as Record<
                      AppointmentStatus,
                      (typeof pages)[number]
                    >
                  }
                  filters={filters}
                />
              )}
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

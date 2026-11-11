import { Suspense } from "react";
import { ClinicKind } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import { countActiveDoctors } from "@/server/services/clinic-kind";
import { doctorsPageAction } from "@/server/actions/admin";
import PageHeader from "@/components/admin/page-header";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import AddDoctorModal from "./_components/add-doctor-modal";
import DoctorsTable from "./_components/doctors-table";

interface PageProps {
  searchParams: Promise<{ q?: string; specialty?: string; branch?: string; status?: string }>;
}

export default async function AdminDoctorsPage({ searchParams }: PageProps) {
  const { clinic, branchIds: scope } = await requirePermission("doctors");
  const { q, specialty, branch, status } = await searchParams;
  const filters = { query: q, specialtyId: specialty, branchId: branch, status };

  // Not awaited: the header and filters render at once; the count and the
  // table stream in behind Suspense fallbacks keyed by the filters.
  const doctorsPromise = doctorsPageAction(filters, 1);
  const filtersKey = JSON.stringify(filters);
  // Solo-doctor clinic: exactly one active doctor — the add button is offered
  // only while there is none (the service enforces it either way).
  const isSolo = clinic.kind === ClinicKind.SOLO_DOCTOR;
  const [branchRows, specialties, activeDoctors] = await Promise.all([
    listBranches(clinic.id, { activeOnly: true }).then((rows) => branchesInScope(rows, scope)),
    listSpecialtyOptions(clinic.id),
    isSolo ? countActiveDoctors(clinic.id) : Promise.resolve(0),
  ]);
  const branches = branchRows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: b.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    })),
  }));

  const filterFields: FilterField[] = [
    { type: "search", param: "q", placeholder: "بحث بالاسم أو رقم الهاتف..." },
    {
      type: "select",
      param: "specialty",
      allLabel: "كل التخصصات",
      options: specialties.map((s) => ({ value: s.id, label: s.name })),
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
    {
      type: "select",
      param: "status",
      allLabel: "كل الحالات",
      options: [
        { value: "active", label: "نشط" },
        { value: "inactive", label: "غير نشط" },
      ],
    },
  ];

  return (
    <PendingNavigationProvider>
      <div>
        <PageHeader
          title={isSolo ? "الطبيب" : "الأطباء"}
          subtitle={
            isSolo ? (
              "عيادة طبيب واحد"
            ) : (
              <PendingSwap fallback={<Skeleton className="h-4 w-16" />}>
                <Suspense key={filtersKey} fallback={<Skeleton className="h-4 w-16" />}>
                  <Await promise={doctorsPromise}>{(doctors) => `${doctors.total} طبيب`}</Await>
                </Suspense>
              </PendingSwap>
            )
          }
          action={
            !isSolo || activeDoctors === 0 ? (
              <AddDoctorModal branches={branches} specialties={specialties} />
            ) : null
          }
        />
        {isSolo ? (
          <p className="mb-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            هذه عيادة طبيب واحد: تعرض الصفحة الرئيسية والمساعد الذكي هذا الطبيب وحده. لإضافة أطباء
            آخرين تواصل مع إدارة المنصة لتحويل العيادة إلى مركز طبي.
          </p>
        ) : (
          <FilterBar fields={filterFields} />
        )}
        <PendingSwap fallback={<TableSkeleton columns={5} rows={7} />}>
          <Suspense key={filtersKey} fallback={<TableSkeleton columns={5} rows={7} />}>
            <Await promise={doctorsPromise}>
              {(doctors) => (
                <DoctorsTable
                  initial={doctors}
                  filters={filters}
                  branches={branches}
                  specialties={specialties}
                />
              )}
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

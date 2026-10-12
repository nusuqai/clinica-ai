import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { myPatientsPageAction } from "@/server/actions/doctor";
import PatientsTable from "./_components/patients-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Card } from "@/components/ui/card";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function DoctorPatientsPage({ searchParams }: PageProps) {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/doctor`);

  const { q = "" } = await searchParams;
  // Not awaited: the header and search render at once; the count and the
  // list stream in behind Suspense fallbacks keyed by the search.
  const patientsPromise = myPatientsPageAction(q, 1);

  return (
    <PendingNavigationProvider>
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-foreground">المرضى</h1>
          <div className="mt-1 font-sans text-sm text-muted-foreground">
            <PendingSwap fallback={<Skeleton className="h-4 w-16" />}>
              <Suspense key={q} fallback={<Skeleton className="h-4 w-16" />}>
                <Await promise={patientsPromise}>{(patients) => `${patients.total} مريض`}</Await>
              </Suspense>
            </PendingSwap>
          </div>
        </div>

        <FilterBar
          fields={[{ type: "search", param: "q", placeholder: "بحث بالاسم أو رقم الهاتف..." }]}
        />

        <PendingSwap fallback={<TableSkeleton columns={6} rows={7} />}>
          <Suspense key={q} fallback={<TableSkeleton columns={6} rows={7} />}>
            <Await promise={patientsPromise}>
              {(patients) =>
                patients.total === 0 && q ? (
                  <Card className="py-16 text-center">
                    <p className="font-sans text-sm text-muted-foreground">
                      لا يوجد مريض مطابق للبحث
                    </p>
                  </Card>
                ) : patients.total === 0 ? (
                  <Card className="py-20 text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
                    <p className="font-sans font-medium text-muted-foreground">لا توجد مرضى بعد</p>
                    <p className="mt-1 font-sans text-sm text-muted-foreground">
                      ستظهر قائمة المرضى بعد أول موعد مكتمل
                    </p>
                  </Card>
                ) : (
                  <PatientsTable initial={patients} query={q} />
                )
              }
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

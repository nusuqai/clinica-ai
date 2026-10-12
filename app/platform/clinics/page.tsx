import { Suspense } from "react";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { clinicsPageAction } from "@/server/actions/clinics";
import { CreateClinicForm } from "./_components/clinic-forms";
import ClinicList from "./_components/clinic-list";
import { FilterBar } from "@/components/ui/filter-bar";
import { Card } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ q?: string; active?: string }>;
}

export default async function PlatformClinicsPage({ searchParams }: PageProps) {
  const { q, active } = await searchParams;
  const filters = { query: q, active };
  // Not awaited: the page renders at once and the list streams in behind a
  // Suspense fallback keyed by the filters.
  const clinicsPromise = clinicsPageAction(filters, 1);

  return (
    <PendingNavigationProvider>
      <div>
        <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">العيادات</h1>

        <Card className="mb-8 p-6">
          <h2 className="mb-4 font-heading font-semibold text-foreground">إنشاء عيادة جديدة</h2>
          <CreateClinicForm />
        </Card>

        <FilterBar
          fields={[
            { type: "search", param: "q", placeholder: "بحث باسم العيادة أو النطاق..." },
            {
              type: "select",
              param: "active",
              allLabel: "كل العيادات",
              options: [
                { value: "active", label: "مفعّلة" },
                { value: "inactive", label: "معطّلة" },
              ],
            },
          ]}
        />
        <PendingSwap fallback={<CardGridSkeleton count={4} />}>
          <Suspense key={JSON.stringify(filters)} fallback={<CardGridSkeleton count={4} />}>
            <Await promise={clinicsPromise}>
              {(clinics) => <ClinicList initial={clinics} filters={filters} />}
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

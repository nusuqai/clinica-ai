import { Suspense } from "react";
import { Await } from "@/components/general/await";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";
import { TableSkeleton } from "@/components/ui/skeleton";
import { requestsPageAction } from "@/server/actions/clinics";
import { ClinicRequestStatus } from "@prisma/client";
import { FilterBar } from "@/components/ui/filter-bar";
import { CLINIC_REQUEST_STATUS_LABELS } from "@/lib/labels";
import RequestsTable from "./_components/requests-table";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function PlatformRequestsPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const filters = { status };
  // Not awaited: the page renders at once and the table streams in behind a
  // Suspense fallback keyed by the filters.
  const requestsPromise = requestsPageAction(filters, 1);

  return (
    <PendingNavigationProvider>
      <div>
        <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
          طلبات إنشاء العيادات
        </h1>

        <FilterBar
          fields={[
            {
              type: "select",
              param: "status",
              allLabel: "كل الطلبات",
              options: Object.values(ClinicRequestStatus).map((s) => ({
                value: s,
                label: CLINIC_REQUEST_STATUS_LABELS[s],
              })),
            },
          ]}
        />
        <PendingSwap fallback={<TableSkeleton columns={5} rows={6} />}>
          <Suspense key={JSON.stringify(filters)} fallback={<TableSkeleton columns={5} rows={6} />}>
            <Await promise={requestsPromise}>
              {(requests) => <RequestsTable initial={requests} filters={filters} />}
            </Await>
          </Suspense>
        </PendingSwap>
      </div>
    </PendingNavigationProvider>
  );
}

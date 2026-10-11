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
  const requests = await requestsPageAction(filters, 1);

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">طلبات إنشاء العيادات</h1>

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
      <RequestsTable initial={requests} filters={filters} />
    </div>
  );
}

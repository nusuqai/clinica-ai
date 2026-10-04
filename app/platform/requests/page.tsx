import { requestsPageAction } from "@/server/actions/clinics";
import RequestsTable from "./_components/requests-table";

export default async function PlatformRequestsPage() {
  const requests = await requestsPageAction(1);

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">طلبات إنشاء العيادات</h1>

      <RequestsTable initial={requests} />
    </div>
  );
}

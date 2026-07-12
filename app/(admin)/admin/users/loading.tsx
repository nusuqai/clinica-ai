import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <TableSkeleton columns={5} rows={8} />
    </div>
  );
}

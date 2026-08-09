import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton withAction />
      <TableSkeleton columns={8} rows={7} />
    </div>
  );
}

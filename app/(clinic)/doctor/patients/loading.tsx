import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <TableSkeleton columns={5} rows={7} />
    </div>
  );
}

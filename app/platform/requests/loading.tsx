import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-7 w-56" />
      <Skeleton className="mb-4 h-10 w-40 rounded-xl" />
      <TableSkeleton columns={5} rows={6} />
    </div>
  );
}

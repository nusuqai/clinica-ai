import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <TableSkeleton columns={6} rows={7} />
    </div>
  );
}

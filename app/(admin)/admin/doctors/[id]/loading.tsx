import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-4 w-32 mb-6" />

      {/* Doctor header card */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-muted/40 border border-border rounded-xl p-1 w-fit">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>

      <TableSkeleton columns={5} rows={6} />
    </div>
  );
}

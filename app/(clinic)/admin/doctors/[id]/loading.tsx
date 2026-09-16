import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-4 w-32" />

      {/* Doctor header card */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>

      <TableSkeleton columns={5} rows={6} />
    </div>
  );
}

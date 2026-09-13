import { PageHeaderSkeleton, StatCardGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatCardGridSkeleton count={4} columns="grid-cols-2 md:grid-cols-4" />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6">
            <Skeleton className="mb-6 h-4 w-40" />
            <div className="mb-6 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-14 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="mb-6 h-4 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

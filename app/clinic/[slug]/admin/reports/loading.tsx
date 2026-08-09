import { PageHeaderSkeleton, StatCardGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatCardGridSkeleton count={4} columns="grid-cols-2 md:grid-cols-4" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-6">
            <Skeleton className="h-4 w-40 mb-6" />
            <div className="grid grid-cols-2 gap-3 mb-6">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-14 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

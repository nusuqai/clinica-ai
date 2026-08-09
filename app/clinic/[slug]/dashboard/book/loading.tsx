import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

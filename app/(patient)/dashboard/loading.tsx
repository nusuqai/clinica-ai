import { Skeleton, StatCardGridSkeleton, ListCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      <StatCardGridSkeleton count={4} columns="grid-cols-2 lg:grid-cols-4" />
      <ListCardSkeleton rows={3} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

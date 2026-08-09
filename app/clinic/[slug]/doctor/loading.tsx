import { Skeleton, StatCardGridSkeleton, ListCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>
      <StatCardGridSkeleton count={4} columns="grid-cols-2 lg:grid-cols-4" />
      <ListCardSkeleton rows={5} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

import { Skeleton, CardGridSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-1 mb-6 bg-muted/40 border border-border rounded-xl p-1 w-fit">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <CardGridSkeleton count={6} />
    </div>
  );
}

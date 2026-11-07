import { Card } from "@/components/ui/card";
import { CardGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-7 w-32" />
      <Card className="mb-8 space-y-4 p-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </Card>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <CardGridSkeleton count={4} />
    </div>
  );
}

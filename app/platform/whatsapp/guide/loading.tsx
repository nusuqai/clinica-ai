import { Card } from "@/components/ui/card";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="max-w-3xl space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

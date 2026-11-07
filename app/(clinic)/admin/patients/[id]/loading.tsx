import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-4 w-32" />

      {/* Patient header card */}
      <Card className="p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 flex-shrink-0 rounded-xl" />
        </div>
      </Card>

      {/* Clinical history */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

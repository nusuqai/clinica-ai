import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="flex w-72 flex-shrink-0 flex-col">
            <Skeleton className="h-9 w-full rounded-b-none rounded-t-xl" />
            <div className="flex min-h-[280px] flex-col gap-2 rounded-b-xl border border-t-0 border-border bg-muted/20 p-2">
              {Array.from({ length: 2 }).map((_, card) => (
                <Skeleton key={card} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

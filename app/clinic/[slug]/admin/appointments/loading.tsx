import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="flex flex-col w-72 flex-shrink-0">
            <Skeleton className="h-9 w-full rounded-t-xl rounded-b-none" />
            <div className="flex flex-col gap-2 p-2 bg-muted/20 border border-t-0 border-border rounded-b-xl min-h-[280px]">
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

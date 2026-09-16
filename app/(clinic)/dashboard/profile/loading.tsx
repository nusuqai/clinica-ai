import { PageHeaderSkeleton, Skeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="max-w-xl">
        <div className="mb-8 flex items-center gap-4">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <FormCardSkeleton fields={3} />
      </div>
    </div>
  );
}

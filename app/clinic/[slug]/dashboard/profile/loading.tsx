import { PageHeaderSkeleton, Skeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="max-w-xl">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
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

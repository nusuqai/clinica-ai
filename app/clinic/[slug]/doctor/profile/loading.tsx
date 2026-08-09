import { Skeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </div>

      <FormCardSkeleton fields={4} />

      <div className="grid grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

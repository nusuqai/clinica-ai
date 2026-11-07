import { Card } from "@/components/ui/card";
import { ClinicPageShellSkeleton, FormCardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ClinicPageShellSkeleton tall>
      <div className="mx-auto -mt-16 max-w-4xl space-y-6 px-6 pb-16">
        {/* Identity card */}
        <Card className="p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Skeleton className="h-20 w-20 flex-shrink-0 rounded-full" />
            <div className="w-full flex-1 space-y-2">
              <Skeleton className="mx-auto h-7 w-44 sm:mx-0" />
              <Skeleton className="mx-auto h-4 w-32 sm:mx-0" />
              <Skeleton className="mx-auto h-4 w-56 sm:mx-0" />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FormCardSkeleton fields={3} />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </ClinicPageShellSkeleton>
  );
}

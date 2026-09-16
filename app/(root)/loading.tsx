import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <Skeleton className="h-8 w-32" />
        <div className="hidden items-center gap-6 md:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center gap-5 px-6 py-24 text-center">
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-12 w-40 rounded-xl" />
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
      </div>

      {/* Doctors grid */}
      <div className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Skeleton className="mx-auto mb-10 h-7 w-56" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-14 w-14 flex-shrink-0 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

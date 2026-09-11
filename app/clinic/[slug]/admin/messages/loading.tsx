import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <Skeleton className="mb-2 h-7 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border bg-card">
        {/* Conversation list */}
        <aside className="flex w-72 flex-shrink-0 flex-col border-e border-border">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </div>
          <ul className="flex-1 divide-y divide-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <li key={i} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                </div>
                <Skeleton className="h-3 w-36" />
              </li>
            ))}
          </ul>
        </aside>

        {/* Thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex-1 space-y-3 px-5 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <Skeleton className={`h-10 rounded-2xl ${i % 2 ? "w-1/3" : "w-1/2"}`} />
              </div>
            ))}
          </div>
          <div className="border-t border-border px-4 py-3">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <Skeleton className="h-7 w-24 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex h-[calc(100vh-7rem)] bg-card border border-border rounded-2xl overflow-hidden">
        {/* Conversation list */}
        <aside className="w-72 flex-shrink-0 border-e border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <Skeleton className="h-4 w-24" />
          </div>
          <ul className="flex-1 divide-y divide-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <li key={i} className="px-4 py-3 space-y-2">
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
        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex-1 px-5 py-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <Skeleton className={`h-10 rounded-2xl ${i % 2 ? "w-1/3" : "w-1/2"}`} />
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

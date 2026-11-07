import { Card } from "@/components/ui/card";
import { Skeleton, StackedCardSkeleton } from "@/components/ui/skeleton";

// Fallback for every platform section without its own: credits, knowledge,
// WhatsApp — a title, a row of totals, then one card per clinic.
export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-7 w-48" />
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-5">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3.5 w-28" />
          </Card>
        ))}
      </div>
      <StackedCardSkeleton count={4} />
    </div>
  );
}

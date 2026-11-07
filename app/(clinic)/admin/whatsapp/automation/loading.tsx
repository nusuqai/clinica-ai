import { PageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="max-w-3xl space-y-4">
        <FormCardSkeleton fields={3} />
        <FormCardSkeleton fields={2} />
      </div>
    </div>
  );
}

import { PageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <FormCardSkeleton fields={5} />
    </div>
  );
}

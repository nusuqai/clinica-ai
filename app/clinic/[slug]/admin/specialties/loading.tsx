import { PageHeaderSkeleton, ListCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <ListCardSkeleton />
    </div>
  );
}

import {
  PageHeaderSkeleton,
  StatCardGridSkeleton,
  ListCardSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatCardGridSkeleton count={8} columns="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
      <ListCardSkeleton rows={6} />
    </div>
  );
}

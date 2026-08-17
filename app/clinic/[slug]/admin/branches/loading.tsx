import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton withAction />
      <CardGridSkeleton count={4} />
    </div>
  );
}

import { PageHeaderSkeleton, FormCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton withAction />
      <div className="max-w-3xl">
        <FormCardSkeleton fields={5} />
      </div>
    </div>
  );
}

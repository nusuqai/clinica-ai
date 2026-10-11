import { AppointmentDetailSkeleton, ClinicPageShellSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <ClinicPageShellSkeleton>
      <div className="px-6 py-8">
        <AppointmentDetailSkeleton />
      </div>
    </ClinicPageShellSkeleton>
  );
}

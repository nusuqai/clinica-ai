import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { myPatientsPageAction } from "@/server/actions/doctor";
import PatientsTable from "./_components/patients-table";

export default async function DoctorPatientsPage() {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/doctor`);

  const patients = await myPatientsPageAction(1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">المرضى</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">{patients.total} مريض</p>
      </div>

      {patients.total === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-20 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="font-sans font-medium text-muted-foreground">لا توجد مرضى بعد</p>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            ستظهر قائمة المرضى بعد أول موعد مكتمل
          </p>
        </div>
      ) : (
        <PatientsTable initial={patients} />
      )}
    </div>
  );
}

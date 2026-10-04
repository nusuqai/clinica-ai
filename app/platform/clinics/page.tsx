import { clinicsPageAction } from "@/server/actions/clinics";
import { CreateClinicForm } from "./_components/clinic-forms";
import ClinicList from "./_components/clinic-list";

export default async function PlatformClinicsPage() {
  const clinics = await clinicsPageAction(1);

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">العيادات</h1>

      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-heading font-semibold text-foreground">إنشاء عيادة جديدة</h2>
        <CreateClinicForm />
      </div>

      <ClinicList initial={clinics} />
    </div>
  );
}

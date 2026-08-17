import { requireActiveMember } from "@/lib/auth";
import { listSpecialties } from "@/server/services/specialties";
import PageHeader from "@/components/admin/page-header";
import SpecialtiesManager, {
  type SpecialtyView,
} from "./_components/specialties-manager";

export default async function AdminSpecialtiesPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const specialties = await listSpecialties(clinic.id);
  const views: SpecialtyView[] = specialties.map((s) => ({
    id: s.id,
    name: s.name,
    doctorCount: s._count.doctors,
  }));

  return (
    <div>
      <PageHeader title="التخصصات" subtitle={`${specialties.length} تخصص`} />
      <SpecialtiesManager specialties={views} />
    </div>
  );
}

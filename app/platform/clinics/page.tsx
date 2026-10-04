import { clinicsPageAction } from "@/server/actions/clinics";
import { CreateClinicForm } from "./_components/clinic-forms";
import ClinicList from "./_components/clinic-list";
import { FilterBar } from "@/components/ui/filter-bar";

interface PageProps {
  searchParams: Promise<{ q?: string; active?: string }>;
}

export default async function PlatformClinicsPage({ searchParams }: PageProps) {
  const { q, active } = await searchParams;
  const filters = { query: q, active };
  const clinics = await clinicsPageAction(filters, 1);

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">العيادات</h1>

      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-heading font-semibold text-foreground">إنشاء عيادة جديدة</h2>
        <CreateClinicForm />
      </div>

      <FilterBar
        fields={[
          { type: "search", param: "q", placeholder: "بحث باسم العيادة أو النطاق..." },
          {
            type: "select",
            param: "active",
            allLabel: "كل العيادات",
            options: [
              { value: "active", label: "مفعّلة" },
              { value: "inactive", label: "معطّلة" },
            ],
          },
        ]}
      />
      <ClinicList initial={clinics} filters={filters} />
    </div>
  );
}

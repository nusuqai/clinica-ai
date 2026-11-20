import { requirePermission } from "@/lib/auth";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { listCategories, listPractitionerOptions, listServices } from "@/server/services/catalog";
import PageHeader from "@/components/admin/page-header";
import ServicesManager from "./_components/services-manager";

export default async function AdminServicesPage() {
  const ctx = await requirePermission("services");
  const { clinic } = ctx;
  const scope = ctx.branchIds;

  const [categories, services, allBranches, practitioners] = await Promise.all([
    listCategories(clinic.id),
    listServices(clinic.id, scope),
    listBranches(clinic.id),
    listPractitionerOptions(clinic.id, scope),
  ]);
  const branches = branchesInScope(allBranches, scope).map((b) => ({
    id: b.id,
    name: b.name,
    isActive: b.isActive,
  }));

  return (
    <div>
      <PageHeader
        title="الخدمات"
        subtitle={`${services.length} خدمة في ${categories.length} تصنيف`}
      />
      <ServicesManager
        categories={categories}
        services={services}
        branches={branches}
        practitioners={practitioners}
        limited={scope !== null}
      />
    </div>
  );
}

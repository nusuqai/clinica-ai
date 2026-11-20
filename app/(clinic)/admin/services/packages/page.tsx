import { requirePermission } from "@/lib/auth";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { listCategories, listServices } from "@/server/services/catalog";
import { listPackages } from "@/server/services/packages";
import PageHeader from "@/components/admin/page-header";
import PackagesManager from "./_components/packages-manager";

export default async function AdminPackagesPage() {
  const ctx = await requirePermission("services");
  const { clinic } = ctx;
  const scope = ctx.branchIds;

  const [packages, categories, services, allBranches] = await Promise.all([
    listPackages(clinic.id, scope),
    listCategories(clinic.id),
    listServices(clinic.id, scope),
    listBranches(clinic.id),
  ]);
  const branches = branchesInScope(allBranches, scope).map((b) => ({
    id: b.id,
    name: b.name,
    isActive: b.isActive,
  }));

  return (
    <div>
      <PageHeader
        title="الباقات"
        subtitle="رصيد مدفوع مقدماً (نبضات، وحدات أو جلسات) يستهلكه المريض على زياراته"
      />
      <PackagesManager
        packages={packages}
        categories={categories}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          categoryId: s.categoryId,
          isActive: s.isActive,
          unitLabel: s.unitLabel,
        }))}
        branches={branches}
        limited={scope !== null}
      />
    </div>
  );
}

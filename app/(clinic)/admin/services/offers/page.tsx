import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayInZone } from "@/lib/offers";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { listCategories } from "@/server/services/catalog";
import { listOfferTargetOptions, listOffers } from "@/server/services/offers";
import PageHeader from "@/components/admin/page-header";
import OffersManager from "./_components/offers-manager";

export default async function AdminOffersPage() {
  const ctx = await requirePermission("offers");
  const { clinic } = ctx;
  const scope = ctx.branchIds;

  const [offers, categories, targets, allBranches, clinicRow] = await Promise.all([
    listOffers(clinic.id, scope),
    listCategories(clinic.id),
    listOfferTargetOptions(clinic.id, scope),
    listBranches(clinic.id),
    prisma.clinic.findUnique({ where: { id: clinic.id }, select: { timezone: true } }),
  ]);
  const branches = allBranches.map((b) => ({
    id: b.id,
    name: b.name,
    isActive: b.isActive,
    mine: branchesInScope([b], scope).length > 0,
  }));
  const live = offers.filter((o) => o.status === "ACTIVE").length;

  return (
    <div>
      <PageHeader title="العروض" subtitle={`${offers.length} عرض · ${live} فعّال الآن`} />
      <OffersManager
        offers={offers}
        categories={categories}
        services={targets.services}
        packages={targets.packages}
        branches={branches}
        limited={scope !== null}
        today={todayInZone(clinicRow?.timezone ?? "Africa/Cairo")}
      />
    </div>
  );
}

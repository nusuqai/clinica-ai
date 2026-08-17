import { requireActiveMember } from "@/lib/auth";
import { listBranches } from "@/server/services/branches";
import PageHeader from "@/components/admin/page-header";
import BranchesManager, { type BranchView } from "./_components/branches-manager";

export default async function AdminBranchesPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const branches = await listBranches(clinic.id);

  // Serialize Prisma Decimals to plain numbers for the client component.
  const views: BranchView[] = branches.map((b) => ({
    id: b.id,
    name: b.name,
    isMain: b.isMain,
    isActive: b.isActive,
    address: b.address,
    mapsUrl: b.mapsUrl,
    latitude: b.latitude != null ? Number(b.latitude) : null,
    longitude: b.longitude != null ? Number(b.longitude) : null,
    hasParking: b.hasParking,
    parkingInfo: b.parkingInfo,
    nearestLandmark: b.nearestLandmark,
    directions: b.directions,
    doctorCount: b._count.doctors,
    phones: b.phones.map((p) => ({
      type: p.type,
      number: p.number,
      label: p.label,
      isPrimary: p.isPrimary,
    })),
    hours: b.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    })),
  }));

  return (
    <div>
      <PageHeader title="الفروع" subtitle={`${branches.length} فرع`} />
      <BranchesManager branches={views} />
    </div>
  );
}

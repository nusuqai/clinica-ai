import { prisma } from "@/lib/prisma";
import { CreateClinicForm, ClinicCard } from "./_components/clinic-forms";

export default async function PlatformClinicsPage() {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      isActive: true,
      _count: { select: { members: true, doctors: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
        العيادات
      </h1>

      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-heading font-semibold text-foreground">
          إنشاء عيادة جديدة
        </h2>
        <CreateClinicForm />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {clinics.map((c) => (
          <ClinicCard key={c.id} clinic={c} />
        ))}
      </div>
    </div>
  );
}

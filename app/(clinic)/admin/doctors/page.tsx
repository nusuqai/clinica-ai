import { requirePermission } from "@/lib/auth";
import { branchesInScope, listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import { doctorsPageAction } from "@/server/actions/admin";
import PageHeader from "@/components/admin/page-header";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import AddDoctorModal from "./_components/add-doctor-modal";
import DoctorsTable from "./_components/doctors-table";

interface PageProps {
  searchParams: Promise<{ q?: string; specialty?: string; branch?: string; status?: string }>;
}

export default async function AdminDoctorsPage({ searchParams }: PageProps) {
  const { clinic, branchIds: scope } = await requirePermission("doctors");
  const { q, specialty, branch, status } = await searchParams;
  const filters = { query: q, specialtyId: specialty, branchId: branch, status };

  const [doctors, branchRows, specialties] = await Promise.all([
    doctorsPageAction(filters, 1),
    listBranches(clinic.id, { activeOnly: true }).then((rows) => branchesInScope(rows, scope)),
    listSpecialtyOptions(clinic.id),
  ]);
  const branches = branchRows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: b.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    })),
  }));

  const filterFields: FilterField[] = [
    { type: "search", param: "q", placeholder: "بحث بالاسم أو رقم الهاتف..." },
    {
      type: "select",
      param: "specialty",
      allLabel: "كل التخصصات",
      options: specialties.map((s) => ({ value: s.id, label: s.name })),
    },
    // Only worth a control when the clinic actually has several branches.
    ...(branches.length > 1
      ? [
          {
            type: "select" as const,
            param: "branch",
            allLabel: "كل الفروع",
            options: branches.map((b) => ({ value: b.id, label: b.name })),
          },
        ]
      : []),
    {
      type: "select",
      param: "status",
      allLabel: "كل الحالات",
      options: [
        { value: "active", label: "نشط" },
        { value: "inactive", label: "غير نشط" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="الأطباء"
        subtitle={`${doctors.total} طبيب`}
        action={<AddDoctorModal branches={branches} specialties={specialties} />}
      />
      <FilterBar fields={filterFields} />
      <DoctorsTable
        initial={doctors}
        filters={filters}
        branches={branches}
        specialties={specialties}
      />
    </div>
  );
}

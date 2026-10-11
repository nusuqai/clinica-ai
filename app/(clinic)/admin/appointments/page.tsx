import { AppointmentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { appointmentsPageAction } from "@/server/actions/admin";
import { listDoctors } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import { FilterBar, type FilterField } from "@/components/ui/filter-bar";
import PageHeader from "@/components/admin/page-header";
import AppointmentBoard from "./_components/appointment-board";
import BookAppointmentButton from "./_components/book-appointment-button";

const STATUSES = Object.values(AppointmentStatus);

interface PageProps {
  searchParams: Promise<{ doctor?: string; branch?: string; q?: string; date?: string }>;
}

export default async function AdminAppointmentsPage({ searchParams }: PageProps) {
  const { clinic } = await requirePermission("appointments");
  const { doctor, branch, q, date } = await searchParams;
  const filters = { doctorId: doctor, branchId: branch, patientQuery: q, date };

  // First page of every column; each column then loads more on scroll.
  const [pages, doctors, branches] = await Promise.all([
    Promise.all(STATUSES.map((status) => appointmentsPageAction({ ...filters, status }, 1))),
    listDoctors(clinic.id),
    listBranches(clinic.id),
  ]);
  const columns = Object.fromEntries(STATUSES.map((s, i) => [s, pages[i]])) as Record<
    AppointmentStatus,
    (typeof pages)[number]
  >;
  const total = pages.reduce((sum, p) => sum + p.total, 0);

  const filterFields: FilterField[] = [
    { type: "search", param: "q", placeholder: "بحث باسم المريض أو رقم الهاتف..." },
    {
      type: "select",
      param: "doctor",
      allLabel: "كل الأطباء",
      options: doctors.map((d) => ({
        value: d.id,
        label: `${d.profile.fullName} · ${d.specialty}`,
      })),
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
    { type: "date", param: "date" },
  ];

  return (
    <div>
      <PageHeader
        title="المواعيد"
        subtitle={`${total} موعد`}
        action={
          <BookAppointmentButton
            doctors={doctors
              .filter((d) => d.isActive)
              .map((d) => ({
                id: d.id,
                name: d.profile.fullName,
                specialty: d.specialty,
                fee: d.consultationFee,
              }))}
          />
        }
      />

      <FilterBar fields={filterFields} />
      <AppointmentBoard columns={columns} filters={filters} />
    </div>
  );
}

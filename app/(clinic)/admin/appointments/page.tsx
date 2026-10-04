import { AppointmentStatus } from "@prisma/client";
import { requireClinicMember } from "@/lib/auth";
import { appointmentsPageAction } from "@/server/actions/admin";
import { listDoctors } from "@/server/services/doctors";
import PageHeader from "@/components/admin/page-header";
import AppointmentBoard from "./_components/appointment-board";
import BookAppointmentButton from "./_components/book-appointment-button";

const STATUSES = Object.values(AppointmentStatus);

interface PageProps {
  searchParams: Promise<{ doctor?: string; q?: string; date?: string }>;
}

export default async function AdminAppointmentsPage({ searchParams }: PageProps) {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const { doctor, q, date } = await searchParams;
  const filters = { doctorId: doctor, patientQuery: q, date };

  // First page of every column; each column then loads more on scroll.
  const [pages, doctors] = await Promise.all([
    Promise.all(STATUSES.map((status) => appointmentsPageAction({ ...filters, status }, 1))),
    listDoctors(clinic.id),
  ]);
  const columns = Object.fromEntries(STATUSES.map((s, i) => [s, pages[i]])) as Record<
    AppointmentStatus,
    (typeof pages)[number]
  >;
  const total = pages.reduce((sum, p) => sum + p.total, 0);
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

      <AppointmentBoard
        columns={columns}
        filters={filters}
        doctors={doctors.map((d) => ({
          id: d.id,
          fullName: d.profile.fullName,
          specialty: d.specialty,
        }))}
      />
    </div>
  );
}

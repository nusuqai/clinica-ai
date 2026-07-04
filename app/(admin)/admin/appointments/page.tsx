import { listAppointments } from "@/server/services/appointments";
import { listDoctors } from "@/server/services/doctors";
import PageHeader from "@/components/admin/page-header";
import AppointmentBoard from "./_components/appointment-board";

export default async function AdminAppointmentsPage() {
  const [appointments, doctors] = await Promise.all([
    listAppointments(),
    listDoctors(),
  ]);

  return (
    <div>
      <PageHeader
        title="المواعيد"
        subtitle={`${appointments.length} موعد`}
      />

      <AppointmentBoard
        appointments={appointments}
        doctors={doctors.map((d) => ({ id: d.id, fullName: d.profile.fullName, specialty: d.specialty }))}
      />
    </div>
  );
}

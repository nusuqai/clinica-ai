import { listActiveDoctors } from "@/server/services/doctors";
import { DoctorsClient } from "@/components/landing/doctors-client";
import PageHeader from "@/components/admin/page-header";

export default async function BookAppointmentPage() {
  const doctors = await listActiveDoctors();

  const serialisedDoctors = doctors.map((d) => ({
    id: d.id,
    specialty: d.specialty,
    consultationFee: d.consultationFee ? Number(d.consultationFee) : null,
    isActive: d.isActive,
    profile: {
      fullName: d.profile.fullName,
      phone: d.profile.phone,
    },
    _count: { appointments: d._count.appointments },
  }));

  return (
    <div>
      <PageHeader
        title="احجز موعداً"
        subtitle="اختر الطبيب المناسب وحدد وقت الزيارة"
      />
      <DoctorsClient
        doctors={serialisedDoctors}
        isAuthenticated={true}
        isPatient={true}
      />
    </div>
  );
}

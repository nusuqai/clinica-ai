import { redirect } from "next/navigation";
import { Users, Phone, Calendar } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorPatients, getDoctorByProfileId } from "@/server/services/doctors";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate } from "@/lib/slot-time";

export default async function DoctorPatientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/clinic/${slug}/doctor`);

  const patients = await getDoctorPatients(doctor.id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">المرضى</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">{patients.length} مريض</p>
      </div>

      {patients.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-20 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="font-sans font-medium text-muted-foreground">لا توجد مرضى بعد</p>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            ستظهر قائمة المرضى بعد أول موعد مكتمل
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full font-sans text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">المريض</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    رقم الهاتف
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    آخر موعد
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    حالة آخر موعد
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    إجمالي المواعيد
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {patients.map((patient) => {
                  return (
                    <tr key={patient.patientId} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                            <span className="text-sm font-bold text-accent">
                              {patient.fullName.charAt(0)}
                            </span>
                          </div>
                          <p className="font-medium text-foreground">{patient.fullName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient.phone ? (
                          <span className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                            {patient.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                          {patient.lastAppointmentDate
                            ? formatSlotDate(patient.lastAppointmentDate)
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={patient.lastStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted font-sans text-xs font-semibold text-muted-foreground">
                          {patient.totalAppointments}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { Users, Phone, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDoctorPatients } from "@/server/services/doctors";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate } from "@/lib/slot-time";

export default async function DoctorPatientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const patients = await getDoctorPatients(user.id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">المرضى</h1>
        <p className="text-sm text-muted-foreground mt-1 font-sans">
          {patients.length} مريض
        </p>
      </div>

      {patients.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-20 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-sans font-medium">
            لا توجد مرضى بعد
          </p>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            ستظهر قائمة المرضى بعد أول موعد مكتمل
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                    المريض
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                    رقم الهاتف
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                    آخر موعد
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                    حالة آخر موعد
                  </th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                    إجمالي المواعيد
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {patients.map((patient) => {
                  return (
                    <tr
                      key={patient.patientId}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-accent">
                              {patient.fullName.charAt(0)}
                            </span>
                          </div>
                          <p className="font-medium text-foreground">
                            {patient.fullName}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient.phone ? (
                          <span className="flex items-center gap-1.5" dir="ltr">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            {patient.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          {formatSlotDate(patient.lastAppointmentDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={patient.lastStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-semibold text-muted-foreground font-sans">
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

import Link from "next/link";
import { Eye } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listPatients } from "@/server/services/team";
import PageHeader from "@/components/admin/page-header";

// The clinic's patients only. Team members (admins + staff) live on /admin/team
// and doctors on /admin/doctors.
export default async function AdminPatientsPage() {
  const { clinic } = await requirePermission("patients");
  const patients = await listPatients(clinic.id);

  return (
    <div>
      <PageHeader title="المرضى" subtitle={`${patients.length} مريض مسجّل`} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الهاتف</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  البريد الإلكتروني
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">المواعيد</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  تاريخ التسجيل
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    لا يوجد مرضى مسجّلون بعد
                  </td>
                </tr>
              )}
              {patients.map((patient) => (
                <tr key={patient.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/patients/${patient.id}`}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {patient.fullName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {patient.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {patient.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{patient.appointmentCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(patient.joinedAt).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/patients/${patient.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      عرض التفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

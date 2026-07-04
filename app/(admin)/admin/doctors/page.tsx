import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listDoctors } from "@/server/services/doctors";
import PageHeader from "@/components/admin/page-header";
import AddDoctorModal from "./_components/add-doctor-modal";
import EditDoctorModal from "./_components/edit-doctor-modal";
import DoctorRowActions from "./_components/doctor-row-actions";

export default async function AdminDoctorsPage() {
  const doctors = await listDoctors();

  return (
    <div>
      <PageHeader
        title="الأطباء"
        subtitle={`${doctors.length} طبيب مسجّل`}
        action={<AddDoctorModal />}
      />

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الاسم</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">البريد الإلكتروني</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">التخصص</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الهاتف</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">رسوم الاستشارة</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">المواعيد</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doctors.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    لا يوجد أطباء. أضف طبيباً جديداً لتبدأ.
                  </td>
                </tr>
              )}
              {doctors.map((doctor) => (
                <tr key={doctor.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{doctor.profile.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">{doctor.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{doctor.specialty}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">{doctor.profile.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {doctor.consultationFee ? `${doctor.consultationFee} ر.س` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{doctor._count.appointments}</td>
                  <td className="px-4 py-3">
                    <span className={[
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      doctor.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}>
                      {doctor.isActive ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/doctors/${doctor.id}`}
                        title="عرض التفاصيل"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <EditDoctorModal doctor={doctor} />
                      <DoctorRowActions doctorId={doctor.id} isActive={doctor.isActive} />
                    </div>
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

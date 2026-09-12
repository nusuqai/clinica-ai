import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import { listDoctors } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import PageHeader from "@/components/admin/page-header";
import AddDoctorModal from "./_components/add-doctor-modal";
import EditDoctorModal from "./_components/edit-doctor-modal";
import DoctorRowActions from "./_components/doctor-row-actions";

export default async function AdminDoctorsPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const [doctors, branchRows, specialties] = await Promise.all([
    listDoctors(clinic.id),
    listBranches(clinic.id, { activeOnly: true }),
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

  return (
    <div>
      <PageHeader
        title="الأطباء"
        subtitle={`${doctors.length} طبيب مسجّل`}
        action={<AddDoctorModal branches={branches} specialties={specialties} />}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">التخصص</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">المواعيد</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doctors.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    لا يوجد أطباء. أضف طبيباً جديداً لتبدأ.
                  </td>
                </tr>
              )}
              {doctors.map((doctor) => (
                <tr key={doctor.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {doctor.profile.fullName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{doctor.specialty}</td>
                  <td className="px-4 py-3 text-muted-foreground">{doctor._count.appointments}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        doctor.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {doctor.isActive ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/doctors/${doctor.id}`}
                        title="عرض التفاصيل"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <EditDoctorModal
                        doctor={doctor}
                        branches={branches}
                        specialties={specialties}
                      />
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

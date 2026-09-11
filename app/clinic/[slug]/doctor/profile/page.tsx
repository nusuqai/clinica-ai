import { redirect } from "next/navigation";
import { UserCircle, Stethoscope, Phone, DollarSign } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { listSpecialtyOptions } from "@/server/services/specialties";
import ProfileForm from "./_components/profile-form";

export default async function DoctorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/clinic/${slug}/doctor`);
  const specialties = await listSpecialtyOptions(ctx.clinic.id);

  const initials = doctor.profile.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">الملف الشخصي</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          حدّث معلوماتك الشخصية والمهنية
        </p>
      </div>

      {/* Avatar card */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <span className="font-sans text-2xl font-bold text-primary">{initials}</span>
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              {doctor.profile.fullName}
            </h2>
            <p className="font-sans text-sm text-muted-foreground">{doctor.specialty}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {doctor.profile.phone && (
                <span
                  className="flex items-center gap-1 font-sans text-xs text-muted-foreground"
                  dir="ltr"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {doctor.profile.phone}
                </span>
              )}
              {doctor.consultationFee && (
                <span className="flex items-center gap-1 font-sans text-xs text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  {String(doctor.consultationFee)} ر.س
                </span>
              )}
              <span
                className={[
                  "rounded-full px-2 py-0.5 font-sans text-xs font-medium",
                  doctor.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {doctor.isActive ? "نشط" : "غير نشط"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-5 font-heading font-semibold text-foreground">تعديل المعلومات</h3>
        <ProfileForm
          fullName={doctor.profile.fullName}
          phone={doctor.profile.phone}
          specialtyId={doctor.specialtyId}
          specialties={specialties}
          bio={doctor.bio}
          consultationFee={doctor.consultationFee ? String(doctor.consultationFee) : null}
        />
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-heading text-xl font-bold text-foreground">
              {doctor._count.appointments}
            </p>
            <p className="font-sans text-xs text-muted-foreground">إجمالي المواعيد</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <UserCircle className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="font-heading text-xl font-bold text-foreground">
              {new Date(doctor.profile.createdAt).toLocaleDateString("ar-EG", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="font-sans text-xs text-muted-foreground">تاريخ التسجيل</p>
          </div>
        </div>
      </div>
    </div>
  );
}

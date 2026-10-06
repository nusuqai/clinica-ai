import { redirect } from "next/navigation";
import { UserCircle, Stethoscope, Phone, DollarSign } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { listSpecialtyOptions } from "@/server/services/specialties";
import ProfileForm from "./_components/profile-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default async function DoctorProfilePage() {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/doctor`);
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
      <Card className="mb-6 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-primary/10 font-sans text-2xl font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
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
              <Badge variant={doctor.isActive ? "success" : "neutral"}>
                {doctor.isActive ? "نشط" : "غير نشط"}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit form */}
      <Card className="p-6">
        <h3 className="mb-5 font-heading font-semibold text-foreground">تعديل المعلومات</h3>
        <ProfileForm
          fullName={doctor.profile.fullName}
          phone={doctor.profile.phone}
          specialtyId={doctor.specialtyId}
          specialties={specialties}
          bio={doctor.bio}
          consultationFee={doctor.consultationFee ? String(doctor.consultationFee) : null}
        />
      </Card>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Card className="flex items-center gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-heading text-xl font-bold text-foreground">
              {doctor._count.appointments}
            </p>
            <p className="font-sans text-xs text-muted-foreground">إجمالي المواعيد</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-5">
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
        </Card>
      </div>
    </div>
  );
}

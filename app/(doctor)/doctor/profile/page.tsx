import { redirect } from "next/navigation";
import { UserCircle, Stethoscope, Phone, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDoctor } from "@/server/services/doctors";
import ProfileForm from "./_components/profile-form";

export default async function DoctorProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const doctor = await getDoctor(user.id);
  if (!doctor) redirect("/doctor");

  const initials = doctor.profile.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          الملف الشخصي
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-sans">
          حدّث معلوماتك الشخصية والمهنية
        </p>
      </div>

      {/* Avatar card */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-primary font-sans">
              {initials}
            </span>
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              {doctor.profile.fullName}
            </h2>
            <p className="text-sm text-muted-foreground font-sans">
              {doctor.specialty}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {doctor.profile.phone && (
                <span
                  className="flex items-center gap-1 text-xs text-muted-foreground font-sans"
                  dir="ltr"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {doctor.profile.phone}
                </span>
              )}
              {doctor.consultationFee && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-sans">
                  <DollarSign className="w-3.5 h-3.5" />
                  {String(doctor.consultationFee)} ر.س
                </span>
              )}
              <span
                className={[
                  "text-xs font-medium px-2 py-0.5 rounded-full font-sans",
                  doctor.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {doctor.isActive ? "نشط" : "غير نشط"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-heading font-semibold text-foreground mb-5">
          تعديل المعلومات
        </h3>
        <ProfileForm
          fullName={doctor.profile.fullName}
          phone={doctor.profile.phone}
          specialty={doctor.specialty}
          bio={doctor.bio}
          consultationFee={
            doctor.consultationFee ? String(doctor.consultationFee) : null
          }
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold font-heading text-foreground">
              {doctor._count.appointments}
            </p>
            <p className="text-xs text-muted-foreground font-sans">إجمالي المواعيد</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-xl font-bold font-heading text-foreground">
              {new Date(doctor.profile.createdAt).toLocaleDateString("ar-EG", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="text-xs text-muted-foreground font-sans">تاريخ التسجيل</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClinicMember(["DOCTOR"]);

  return (
    <DashboardShell
      role="doctor"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "طبيب"}
      userEmail={ctx.user.email}
      clinicId={ctx.clinic.id}
      clinicName={ctx.clinic.name}
      clinicLogoUrl={ctx.clinic.logoUrl}
      viaPlatformAdmin={ctx.viaPlatformAdmin}
    >
      {children}
    </DashboardShell>
  );
}

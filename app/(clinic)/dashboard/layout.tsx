import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  // Non-patients are redirected to their own role's home by requireClinicMember.
  const ctx = await requireClinicMember(["PATIENT"]);

  return (
    <DashboardShell
      role="patient"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "مستخدم"}
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

import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Non-patients are redirected to their own role's home by requireClinicMember.
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["PATIENT"]);

  return (
    <DashboardShell
      role="patient"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "مستخدم"}
      userEmail={ctx.user.email}
      clinicId={ctx.clinic.id}
      clinicName={ctx.clinic.name}
      clinicLogoUrl={ctx.clinic.logoUrl}
    >
      {children}
    </DashboardShell>
  );
}

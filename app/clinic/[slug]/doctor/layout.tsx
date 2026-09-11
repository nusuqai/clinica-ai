import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";

export default async function DoctorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);

  return (
    <DashboardShell
      role="doctor"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "طبيب"}
      userEmail={ctx.user.email}
      clinicId={ctx.clinic.id}
    >
      {children}
    </DashboardShell>
  );
}

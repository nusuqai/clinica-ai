import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/general/dashboard-shell";

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { fullName: true, role: true },
  });

  if (profile?.role === "DOCTOR") redirect("/doctor");
  if (profile?.role === "ADMIN") redirect("/admin");

  return (
    <DashboardShell
      role="patient"
      userFullName={profile?.fullName ?? user.email ?? "مستخدم"}
      userEmail={user.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}

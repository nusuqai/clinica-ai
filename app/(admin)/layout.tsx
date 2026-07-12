import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/general/dashboard-shell";
import { getUnresolvedEscalationConversationIds } from "@/server/services/messages";

export default async function AdminLayout({
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

  if (profile?.role !== "ADMIN") redirect("/dashboard");

  const initialUnresolvedEscalationConversationIds =
    await getUnresolvedEscalationConversationIds();

  return (
    <DashboardShell
      role="admin"
      userFullName={profile?.fullName ?? user.email ?? "مسؤول"}
      userEmail={user.email ?? ""}
      initialUnresolvedEscalationConversationIds={
        initialUnresolvedEscalationConversationIds
      }
    >
      {children}
    </DashboardShell>
  );
}

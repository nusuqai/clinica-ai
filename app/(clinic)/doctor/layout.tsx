import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";
import ChatBubble from "@/components/chat/chat-bubble";
import { assistantOpenFor } from "@/server/services/staff/access";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const showAssistant = await assistantOpenFor(ctx.clinic.id, ctx.user.id);

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
      {/* Team assistant (#89) — only when it's open to this member. */}
      {showAssistant && <ChatBubble variant="staff" />}
    </DashboardShell>
  );
}

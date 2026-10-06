"use client";

import { ShieldAlert } from "lucide-react";
import AppSidebar, { type AiUnitsBadge } from "./sidebar";
import Topbar from "./topbar";
import { navConfig, roleMeta } from "./nav-config";
import ChatBubble from "@/components/chat/chat-bubble";
import EscalationProvider from "./escalation-provider";
import { SidebarProvider } from "@/components/ui/sidebar";

export type DashboardRole = "doctor" | "admin";

interface DashboardShellProps {
  children: React.ReactNode;
  role: DashboardRole;
  userFullName: string;
  userEmail: string;
  /** Admin only — conversation IDs with an unresolved escalation on load. */
  initialUnresolvedEscalationConversationIds?: string[];
  clinicId: string;
  /** The clinic this host belongs to — shown in the sidebar and topbar so a
      user who is a member of more than one clinic always knows where they are. */
  clinicName: string;
  clinicLogoUrl?: string | null;
  /** Admin only — the clinic's remaining AI units, shown in the sidebar. */
  aiUnits?: AiUnitsBadge | null;
  /** True when the viewer is a platform admin acting inside a clinic they are
      not a member of. Surfaced as a banner so destructive edits to someone
      else's clinic are never made unknowingly. */
  viaPlatformAdmin?: boolean;
}

export default function DashboardShell({
  children,
  role,
  userFullName,
  userEmail,
  clinicId,
  clinicName,
  clinicLogoUrl = null,
  aiUnits = null,
  viaPlatformAdmin = false,
  initialUnresolvedEscalationConversationIds = [],
}: DashboardShellProps) {
  // Each clinic is served from its own subdomain, so the nav config's hrefs
  // ("/admin", "/dashboard", "/" …) are already correct as-is — no clinic
  // prefix to apply.
  const navItems = navConfig[role];
  const { label: roleLabel, pageTitle } = roleMeta[role];

  const shell = (
    // SidebarProvider owns the sidebar state: expanded/collapsed rail on desktop
    // (Ctrl/⌘+B toggles it), the off-canvas Sheet on mobile.
    <SidebarProvider className="h-screen overflow-hidden bg-background">
      <AppSidebar
        navItems={navItems}
        roleLabel={roleLabel}
        userFullName={userFullName}
        userEmail={userEmail}
        clinicName={clinicName}
        clinicLogoUrl={clinicLogoUrl}
        aiUnits={aiUnits}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Above the topbar and outside the scroll container, so it stays put on
            every page rather than scrolling away with the content. */}
        {viaPlatformAdmin && (
          <div
            role="status"
            className="flex flex-shrink-0 items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center font-sans text-xs font-medium text-amber-950"
          >
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>
              أنت تتصفّح <strong className="font-bold">{clinicName}</strong> كمسؤول منصّة — لست
              عضواً في هذه العيادة، وأي تعديل هنا يؤثّر على بياناتها.
            </span>
          </div>
        )}

        <Topbar title={pageTitle} clinicName={clinicName} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {/* AI assistant — for patients & doctors only; hidden on the admin side
          (admins manage conversations from the Messages inbox instead). */}
      {role !== "admin" && <ChatBubble />}
    </SidebarProvider>
  );

  if (role !== "admin") return shell;

  return (
    <EscalationProvider
      initialConversationIds={initialUnresolvedEscalationConversationIds}
      clinicId={clinicId}
    >
      {shell}
    </EscalationProvider>
  );
}

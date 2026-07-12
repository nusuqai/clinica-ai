"use client";

import { useState } from "react";
import Sidebar from "./sidebar";
import Topbar from "./topbar";
import { navConfig, roleMeta } from "./nav-config";
import ChatBubble from "@/components/chat/chat-bubble";
import EscalationProvider from "./escalation-provider";

export type DashboardRole = "patient" | "doctor" | "admin";

interface DashboardShellProps {
  children: React.ReactNode;
  role: DashboardRole;
  userFullName: string;
  userEmail: string;
  /** Admin only — conversation IDs with an unresolved escalation on load. */
  initialUnresolvedEscalationConversationIds?: string[];
}

export default function DashboardShell({
  children,
  role,
  userFullName,
  userEmail,
  initialUnresolvedEscalationConversationIds = [],
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = navConfig[role];
  const { label: roleLabel, pageTitle } = roleMeta[role];

  const shell = (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        navItems={navItems}
        roleLabel={roleLabel}
        userFullName={userFullName}
        userEmail={userEmail}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar title={pageTitle} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {/* AI assistant — available to every role */}
      <ChatBubble />
    </div>
  );

  if (role !== "admin") return shell;

  return (
    <EscalationProvider
      initialConversationIds={initialUnresolvedEscalationConversationIds}
    >
      {shell}
    </EscalationProvider>
  );
}

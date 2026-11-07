import { Suspense } from "react";
import { can, requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import ChatInbox from "@/components/admin/chat-inbox";
import {
  getConversations,
  getConversationDetail,
  getMessages,
  markConversationRead,
} from "@/server/services/messages";
import {
  acknowledgeAssignment,
  listInboxTeammates,
  listInternalNotes,
  listMyLabels,
} from "@/server/services/inbox";
import { listTeamMembers } from "@/server/services/team";
import { aiAgentNames } from "@/server/services/aiAgents";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{
    id?: string;
    q?: string;
    channel?: string;
    show?: string;
    label?: string;
  }>;
}

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const { id: rawId, q, channel, show, label } = await searchParams;
  // The `id` query param is user-controlled (URL bar, bookmarks, stale
  // links) — never pass it to Prisma unvalidated.
  const id = rawId && UUID_RE.test(rawId) ? rawId : undefined;

  const ctx = await requirePermission("messages");
  const { clinic, user } = ctx;

  // Opening a conversation acknowledges the viewer's "assigned to you" alert —
  // before the reads below, so the list/counter already reflect it.
  if (id) await acknowledgeAssignment(id, user.id).catch(() => {});

  const [conversations, selectedConversation, team, agentNames, labels, teammates] =
    await Promise.all([
      getConversations(clinic.id, { query: q, channel, show, label }, user.id),
      id ? getConversationDetail(id, clinic.id, user.id) : Promise.resolve(null),
      listTeamMembers(clinic.id),
      aiAgentNames(clinic.id),
      listMyLabels(clinic.id, user.id),
      listInboxTeammates(clinic.id),
    ]);
  // Only read the thread once the conversation is confirmed to be this clinic's.
  const [messages, internalNotes] = selectedConversation
    ? await Promise.all([
        getMessages(selectedConversation.id, user.id),
        listInternalNotes(selectedConversation.id),
      ])
    : [[], []];

  // id → name for the team, so a colleague's reply arriving over realtime (a
  // bare row with only senderId) can still be labelled with who sent it.
  const staffNames = Object.fromEntries(team.map((m) => [m.id, m.fullName]));

  // Mark messages as read when admin opens a conversation
  if (selectedConversation) {
    await markConversationRead(selectedConversation.id);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile: the inbox is full-screen, WhatsApp-style — no page title. */}
      <div className="hidden md:block">
        <PageHeader title="الرسائل" subtitle="إدارة محادثات المرضى عبر واتساب والويب" />
      </div>
      <Suspense>
        <ChatInbox
          conversations={conversations}
          selectedConversation={selectedConversation}
          messages={messages}
          internalNotes={internalNotes}
          clinicId={clinic.id}
          currentUserId={user.id}
          currentUserName={user.profile.fullName}
          staffNames={staffNames}
          agentNames={agentNames}
          canOpenPatientProfile={can(ctx, "patients")}
          labels={labels}
          teammates={teammates}
          requestedId={id ?? null}
        />
      </Suspense>
    </div>
  );
}

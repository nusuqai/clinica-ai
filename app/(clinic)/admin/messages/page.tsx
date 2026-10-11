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
import { listTeamMembers } from "@/server/services/team";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{ id?: string; q?: string; channel?: string; show?: string }>;
}

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const { id: rawId, q, channel, show } = await searchParams;
  // The `id` query param is user-controlled (URL bar, bookmarks, stale
  // links) — never pass it to Prisma unvalidated.
  const id = rawId && UUID_RE.test(rawId) ? rawId : undefined;

  const ctx = await requirePermission("messages");
  const { clinic, user } = ctx;
  const [conversations, selectedConversation, team] = await Promise.all([
    getConversations(clinic.id, { query: q, channel, show }),
    id ? getConversationDetail(id, clinic.id) : Promise.resolve(null),
    listTeamMembers(clinic.id),
  ]);
  // Only read the thread once the conversation is confirmed to be this clinic's.
  const messages = selectedConversation ? await getMessages(selectedConversation.id) : [];

  // id → name for the team, so a colleague's reply arriving over realtime (a
  // bare row with only senderId) can still be labelled with who sent it.
  const staffNames = Object.fromEntries(team.map((m) => [m.id, m.fullName]));

  // Mark messages as read when admin opens a conversation
  if (selectedConversation) {
    await markConversationRead(selectedConversation.id);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="الرسائل" subtitle="إدارة محادثات المرضى عبر واتساب والويب" />
      <Suspense>
        <ChatInbox
          conversations={conversations}
          selectedConversation={selectedConversation}
          messages={messages}
          clinicId={clinic.id}
          currentUserName={user.profile.fullName}
          staffNames={staffNames}
          canOpenPatientProfile={can(ctx, "patients")}
        />
      </Suspense>
    </div>
  );
}

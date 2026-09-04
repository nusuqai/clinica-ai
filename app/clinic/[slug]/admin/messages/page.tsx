import { Suspense } from "react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import ChatInbox from "@/components/admin/chat-inbox";
import {
  getConversations,
  getConversationDetail,
  getMessages,
  markConversationRead,
} from "@/server/services/messages";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<{ id?: string; page: number }>;
}

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const { id: rawId } = await searchParams;
  const id = rawId && UUID_RE.test(rawId) ? rawId : undefined;

  const { clinic } = await requireActiveMember(["ADMIN"]);
  const [conversationsPage, selectedConversation, messagesPage] = await Promise.all([
    getConversations(clinic.id, { limit: 30 }),
    id ? getConversationDetail(id, clinic.id) : Promise.resolve(null),
    id ? getMessages(id, { limit: 10 }) : Promise.resolve({ messages: [], nextCursor: null }),
  ]);

  return (
    <ChatInbox
      conversations={conversationsPage.conversations}
      initialConversationsCursor={conversationsPage.nextCursor}
      selectedConversation={selectedConversation}
      messages={messagesPage.messages}
      initialCursor={messagesPage.nextCursor}
      basePath={`/clinic/${clinic.slug}`}
      clinicId={clinic.id}
    />
  );
}
import { Suspense } from "react";
import PageHeader from "@/components/admin/page-header";
import ChatInbox from "@/components/admin/chat-inbox";
import {
  getConversations,
  getConversationDetail,
  getMessages,
  markConversationRead,
} from "@/server/services/messages";

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  const [conversations, selectedConversation, messages] = await Promise.all([
    getConversations(),
    id ? getConversationDetail(id) : Promise.resolve(null),
    id ? getMessages(id) : Promise.resolve([]),
  ]);

  // Mark messages as read when admin opens a conversation
  if (id) {
    await markConversationRead(id);
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="الرسائل" subtitle="إدارة محادثات المرضى عبر واتساب والويب" />
      <Suspense>
        <ChatInbox
          conversations={conversations}
          selectedConversation={selectedConversation}
          messages={messages}
        />
      </Suspense>
    </div>
  );
}

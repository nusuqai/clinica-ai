"use client";

import {
  useState,
  useEffect,
  useRef,
  useTransition,
  useCallback,
  Fragment,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  Send,
  Phone,
  Smartphone,
  Globe,
  Loader2,
  Inbox,
} from "lucide-react";
import { sendAdminReply } from "@/server/actions/messages";
import {
  useRealtimeMessages,
  useRealtimeConversations,
} from "@/hooks/use-realtime-messages";
import type {
  ConversationSummary,
  MessageItem,
  ConversationDetail,
} from "@/server/services/messages";

interface ChatInboxProps {
  conversations: ConversationSummary[];
  selectedConversation: ConversationDetail | null;
  messages: MessageItem[];
}

export default function ChatInbox({
  conversations: initialConversations,
  selectedConversation: initialConversation,
  messages: initialMessages,
}: ChatInboxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedConversation, setSelectedConversation] =
    useState(initialConversation);
  const [reply, setReply] = useState("");
  const [sending, startSending] = useTransition();
  const [listPending, startListTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync when server re-renders with fresh data
  useEffect(
    () => setConversations(initialConversations),
    [initialConversations],
  );
  useEffect(() => setMessages(initialMessages), [initialMessages]);
  useEffect(
    () => setSelectedConversation(initialConversation),
    [initialConversation],
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshConversations = useCallback(() => {
    startListTransition(() => router.refresh());
  }, [router]);

  const refreshMessages = useCallback(() => {
    router.refresh();
  }, [router]);

  useRealtimeConversations(refreshConversations);
  useRealtimeMessages(activeId, refreshMessages);

  const handleSelectConversation = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    router.push(`/admin/messages?${params.toString()}`);
  };

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !activeId) return;
    setReply("");
    startSending(async () => {
      await sendAdminReply(activeId, text);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] bg-card border border-border rounded-2xl overflow-hidden">
      {/* ── Left pane: conversations list ── */}
      <aside className="w-72 flex-shrink-0 border-e border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-heading font-semibold text-sm text-foreground">
            المحادثات
          </h2>
          {listPending && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-border">
          {conversations.length === 0 && (
            <li className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Inbox className="w-8 h-8 opacity-40" />
              <p className="text-xs font-sans">لا توجد محادثات بعد</p>
            </li>
          )}
          {conversations.map((conv) => (
            <li key={conv.id}>
              <button
                onClick={() => handleSelectConversation(conv.id)}
                className={[
                  "w-full text-start px-4 py-3 hover:bg-muted/50 transition-colors",
                  activeId === conv.id
                    ? "bg-accent/8 border-e-2 border-accent"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground font-sans truncate max-w-[140px]">
                    {conv.contactName}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conv.unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center font-sans">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                    {conv.channel === "WHATSAPP" ? (
                      <Smartphone className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-accent" />
                    )}
                  </div>
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-muted-foreground font-sans truncate">
                    {conv.lastMessage}
                  </p>
                )}
                {conv.lastMessageAt && (
                  <p
                    className="text-[10px] text-muted-foreground/60 font-sans mt-0.5"
                    dir="rtl"
                  >
                    {formatDistanceToNow(new Date(conv.lastMessageAt), {
                      addSuffix: true,
                      locale: ar,
                    })}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Right pane: message thread ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {!selectedConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm font-sans">اختر محادثة لعرض الرسائل</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-accent font-sans">
                  {selectedConversation.contactName.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground font-sans">
                  {selectedConversation.contactName}
                </p>
                {selectedConversation.contactPhone && (
                  <p
                    className="text-xs text-muted-foreground font-sans flex items-center gap-1"
                    dir="ltr"
                  >
                    <Phone className="w-3 h-3" />
                    {selectedConversation.contactPhone}
                  </p>
                )}
              </div>
              <div className="ms-auto">
                {selectedConversation.channel === "WHATSAPP" ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-sans">
                    <Smartphone className="w-3 h-3" />
                    واتساب
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-sans">
                    <Globe className="w-3 h-3" />
                    ويب
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-xs text-muted-foreground font-sans py-8">
                  لا توجد رسائل في هذه المحادثة
                </p>
              )}
              {messages.map((msg, idx) => {
                const prev = messages[idx - 1];
                const showDivider =
                  !!msg.sessionId && msg.sessionId !== prev?.sessionId;
                const isOutgoing =
                  msg.senderType === "ADMIN" || msg.senderType === "AGENT";
                const isAgent = msg.senderType === "AGENT";
                return (
                  <Fragment key={msg.id}>
                    {showDivider && (
                      <div className="flex items-center gap-2 py-1" dir="rtl">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground font-sans whitespace-nowrap">
                          جلسة جديدة ·{" "}
                          {new Date(msg.createdAt).toLocaleString("ar-EG", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div
                      className={[
                        "flex",
                        isOutgoing ? "justify-start" : "justify-end",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "max-w-[70%] px-3.5 py-2 rounded-2xl text-sm font-sans leading-relaxed",
                          isAgent
                            ? "bg-accent/10 text-foreground rounded-ss-sm border border-accent/20"
                            : isOutgoing
                              ? "bg-muted text-foreground rounded-ss-sm"
                              : "bg-primary text-white rounded-se-sm",
                        ].join(" ")}
                      >
                        {isAgent && (
                          <p className="text-[10px] font-medium text-accent mb-0.5">
                            🤖 المساعد الذكي
                          </p>
                        )}
                        {isAgent ? (
                          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                        <p
                          className={[
                            "text-[10px] mt-1",
                            isOutgoing
                              ? "text-muted-foreground"
                              : "text-white/60",
                          ].join(" ")}
                          dir="ltr"
                        >
                          {new Date(msg.createdAt).toLocaleTimeString("ar-EG", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="اكتب ردك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
                  rows={2}
                  disabled={sending}
                  className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 leading-relaxed"
                  dir="rtl"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !reply.trim()}
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

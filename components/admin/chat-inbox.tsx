"use client";

import {
  useState,
  useEffect,
  useMemo,
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
  Globe,
  Loader2,
  Inbox,
  Bot,
  BotOff,
  AlertTriangle,
  Clock,
  FileText,
  RotateCw,
  UserRound,
  ExternalLink,
} from "lucide-react";
import { WhatsappIcon } from "@/components/icons/whatsapp-icon";
import WhatsappTemplatePicker from "@/components/admin/whatsapp-template-picker";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import {
  sendAdminReply,
  retryWhatsappDelivery,
  setSessionAiEnabled,
  type SendAdminReplyResult,
} from "@/server/actions/messages";
import {
  useRealtimeMessages,
  useRealtimeConversations,
  RealtimeMessageRow,
} from "@/hooks/use-realtime-messages";
import { useEscalationAlerts } from "@/components/general/escalation-provider";
import { Channel, SenderType } from "@prisma/client";
import type {
  ConversationSummary,
  MessageItem,
  ConversationDetail,
} from "@/server/services/messages";

interface ChatInboxProps {
  conversations: ConversationSummary[];
  selectedConversation: ConversationDetail | null;
  messages: MessageItem[];
  /** This clinic's URL prefix, e.g. `/clinic/sunrise-dental`. */
  basePath: string;
}

/**
 * `sending` → in flight. `sent` → persisted and delivered, kept only until the
 * server row arrives. `failed_sync` → nothing was written to the database.
 * `failed_whatsapp` → the row exists but WhatsApp delivery failed.
 */
type PendingStatus = "sending" | "sent" | "failed_sync" | "failed_whatsapp";

/** An admin reply rendered optimistically, before/independently of the server
 *  round-trip. Client-side only — these do not survive a reload. */
interface PendingMessage {
  clientId: string;
  conversationId: string;
  content: string;
  createdAt: Date;
  status: PendingStatus;
  /** Set once the message row exists; lets it replace the server bubble. */
  serverId?: string;
}

interface RenderedMessage {
  key: string;
  content: string;
  senderType: MessageItem["senderType"];
  sessionId: string | null;
  createdAt: Date;
  pending?: PendingMessage;
}

export default function ChatInbox({
  conversations: initialConversations,
  selectedConversation: initialConversation,
  messages: initialMessages,
  basePath,
}: ChatInboxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedConversation, setSelectedConversation] =
    useState(initialConversation);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [listPending, startListTransition] = useTransition();
  const [aiTogglePending, startAiToggle] = useTransition();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // Ticks so the 24-hour-window gate re-evaluates as time passes without a
  // reload — the window can lapse while the admin sits on a thread.
  const [nowTs, setNowTs] = useState(() => Date.now());
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

  // An optimistic bubble is retired once its real row shows up in the server
  // props. Failed and in-flight ones stay put — they're the only record of the
  // message the admin typed.
  useEffect(() => {
    const serverIds = new Set(initialMessages.map((m) => m.id));
    setPending((prev) => {
      const next = prev.filter(
        (p) =>
          !(p.status === "sent" && p.serverId && serverIds.has(p.serverId)),
      );
      return next.length === prev.length ? prev : next;
    });
  }, [initialMessages]);

  // Keep the window gate live: re-evaluate every 30s so the reply box flips to
  // "template only" the moment the 24-hour window lapses.
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Server rows plus this thread's optimistic bubbles. A pending entry that
  // already has a row hides that row, so a message that failed to reach
  // WhatsApp renders once — from pending state, carrying its badge.
  const threadMessages = useMemo<RenderedMessage[]>(() => {
    const mine = pending.filter((p) => p.conversationId === activeId);
    const superseded = new Set(
      mine.map((p) => p.serverId).filter((id): id is string => !!id),
    );
    return [
      ...messages
        .filter((m) => !superseded.has(m.id))
        .map((m) => ({
          key: m.id,
          content: m.content,
          senderType: m.senderType,
          sessionId: m.sessionId,
          createdAt: m.createdAt,
        })),
      // Always newest, so appending keeps the createdAt-ascending order.
      ...mine.map((p) => ({
        key: p.clientId,
        content: p.content,
        senderType: SenderType.ADMIN,
        // No session, so the "new session" divider never splits on these.
        sessionId: null,
        createdAt: p.createdAt,
        pending: p,
      })),
    ];
  }, [messages, pending, activeId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const refreshConversations = useCallback(() => {
    startListTransition(() => router.refresh());
  }, [router]);

  useRealtimeConversations(refreshConversations);
  useRealtimeMessages(activeId, () => {
    router.refresh();
  });

  // EscalationProvider owns the single realtime subscription for escalations
  // (a second subscribed channel with the same name crashes the realtime
  // client) — react to its event counter instead of subscribing again here.
  // Escalations don't always come with a new message (e.g. resolving one by
  // re-enabling the AI doesn't), so they need their own refresh trigger.
  const { eventTick } = useEscalationAlerts();
  const isFirstEventTick = useRef(true);
  useEffect(() => {
    if (isFirstEventTick.current) {
      isFirstEventTick.current = false;
      return;
    }
    refreshConversations();
  }, [eventTick, refreshConversations]);

  const handleSelectConversation = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    router.push(`${basePath}/admin/messages?${params.toString()}`);
  };

  const isWhatsapp = selectedConversation?.channel === Channel.WHATSAPP;
  // Outside the 24-hour window WhatsApp refuses free-form text; the admin must
  // send an approved template instead. `nowTs` is read so this recomputes on
  // each tick. Web conversations are never gated.
  void nowTs;
  const isOutsideWindow =
    isWhatsapp && !isWithinWhatsappWindow(selectedConversation?.lastInboundAt);

  const patchPending = useCallback(
    (clientId: string, patch: Partial<PendingMessage>) => {
      setPending((prev) =>
        prev.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)),
      );
    },
    [],
  );

  /** Runs the full send (creates the row + delivers) and reflects the outcome
   *  on the bubble. Used for the first attempt and for retrying a sync failure,
   *  where no row exists yet. */
  const deliver = useCallback(
    async (clientId: string, conversationId: string, text: string) => {
      let result: SendAdminReplyResult;
      try {
        result = await sendAdminReply(conversationId, text);
      } catch (err) {
        // Network error, or the action itself blew up.
        console.error("Failed to send admin reply:", err);
        patchPending(clientId, { status: "failed_sync" });
        return;
      }
      if (!result.ok) {
        patchPending(clientId, { status: "failed_sync" });
        return;
      }
      patchPending(clientId, {
        serverId: result.messageId,
        status: result.whatsappSendFailed ? "failed_whatsapp" : "sent",
      });
      router.refresh();
    },
    [patchPending, router],
  );

  const handleSend = () => {
    const text = reply.trim();
    if (!text || !activeId || isOutsideWindow) return;
    // Safe to clear: the text now lives in the bubble, and stays there if the
    // send fails.
    setReply("");
    const clientId = crypto.randomUUID();
    setPending((prev) => [
      ...prev,
      {
        clientId,
        conversationId: activeId,
        content: text,
        createdAt: new Date(),
        status: "sending",
      },
    ]);
    void deliver(clientId, activeId, text);
  };

  // A template send is already persisted server-side; show it immediately as a
  // "sent" bubble (retired once the server row arrives), like a normal reply.
  const handleTemplateSent = (msg: {
    messageId: string;
    createdAt: string;
    content: string;
  }) => {
    if (!activeId) return;
    setPending((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        conversationId: activeId,
        content: msg.content,
        createdAt: new Date(msg.createdAt),
        status: "sent",
        serverId: msg.messageId,
      },
    ]);
    router.refresh();
  };

  const handleRetry = (clientId: string) => {
    const entry = pending.find((p) => p.clientId === clientId);
    if (!entry || entry.status === "sending" || entry.status === "sent") return;
    patchPending(clientId, { status: "sending" });

    // The row already exists — re-deliver it instead of writing a duplicate.
    if (entry.status === "failed_whatsapp" && entry.serverId) {
      const serverId = entry.serverId;
      void (async () => {
        try {
          const result = await retryWhatsappDelivery(serverId);
          patchPending(clientId, {
            status: result.ok ? "sent" : "failed_whatsapp",
          });
          if (result.ok) router.refresh();
        } catch (err) {
          console.error("Failed to retry WhatsApp delivery:", err);
          patchPending(clientId, { status: "failed_whatsapp" });
        }
      })();
      return;
    }

    void deliver(clientId, entry.conversationId, entry.content);
  };

  const handleToggleAi = () => {
    if (!selectedConversation?.activeSessionId) return;
    const sessionId = selectedConversation.activeSessionId;
    const next = !selectedConversation.aiEnabled;
    setSelectedConversation((prev) =>
      prev ? { ...prev, aiEnabled: next } : prev,
    );
    startAiToggle(async () => {
      await setSessionAiEnabled(sessionId, next);
      router.refresh();
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
                  conv.hasUnresolvedEscalation ? "bg-red-50" : "",
                  activeId === conv.id
                    ? "bg-accent/8 border-e-2 border-accent"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground font-sans truncate max-w-[140px] flex items-center gap-1.5">
                    {conv.hasUnresolvedEscalation && (
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-red-500 flex-shrink-0"
                        aria-label="طلب تصعيد غير محلول"
                      />
                    )}
                    <span className="truncate">{conv.contactName}</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conv.unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center font-sans">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                    {conv.channel === Channel.WHATSAPP ? (
                      <WhatsappIcon className="w-3.5 h-3.5 text-green-500" />
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
              <div className="ms-auto flex items-center gap-2">
                {selectedConversation.userId ? (
                  <a
                    href={`${basePath}/admin/users/${selectedConversation.userId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-sans bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="فتح ملف العميل في تبويب جديد"
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    ملف العميل
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-sans bg-muted text-muted-foreground/60 cursor-not-allowed"
                    title="لا يوجد حساب مرتبط بعد — سيظهر الملف بعد تسجيل العميل"
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    ملف العميل
                  </span>
                )}
                {selectedConversation.escalations.length > 0 &&
                  (() => {
                    const unresolved = selectedConversation.escalations.filter(
                      (e) => !e.resolvedAt,
                    );
                    const isUnresolved = unresolved.length > 0;
                    const shown = isUnresolved
                      ? unresolved
                      : selectedConversation.escalations;
                    return (
                      <span
                        className={[
                          "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-sans",
                          isUnresolved
                            ? "bg-red-100 text-red-700"
                            : "text-muted-foreground",
                        ].join(" ")}
                        title={shown
                          .map((e) => e.reason ?? "بدون سبب")
                          .join(" · ")}
                      >
                        {isUnresolved && <AlertTriangle className="w-3 h-3" />}
                        {isUnresolved
                          ? `${unresolved.length} طلب تصعيد بانتظار الرد`
                          : `${selectedConversation.escalations.length} طلب تصعيد (تم الرد)`}
                      </span>
                    );
                  })()}
                {selectedConversation.activeSessionId && (
                  <button
                    onClick={handleToggleAi}
                    disabled={aiTogglePending}
                    className={[
                      "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-sans transition-colors disabled:opacity-50",
                      selectedConversation.aiEnabled
                        ? "bg-accent/10 text-accent"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                    title="تفعيل/إيقاف رد المساعد الذكي لهذه الجلسة"
                  >
                    {selectedConversation.aiEnabled ? (
                      <Bot className="w-3.5 h-3.5" />
                    ) : (
                      <BotOff className="w-3.5 h-3.5" />
                    )}
                    {selectedConversation.aiEnabled
                      ? "الذكاء مفعّل"
                      : "الذكاء متوقف"}
                  </button>
                )}
                {selectedConversation.channel === Channel.WHATSAPP ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-sans">
                    <WhatsappIcon className="w-3 h-3" />
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
              {threadMessages.length === 0 && (
                <p className="text-center text-xs text-muted-foreground font-sans py-8">
                  لا توجد رسائل في هذه المحادثة
                </p>
              )}
              {threadMessages.map((msg, idx) => {
                const prev = threadMessages[idx - 1];
                const showDivider =
                  !!msg.sessionId && msg.sessionId !== prev?.sessionId;
                const isOutgoing =
                  msg.senderType === SenderType.ADMIN || msg.senderType === SenderType.AGENT;
                const isAgent = msg.senderType === SenderType.AGENT;
                const status = msg.pending?.status;
                const isFailed =
                  status === "failed_sync" || status === "failed_whatsapp";
                return (
                  <Fragment key={msg.key}>
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
                          "max-w-[70%] px-3.5 py-2 rounded-2xl text-sm font-sans leading-relaxed transition-opacity",
                          isAgent
                            ? "bg-accent/10 text-foreground rounded-ss-sm border border-accent/20"
                            : isOutgoing
                              ? isFailed
                                ? "bg-red-50 border border-red-200 text-foreground rounded-ss-sm"
                                : "bg-muted text-foreground rounded-ss-sm"
                              : "bg-primary text-white rounded-se-sm",
                          status === "sending" ? "opacity-50" : "",
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
                        {status === "sending" ? (
                          <p className="text-[10px] mt-1 flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            جارٍ الإرسال...
                          </p>
                        ) : isFailed ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-red-700">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span>
                              {status === "failed_whatsapp"
                                ? "تم الحفظ لكن لم تصل إلى واتساب"
                                : "لم يتم حفظ الرسالة"}
                            </span>
                            <button
                              onClick={() =>
                                handleRetry(msg.pending!.clientId)
                              }
                              className="inline-flex items-center gap-1 font-medium underline hover:no-underline"
                            >
                              <RotateCw className="w-3 h-3" />
                              إعادة المحاولة
                            </button>
                          </div>
                        ) : (
                          <p
                            className={[
                              "text-[10px] mt-1",
                              isOutgoing
                                ? "text-muted-foreground"
                                : "text-white/60",
                            ].join(" ")}
                            dir="ltr"
                          >
                            {new Date(msg.createdAt).toLocaleTimeString(
                              "ar-EG",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              {isOutsideWindow ? (
                // Outside the 24-hour window WhatsApp refuses free-form text —
                // only an approved template can reach the contact.
                <div className="flex flex-col gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800 font-sans">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      انتهت نافذة الـ24 ساعة منذ آخر رسالة من العميل. لا يمكن إرسال
                      رسالة نصية حرة — أرسل قالبًا معتمدًا من ميتا بدلاً من ذلك.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTemplatePicker(true)}
                    className="self-start inline-flex items-center gap-1.5 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    إرسال قالب معتمد
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="اكتب ردك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 leading-relaxed"
                    dir="rtl"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim()}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showTemplatePicker && selectedConversation && (
        <WhatsappTemplatePicker
          conversationId={selectedConversation.id}
          onClose={() => setShowTemplatePicker(false)}
          onSent={handleTemplateSent}
        />
      )}
    </div>
  );
}

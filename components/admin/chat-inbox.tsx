"use client";

import { useState, useEffect, useMemo, useRef, useTransition, useCallback, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Clock,
  FileText,
  Paperclip,
  X,
  Reply,
  Lock,
  MessageCircle,
} from "lucide-react";
import WhatsappTemplatePicker from "@/components/admin/whatsapp-template-picker";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  sendAdminReply,
  sendAdminMediaReply,
  sendAdminVoiceReply,
  sendQuickReply,
  createStaffMediaUpload,
  retryWhatsappDelivery,
  resolveMessageEscalation,
  setSessionAiEnabled,
  type SendAdminReplyResult,
} from "@/server/actions/messages";
import {
  addInternalNote,
  assignConversation,
  deleteInternalNote,
  deleteMessageNote,
  setConversationPinned,
} from "@/server/actions/inbox";
import {
  useRealtimeConversations,
  useRealtimeInternalNotes,
  parseDbTimestamp,
  RealtimeMessageRow,
} from "@/hooks/use-realtime-messages";
import { useEscalationAlerts } from "@/components/general/escalation-provider";
import { Channel, SenderType } from "@prisma/client";
import type {
  ConversationSummary,
  MessageItem,
  MessageReplyPreview,
  ConversationDetail,
} from "@/server/services/messages";
import type {
  InboxLabelItem,
  InboxTeammate,
  InternalNoteItem,
  QuickReplyItem,
  ReminderItem,
} from "@/server/services/inbox";
import {
  fetchConversations,
  fetchConversationDetail,
  fetchMessages,
} from "@/server/actions/conversations";
import type { AgentMessageMetadata } from "@/agent/types";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ConversationList } from "@/components/admin/inbox/conversation-list";
import { ThreadHeader, type ThreadDialog } from "@/components/admin/inbox/thread-header";
import type { ConversationMenuDialog } from "@/components/admin/inbox/conversation-menu";
import { MessageBubble, InternalNoteBubble } from "@/components/admin/inbox/message-bubble";
import { LabelsDialog } from "@/components/admin/inbox/labels-dialog";
import { ReminderDialog } from "@/components/admin/inbox/reminder-dialog";
import { EscalateDialog } from "@/components/admin/inbox/escalate-dialog";
import { MessageNoteDialog } from "@/components/admin/inbox/message-note-dialog";
import { QuickRepliesPanel, quickReplyFile } from "@/components/admin/inbox/quick-replies";
import { VoiceRecorder } from "@/components/admin/inbox/voice-recorder";
import {
  clientMediaKind,
  toReplyPreview,
  quoteAuthor,
  type PendingMedia,
  type PendingMessage,
  type Quotable,
  type RenderedMessage,
  type RenderedInternalNote,
  type TimelineItem,
} from "@/components/admin/inbox/types";

interface ChatInboxProps {
  conversations: ConversationSummary[];
  selectedConversation: ConversationDetail | null;
  messages: MessageItem[];
  /** Staff-only internal notes of the selected conversation. */
  internalNotes: InternalNoteItem[];
  clinicId: string;
  /** The signed-in team member. */
  currentUserId: string;
  /** The signed-in team member's name — labels their own optimistic replies. */
  currentUserName: string;
  /** Team member id → name, to label a colleague's reply arriving over realtime. */
  staffNames: Record<string, string>;
  /** id → name of the clinic's AI employees, to label live AGENT replies. */
  agentNames: Record<string, string>;
  /** Holds "patients": show the link to the contact's patient profile. Without
   *  it the inbox still shows the contact's name and phone, just not the link. */
  canOpenPatientProfile: boolean;
  /** The viewer's personal labels. */
  labels: InboxLabelItem[];
  /** Teammates a conversation can be assigned / escalated to. */
  teammates: InboxTeammate[];
  /** The conversation id the server rendered for (null = none) — tells a
   *  still-loading thread apart from one that doesn't exist. */
  requestedId: string | null;
}

/** Reads an image file's pixel dimensions in the browser (null if not an image
 *  or it can't be decoded), so the sent bubble reserves exact space. */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

type ComposerMode = "reply" | "internal";

function ThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex-1 space-y-3 px-5 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
            <Skeleton className={`h-10 rounded-2xl ${i % 2 ? "w-1/3" : "w-1/2"}`} />
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-3">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function ChatInbox({
  conversations: initialConversations,
  selectedConversation: initialConversation,
  messages: initialMessages,
  internalNotes: initialInternalNotes,
  clinicId,
  currentUserId,
  currentUserName,
  staffNames,
  agentNames,
  canOpenPatientProfile,
  labels: initialLabels,
  teammates,
  requestedId,
}: ChatInboxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  // List filters live in the URL; realtime refreshes reuse them.
  const filterQuery = searchParams.get("q") ?? "";
  const filterChannel = searchParams.get("channel") ?? "";
  const filterShow = searchParams.get("show") ?? "";
  const filterLabel = searchParams.get("label") ?? "";

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [internalNotes, setInternalNotes] = useState(initialInternalNotes);
  const [selectedConversation, setSelectedConversation] = useState(initialConversation);
  const [labels, setLabels] = useState(initialLabels);
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [pendingNotes, setPendingNotes] = useState<RenderedInternalNote[]>([]);
  const [listPending, startListTransition] = useTransition();
  const [aiTogglePending, startAiToggle] = useTransition();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // A file the admin picked to attach, staged before send (the textarea becomes
  // its optional caption).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // One preview URL per staged image, revoked when it's replaced or cleared.
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFile?.type.startsWith("image/")) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Escalation ids being resolved (optimistically hidden while the call runs).
  const [resolvedEscalations, setResolvedEscalations] = useState<Set<string>>(new Set());
  // Ticks so the 24-hour-window gate re-evaluates as time passes without a
  // reload — the window can lapse while the admin sits on a thread.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  // The reply box is uncontrolled: its text lives in the DOM (read via the ref)
  // so typing never re-renders this whole inbox. Only the empty ↔ non-empty
  // flip is state (it swaps the mic for the send button). Drafts are kept per
  // conversation so a half-typed reply never follows the admin to another
  // patient, and comes back when they return.
  const draftsRef = useRef(new Map<string, string>());
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [hasText, setHasText] = useState(false);
  const getReply = () => replyInputRef.current?.value ?? "";
  const setReplyText = useCallback((value: string) => {
    const el = replyInputRef.current;
    if (el) el.value = value;
    const id = activeIdRef.current;
    if (id) {
      if (value) draftsRef.current.set(id, value);
      else draftsRef.current.delete(id);
    }
    setHasText(value.trim().length > 0);
  }, []);
  // The box remounts (thread loading, 24h window flip, voice recording), so
  // restore the current conversation's draft whenever it attaches.
  const bindReplyInput = useCallback((el: HTMLTextAreaElement | null) => {
    replyInputRef.current = el;
    if (!el) return;
    const draft = draftsRef.current.get(activeIdRef.current ?? "") ?? "";
    el.value = draft;
    setHasText(draft.trim().length > 0);
  }, []);
  // The message the admin chose to answer (WhatsApp-style quoted reply); sent
  // with the next text/attachment, then cleared.
  const [replyingTo, setReplyingTo] = useState<MessageReplyPreview | null>(null);
  // Briefly ringed after jumping to it from a quote.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ThreadDialog>(null);
  // The message a note / colleague escalation is about (null = whole conversation).
  const [targetMessage, setTargetMessage] = useState<{ id: string; snippet: string } | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [recording, setRecording] = useState(false);
  // Set when the list pushed the thread — then "back" can pop history (so the
  // phone's own back button and ours agree). A deep link replaces instead.
  const cameFromListRef = useRef(false);

  const { eventTick, needsMeCount, refreshNeedsMe, refreshReminders } = useEscalationAlerts();

  // A quote / staged attachment belongs to its thread — drop on switch.
  useEffect(() => {
    setReplyingTo(null);
    setComposerMode("reply");
    setQuickOpen(false);
    // Swap in this conversation's draft (the box may stay mounted across a switch).
    if (replyInputRef.current) setReplyText(draftsRef.current.get(activeId ?? "") ?? "");
  }, [activeId, setReplyText]);

  const startReply = (msg: Quotable & { id: string }) => {
    setComposerMode("reply");
    setReplyingTo(toReplyPreview(msg));
    replyInputRef.current?.focus();
  };

  /** Scrolls to the quoted message and flashes it. A quote whose target isn't
   *  in the thread (deleted) just does nothing. */
  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1600);
  };

  // Client-side cache of conversation detail + messages, keyed by conversation
  // id. Lets switching back to an already-visited thread render instantly
  // instead of waiting on the server round-trip triggered by router.push.
  const conversationCache = useRef<
    Map<string, { detail: ConversationDetail; messages: MessageItem[]; notes: InternalNoteItem[] }>
  >(new Map());

  // Sync when the server re-renders with fresh data, and cache it for this id.
  useEffect(() => setConversations(initialConversations), [initialConversations]);
  useEffect(() => setLabels(initialLabels), [initialLabels]);
  useEffect(() => {
    setMessages(initialMessages);
    setInternalNotes(initialInternalNotes);
    setSelectedConversation(initialConversation);
    if (initialConversation) {
      conversationCache.current.set(initialConversation.id, {
        detail: initialConversation,
        messages: initialMessages,
        notes: initialInternalNotes,
      });
    }
  }, [initialConversation, initialMessages, initialInternalNotes]);

  // An optimistic bubble is retired once its real row shows up in the server
  // props. Failed and in-flight ones stay put — they're the only record of the
  // message the admin typed.
  useEffect(() => {
    const serverIds = new Set(initialMessages.map((m) => m.id));
    setPending((prev) => {
      const next = prev.filter(
        (p) => !(p.status === "sent" && p.serverId && serverIds.has(p.serverId))
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

  // Opening a conversation can acknowledge an assignment alert (server-side, in
  // the page render) — re-read the counter once we land on it.
  useEffect(() => {
    if (activeId) refreshNeedsMe();
  }, [activeId, refreshNeedsMe]);

  // The thread's server state belongs to `activeId` only once it has arrived.
  const threadReady = !!selectedConversation && selectedConversation.id === activeId;
  // The server already answered for this id and found nothing (stale link).
  const threadMissing =
    !!activeId &&
    (!/^[0-9a-f-]{36}$/i.test(activeId) || (requestedId === activeId && !initialConversation));
  const threadLoading = !!activeId && !threadReady && !threadMissing;

  // Colleague escalations that point at a specific message → "escalated to X".
  const escalatedToByMessage = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of selectedConversation?.staffAlerts ?? []) {
      if (a.kind === "ESCALATION" && a.messageId) {
        map.set(a.messageId, a.recipientId === currentUserId ? "أنت" : a.recipientName);
      }
    }
    return map;
  }, [selectedConversation, currentUserId]);

  // Server rows + internal notes (by time), then this thread's optimistic
  // bubbles. A pending entry that already has a row hides that row, so a
  // message that failed to reach WhatsApp renders once — from pending state.
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!threadReady) return [];
    const mine = pending.filter((p) => p.conversationId === activeId);
    const superseded = new Set(mine.map((p) => p.serverId).filter((id): id is string => !!id));
    const serverItems: TimelineItem[] = [
      ...messages
        .filter((m) => !superseded.has(m.id))
        .map((m): RenderedMessage => ({
          kind: "message",
          key: m.id,
          id: m.id,
          content: m.content,
          senderType: m.senderType,
          senderName: m.senderName,
          agentName: m.agentName,
          sessionId: m.sessionId,
          createdAt: m.createdAt,
          voice: m.voice,
          media: m.media,
          structured: m.structured,
          escalation: m.escalation,
          reaction: m.reaction,
          replyTo: m.replyTo,
          notes: m.notes,
        })),
      ...internalNotes.map((n): RenderedInternalNote => ({
        kind: "internal",
        key: `note-${n.id}`,
        id: n.id,
        content: n.content,
        authorId: n.authorId,
        authorName: n.authorName,
        createdAt: n.createdAt,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const optimistic: TimelineItem[] = [
      ...mine.map((p): RenderedMessage => ({
        kind: "message",
        key: p.clientId,
        id: undefined,
        content: p.content,
        senderType: SenderType.ADMIN,
        senderName: currentUserName,
        // No session, so the "new session" divider never splits on these.
        sessionId: null,
        createdAt: p.createdAt,
        pending: p,
        replyTo: p.replyTo,
        ...(p.voice ? { voiceLocalUrl: p.voice.localUrl } : {}),
        ...(p.media
          ? {
              media: {
                kind: p.media.kind,
                mimeType: p.media.mimeType,
                filename: p.media.filename,
                caption: p.media.caption,
                width: p.media.width,
                height: p.media.height,
              },
              mediaLocalUrl: p.media.localUrl,
            }
          : {}),
      })),
      ...pendingNotes.filter((n) => n.key.startsWith(`${activeId}:`)),
    ];
    return [...serverItems, ...optimistic];
  }, [threadReady, messages, internalNotes, pending, pendingNotes, activeId, currentUserName]);

  // Scroll to bottom when the thread changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  const refreshConversations = useCallback(() => {
    startListTransition(async () => {
      try {
        const fresh = await fetchConversations({
          query: filterQuery,
          channel: filterChannel,
          show: filterShow,
          label: filterLabel,
        });
        setConversations(fresh);
      } catch (err) {
        console.error("Failed to refresh conversations:", err);
      }
    });
  }, [filterQuery, filterChannel, filterShow, filterLabel]);

  /** Re-reads the open conversation (assignment, reminders, alerts, notes…). */
  const reloadThread = useCallback(
    async (opts: { messages?: boolean } = {}) => {
      if (!activeId) return;
      try {
        const [detail, msgs] = await Promise.all([
          fetchConversationDetail(activeId),
          opts.messages ? fetchMessages(activeId) : Promise.resolve(null),
        ]);
        if (detail)
          setSelectedConversation((cur) => (cur?.id === detail.id || !cur ? detail : cur));
        if (msgs) setMessages(msgs);
      } catch (err) {
        console.error("Failed to reload conversation:", err);
      }
    },
    [activeId]
  );

  /** A utility changed server state — refresh what depends on it. */
  const afterUtilityChange = useCallback(
    (opts: { messages?: boolean } = {}) => {
      void reloadThread(opts);
      refreshConversations();
      refreshNeedsMe();
    },
    [reloadThread, refreshConversations, refreshNeedsMe]
  );

  // ── List row ⋮ actions (no need to open the conversation) ──
  // Patches the row and, if it's open, the thread header too.
  const patchConversation = (
    id: string,
    patch: Partial<Pick<ConversationSummary, "pinned" | "assignedTo">>
  ) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setSelectedConversation((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  };

  const handleListTogglePin = (conv: ConversationSummary) => {
    const next = !conv.pinned;
    patchConversation(conv.id, { pinned: next });
    void setConversationPinned(conv.id, next).then((res) => {
      if (!res.ok) {
        patchConversation(conv.id, { pinned: !next });
        toast.error("تعذّر تثبيت المحادثة");
      }
      // The server owns the order (pins on top).
      refreshConversations();
    });
  };

  const handleListAssign = (conv: ConversationSummary, assigneeId: string | null) => {
    const previous = conv.assignedTo;
    const name =
      assigneeId === currentUserId
        ? currentUserName
        : (teammates.find((t) => t.id === assigneeId)?.fullName ?? "");
    patchConversation(conv.id, { assignedTo: assigneeId ? { id: assigneeId, name } : null });
    void assignConversation(conv.id, assigneeId).then((res) => {
      if (!res.ok) {
        patchConversation(conv.id, { assignedTo: previous });
        toast.error(res.error === "forbidden" ? "غير مسموح" : "تعذّر إسناد المحادثة");
      } else if (!assigneeId) {
        toast.success("تم إلغاء الإسناد");
      } else {
        toast.success(
          assigneeId === currentUserId
            ? "تم إسناد المحادثة إليك"
            : `تم الإسناد إلى ${name || "الزميل"}`
        );
      }
      refreshConversations();
      refreshNeedsMe();
    });
  };

  // A dialog opened from a list row's ⋮ (the conversation may not be open).
  const [listDialog, setListDialog] = useState<{
    conversationId: string;
    dialog: ConversationMenuDialog;
    reminders: ReminderItem[];
  } | null>(null);
  const listDialogConversation = listDialog
    ? conversations.find((c) => c.id === listDialog.conversationId)
    : undefined;

  // The row summary has no reminder list — load it for the reminder dialog.
  const loadListReminders = useCallback(async (conversationId: string) => {
    const detail = await fetchConversationDetail(conversationId).catch(() => null);
    setListDialog((prev) =>
      prev?.conversationId === conversationId
        ? { ...prev, reminders: detail?.reminders ?? [] }
        : prev
    );
  }, []);

  const handleListOpenDialog = (conv: ConversationSummary, dialog: ConversationMenuDialog) => {
    setListDialog({ conversationId: conv.id, dialog, reminders: [] });
    if (dialog === "reminder") void loadListReminders(conv.id);
  };

  const handleRealtimeMessage = useCallback(
    (row: RealtimeMessageRow) => {
      // Reconcile with this admin's own optimistic bubble, whichever arrives
      // first — this realtime event or deliver()'s own response. Matched by
      // conversation + content since the row doesn't carry the client id;
      // fine for the common case of one in-flight admin send at a time.
      if (row.senderType === SenderType.ADMIN) {
        setPending((prev) => {
          const match = prev.find(
            (p) =>
              p.conversationId === row.conversationId && !p.serverId && p.content === row.content
          );
          if (!match) return prev;
          return prev.map((p) =>
            p.clientId === match.clientId ? { ...p, serverId: row.id, status: "sent" as const } : p
          );
        });
      }

      // Append to the thread only if it's the open conversation.
      if (row.conversationId === activeId) {
        // Carry voice/media metadata through so an attachment shows live, not
        // only after a reload.
        const meta = row.metadata as AgentMessageMetadata | null;
        const voice = meta?.voice;
        const media = meta?.media;
        const structured = meta?.structured;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          // The row carries only the quoted id; the quote itself is already in
          // the thread (an unknown one simply renders without a preview).
          const quoted = row.replyToId ? prev.find((m) => m.id === row.replyToId) : undefined;
          return [
            ...prev,
            {
              id: row.id,
              content: row.content,
              senderType: row.senderType,
              senderId: row.senderType === SenderType.ADMIN ? row.senderId : null,
              senderName:
                row.senderType === SenderType.ADMIN && row.senderId
                  ? (staffNames[row.senderId] ?? null)
                  : null,
              agentName: row.aiAgentId ? (agentNames[row.aiAgentId] ?? null) : null,
              sessionId: row.sessionId,
              createdAt: parseDbTimestamp(row.createdAt),
              isRead: row.isRead,
              ...(voice
                ? {
                    voice: {
                      durationSec: voice.durationSec,
                      transcript: voice.transcript,
                      status: voice.status,
                    },
                  }
                : {}),
              ...(media
                ? {
                    media: {
                      kind: media.kind,
                      mimeType: media.mimeType,
                      filename: media.filename,
                      caption: media.caption,
                      analysis: media.analysis,
                      extraction: media.extraction,
                    },
                  }
                : {}),
              ...(structured ? { structured: { kind: structured.kind } } : {}),
              ...(quoted ? { replyTo: toReplyPreview(quoted) } : {}),
            },
          ];
        });

        // An inbound (patient) message may have raised a per-message escalation,
        // which the bare realtime row can't carry. Refetch the thread so the
        // "escalated" badge + resolve button appear live, no manual refresh.
        if (row.senderType === SenderType.USER) {
          fetchMessages(row.conversationId)
            .then((fresh) => {
              if (fresh.length) setMessages(fresh);
            })
            .catch((err) => console.error("Failed to refresh messages:", err));
        }
      }

      // A patient message can put an assigned conversation in my queue.
      if (row.senderType === SenderType.USER) refreshNeedsMe();

      // Patch the sidebar in place — preview, timestamp, unread, order.
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === row.conversationId);
        if (idx === -1) {
          // Genuinely unknown conversation (e.g. a brand-new contact) — no
          // summary fields to patch from a bare message row, fall back once.
          refreshConversations();
          return prev;
        }
        const unreadCount =
          row.senderType === SenderType.USER && row.conversationId !== activeId
            ? prev[idx].unreadCount + 1
            : prev[idx].unreadCount;
        const updated: ConversationSummary = {
          ...prev[idx],
          lastMessage: row.content,
          lastMessageAt: parseDbTimestamp(row.createdAt),
          unreadCount,
          needsMe:
            prev[idx].needsMe || (prev[idx].assignedTo?.id === currentUserId && unreadCount > 0),
        };
        const rest = prev.filter((_, i) => i !== idx);
        // Due reminders + my pins stay on top; the rest is newest-first.
        const head = rest.filter((c) => c.reminderDue || c.pinned);
        const tail = rest.filter((c) => !c.reminderDue && !c.pinned);
        if (updated.reminderDue || updated.pinned) return [updated, ...head, ...tail];
        return [...head, updated, ...tail];
      });
    },
    [activeId, refreshConversations, refreshNeedsMe, staffNames, agentNames, currentUserId]
  );

  // A message row changed after insert — a TTS agent reply gets its metadata.voice
  // attached post-stream, a staff voice note gets its transcript, or a patient
  // reacts to a message (metadata.reaction). Patch the open thread live.
  const handleRealtimeUpdate = useCallback(
    (row: RealtimeMessageRow) => {
      if (row.conversationId !== activeId) return;
      const meta = row.metadata as AgentMessageMetadata | null;
      const voice = meta?.voice;
      // `reaction` can be present (added), or absent (removed) — reflect both.
      const reaction = meta?.reaction;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === row.id
            ? {
                ...m,
                content: row.content,
                reaction,
                ...(voice
                  ? {
                      voice: {
                        durationSec: voice.durationSec,
                        transcript: voice.transcript,
                        status: voice.status,
                      },
                    }
                  : {}),
              }
            : m
        )
      );
    },
    [activeId]
  );

  useRealtimeConversations(clinicId, handleRealtimeMessage, handleRealtimeUpdate);

  // Staff-only notes posted by colleagues appear live in the open thread.
  useRealtimeInternalNotes(
    activeId,
    (row) => {
      setPendingNotes((prev) => prev.filter((n) => n.id !== row.id));
      setInternalNotes((prev) =>
        prev.some((n) => n.id === row.id)
          ? prev
          : [
              ...prev,
              {
                id: row.id,
                content: row.content,
                authorId: row.authorId,
                authorName: row.authorId
                  ? row.authorId === currentUserId
                    ? currentUserName
                    : (staffNames[row.authorId] ?? null)
                  : null,
                createdAt: parseDbTimestamp(row.createdAt),
              },
            ]
      );
    },
    (id) => setInternalNotes((prev) => prev.filter((n) => n.id !== id)),
    {
      // A note pinned to a message, added by me in another tab or by a
      // colleague. Someone else's private note is never shown.
      onInsert: (row) => {
        if (row.visibility !== "CLINIC" && row.authorId !== currentUserId) return;
        const note = {
          id: row.id,
          content: row.content,
          visibility: row.visibility,
          authorId: row.authorId,
          authorName:
            row.authorId === currentUserId
              ? currentUserName
              : (staffNames[row.authorId] ?? "فريق العيادة"),
          createdAt: parseDbTimestamp(row.createdAt),
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.messageId && !m.notes?.some((n) => n.id === row.id)
              ? { ...m, notes: [...(m.notes ?? []), note] }
              : m
          )
        );
      },
      onDelete: (id) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.notes?.some((n) => n.id === id)
              ? { ...m, notes: m.notes.filter((n) => n.id !== id) }
              : m
          )
        ),
    }
  );

  // EscalationProvider owns the single realtime subscription for escalations and
  // colleague alerts (a second subscribed channel with the same name crashes the
  // realtime client) — react to its event counter instead of subscribing again.
  const isFirstEventTick = useRef(true);
  useEffect(() => {
    if (isFirstEventTick.current) {
      isFirstEventTick.current = false;
      return;
    }
    refreshConversations();
    void reloadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTick]);

  const handleSelectConversation = (id: string) => {
    const cached = conversationCache.current.get(id);
    if (cached) {
      // Instant paint from cache; router.push below still refreshes it
      // server-side, and the effect above will reconcile once that lands.
      setSelectedConversation(cached.detail);
      setMessages(cached.messages);
      setInternalNotes(cached.notes);
    }
    // Opening it reads it — zero the badge immediately (the page render
    // persists it server-side).
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    cameFromListRef.current = true;
    router.push(`/admin/messages?${params.toString()}`);
  };

  /** Mobile: back to the list. */
  const handleBack = () => {
    if (cameFromListRef.current) {
      cameFromListRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    const qs = params.toString();
    router.replace(qs ? `/admin/messages?${qs}` : "/admin/messages");
  };

  const isWhatsapp = selectedConversation?.channel === Channel.WHATSAPP;
  // Outside the 24-hour window WhatsApp refuses free-form text; the admin must
  // send an approved template instead. `nowTs` is read so this recomputes on
  // each tick. Web conversations are never gated.
  void nowTs;
  const isOutsideWindow =
    isWhatsapp && !isWithinWhatsappWindow(selectedConversation?.lastInboundAt);

  const patchPending = useCallback((clientId: string, patch: Partial<PendingMessage>) => {
    setPending((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)));
  }, []);

  /** Reflects a send result on its optimistic bubble. */
  const settle = useCallback(
    (clientId: string, result: SendAdminReplyResult) => {
      if (!result.ok) {
        patchPending(clientId, { status: "failed_sync" });
        if (result.reason === "outside_window")
          toast.error("انتهت نافذة الـ24 ساعة — أرسل قالبًا معتمدًا");
        return;
      }
      patchPending(clientId, {
        serverId: result.messageId,
        status: result.whatsappSendFailed ? "failed_whatsapp" : "sent",
      });
      // A reply answers colleague escalations raised to me here.
      refreshNeedsMe();
    },
    [patchPending, refreshNeedsMe]
  );

  /** Runs the full send (creates the row + delivers) and reflects the outcome
   *  on the bubble. Used for the first attempt and for retrying a sync failure,
   *  where no row exists yet. */
  const deliver = useCallback(
    async (clientId: string, conversationId: string, text: string, replyToId?: string) => {
      try {
        settle(clientId, await sendAdminReply(conversationId, text, replyToId));
      } catch (err) {
        console.error("Failed to send admin reply:", err);
        patchPending(clientId, { status: "failed_sync" });
      }
    },
    [patchPending, settle]
  );

  /** Uploads a browser file straight to Storage (signed URL) → its path. */
  const uploadToStorage = async (conversationId: string, file: File, mimeType: string) => {
    const up = await createStaffMediaUpload(conversationId, mimeType);
    if (!up.ok) return null;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(up.bucket)
      .uploadToSignedUrl(up.path, up.token, file, { contentType: mimeType || undefined });
    if (error) {
      console.error("Storage upload failed:", error);
      return null;
    }
    return up.path;
  };

  /** Uploads a staged file, then persists + relays it. */
  const deliverMedia = useCallback(
    async (clientId: string, conversationId: string, media: PendingMedia, replyToId?: string) => {
      try {
        const path = await uploadToStorage(conversationId, media.file, media.mimeType);
        if (!path) {
          patchPending(clientId, { status: "failed_sync" });
          return;
        }
        settle(
          clientId,
          await sendAdminMediaReply(conversationId, {
            path,
            mimeType: media.mimeType || "application/octet-stream",
            filename: media.filename,
            caption: media.caption,
            width: media.width,
            height: media.height,
            replyToId,
          })
        );
      } catch (err) {
        console.error("Failed to send admin media:", err);
        patchPending(clientId, { status: "failed_sync" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchPending, settle]
  );

  /** Uploads a recorded OGG/Opus voice note, then persists + relays it. */
  const deliverVoice = useCallback(
    async (clientId: string, conversationId: string, entry: PendingMessage) => {
      if (!entry.voice) return;
      try {
        const path = await uploadToStorage(conversationId, entry.voice.file, "audio/ogg");
        if (!path) {
          patchPending(clientId, { status: "failed_sync" });
          return;
        }
        settle(
          clientId,
          await sendAdminVoiceReply(conversationId, {
            path,
            mimeType: "audio/ogg",
            durationSec: entry.voice.durationSec,
            replyToId: entry.replyTo?.id,
          })
        );
      } catch (err) {
        console.error("Failed to send voice note:", err);
        patchPending(clientId, { status: "failed_sync" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchPending, settle]
  );

  const deliverQuickReply = useCallback(
    async (clientId: string, conversationId: string, quickReplyId: string, replyToId?: string) => {
      try {
        settle(clientId, await sendQuickReply(conversationId, quickReplyId, replyToId));
      } catch (err) {
        console.error("Failed to send quick reply:", err);
        patchPending(clientId, { status: "failed_sync" });
      }
    },
    [patchPending, settle]
  );

  const takeQuote = () => {
    const quote = replyingTo ?? undefined;
    setReplyingTo(null);
    return quote;
  };

  const handleSend = () => {
    const text = getReply().trim();
    if (!text || !activeId) return;
    if (composerMode === "internal") {
      handleSendInternal(text);
      return;
    }
    if (isOutsideWindow) return;
    // Safe to clear: the text now lives in the bubble, and stays there if the
    // send fails.
    setReplyText("");
    const quote = takeQuote();
    const clientId = crypto.randomUUID();
    setPending((prev) => [
      ...prev,
      {
        clientId,
        conversationId: activeId,
        content: text,
        createdAt: new Date(),
        status: "sending",
        replyTo: quote,
      },
    ]);
    void deliver(clientId, activeId, text, quote?.id);
  };

  const handleSendInternal = (text: string) => {
    if (!activeId) return;
    const conversationId = activeId;
    setReplyText("");
    const clientKey = `${conversationId}:${crypto.randomUUID()}`;
    setPendingNotes((prev) => [
      ...prev,
      {
        kind: "internal",
        key: clientKey,
        id: clientKey,
        content: text,
        authorId: currentUserId,
        authorName: currentUserName,
        createdAt: new Date(),
        pending: true,
      },
    ]);
    void (async () => {
      const res = await addInternalNote(conversationId, text).catch(() => null);
      setPendingNotes((prev) => prev.filter((n) => n.key !== clientKey));
      if (!res || !res.ok) {
        toast.error("تعذّر حفظ الملاحظة الداخلية");
        // Give the text back without clobbering anything typed since.
        if (activeIdRef.current === conversationId) {
          if (!getReply().trim()) setReplyText(text);
        } else if (!draftsRef.current.has(conversationId)) {
          draftsRef.current.set(conversationId, text);
        }
        return;
      }
      setInternalNotes((prev) =>
        prev.some((n) => n.id === res.data.id) ? prev : [...prev, res.data]
      );
      refreshNeedsMe();
      void reloadThread();
    })();
  };

  const handleSendMedia = (file: File) => {
    if (!activeId || isOutsideWindow) return;
    const conversationId = activeId;
    const caption = getReply().trim();
    const quote = takeQuote();
    const clientId = crypto.randomUUID();
    setReplyText("");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void (async () => {
      // Read image dimensions up front so both the optimistic bubble and the
      // stored message reserve exact space (no layout shift on load).
      const size = await readImageSize(file);
      const media: PendingMedia = {
        kind: clientMediaKind(file.type),
        mimeType: file.type || "application/octet-stream",
        filename: file.name,
        localUrl: URL.createObjectURL(file),
        caption: caption || undefined,
        file,
        width: size?.width,
        height: size?.height,
      };
      setPending((prev) => [
        ...prev,
        {
          clientId,
          conversationId,
          content: caption,
          createdAt: new Date(),
          status: "sending",
          media,
          replyTo: quote,
        },
      ]);
      await deliverMedia(clientId, conversationId, media, quote?.id);
    })();
  };

  const handleVoiceRecorded = (file: File, durationSec: number) => {
    if (!activeId || isOutsideWindow) return;
    const conversationId = activeId;
    const quote = takeQuote();
    const clientId = crypto.randomUUID();
    const entry: PendingMessage = {
      clientId,
      conversationId,
      // Matches the server placeholder so the realtime row reconciles with it.
      content: "[رسالة صوتية من الفريق]",
      createdAt: new Date(),
      status: "sending",
      voice: { file, localUrl: URL.createObjectURL(file), durationSec },
      replyTo: quote,
    };
    setPending((prev) => [...prev, entry]);
    void deliverVoice(clientId, conversationId, entry);
  };

  const handleQuickInsert = (item: QuickReplyItem) => {
    setComposerMode("reply");
    setReplyText(item.content);
    if (item.hasMedia) {
      void quickReplyFile(item).then((f) => {
        if (f) setPendingFile(f);
        else toast.error("تعذّر تحميل صورة الرد");
      });
    }
    setTimeout(() => replyInputRef.current?.focus(), 0);
  };

  const handleQuickSend = (item: QuickReplyItem) => {
    if (!activeId || isOutsideWindow) return;
    // Clear the "/query" the panel was opened from.
    if (getReply().startsWith("/")) setReplyText("");
    const quote = takeQuote();
    const clientId = crypto.randomUUID();
    setPending((prev) => [
      ...prev,
      {
        clientId,
        conversationId: activeId,
        content: item.content,
        createdAt: new Date(),
        status: "sending",
        replyTo: quote,
        quickReplyId: item.id,
      },
    ]);
    void deliverQuickReply(clientId, activeId, item.id, quote?.id);
  };

  const handleResolveEscalation = (escalationId: string) => {
    // Optimistically hide the badge; restore it if the server rejects.
    setResolvedEscalations((prev) => new Set(prev).add(escalationId));
    const restore = () =>
      setResolvedEscalations((prev) => {
        const next = new Set(prev);
        next.delete(escalationId);
        return next;
      });
    void resolveMessageEscalation(escalationId)
      .then((res) => {
        if (!res.ok) restore();
      })
      .catch((err) => {
        console.error("Failed to resolve escalation:", err);
        restore();
      });
  };

  // A template send is already persisted server-side; show it immediately as a
  // "sent" bubble (retired once the server row arrives), like a normal reply.
  const handleTemplateSent = (msg: { messageId: string; createdAt: string; content: string }) => {
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
    refreshNeedsMe();
  };

  const handleRetry = (clientId: string) => {
    const entry = pending.find((p) => p.clientId === clientId);
    if (!entry || entry.status === "sending" || entry.status === "sent") return;
    patchPending(clientId, { status: "sending" });

    // The row already exists — re-deliver it instead of writing a duplicate.
    if (entry.status === "failed_whatsapp" && entry.serverId) {
      const serverId = entry.serverId;
      void retryWhatsappDelivery(serverId)
        .then((result) => {
          patchPending(clientId, { status: result.ok ? "sent" : "failed_whatsapp" });
          if (result.ok) router.refresh();
        })
        .catch((err) => {
          console.error("Failed to retry WhatsApp delivery:", err);
          patchPending(clientId, { status: "failed_whatsapp" });
        });
      return;
    }

    if (entry.voice) return void deliverVoice(clientId, entry.conversationId, entry);
    if (entry.media)
      return void deliverMedia(clientId, entry.conversationId, entry.media, entry.replyTo?.id);
    if (entry.quickReplyId) {
      return void deliverQuickReply(
        clientId,
        entry.conversationId,
        entry.quickReplyId,
        entry.replyTo?.id
      );
    }
    void deliver(clientId, entry.conversationId, entry.content, entry.replyTo?.id);
  };

  const handleToggleAi = () => {
    if (!selectedConversation?.activeSessionId) return;
    const sessionId = selectedConversation.activeSessionId;
    const conversationId = selectedConversation.id;
    const next = !selectedConversation.aiEnabled;
    setSelectedConversation((prev) => (prev ? { ...prev, aiEnabled: next } : prev));
    startAiToggle(async () => {
      await setSessionAiEnabled(sessionId, next);
      const fresh = await fetchConversationDetail(conversationId);
      if (fresh) setSelectedConversation(fresh);
    });
  };

  // Runs per keystroke but touches no state on plain typing: React bails out of
  // same-value updates, so only the empty ↔ non-empty flip and "/" re-render.
  const handleReplyChange = (value: string) => {
    if (activeId) {
      if (value) draftsRef.current.set(activeId, value);
      else draftsRef.current.delete(activeId);
    }
    setHasText(value.trim().length > 0);
    // "/" at the start opens the quick-replies pool, filtered by what follows.
    if (composerMode === "reply" && value.startsWith("/") && !value.includes("\n")) {
      setQuickQuery(value.slice(1));
      setQuickOpen(true);
    } else if (quickOpen && !value.startsWith("/")) {
      setQuickOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (quickOpen) return;
      if (pendingFile && composerMode === "reply") handleSendMedia(pendingFile);
      else handleSend();
    }
  };

  const openMessageNote = (m: RenderedMessage) => {
    if (!m.id) return;
    setTargetMessage({ id: m.id, snippet: toReplyPreview({ ...m, id: m.id }).snippet });
    setNoteDialogOpen(true);
  };

  const openMessageEscalate = (m: RenderedMessage | null) => {
    setTargetMessage(
      m?.id ? { id: m.id, snippet: toReplyPreview({ ...m, id: m.id }).snippet } : null
    );
    setDialog("escalate");
  };

  const handleDeleteMessageNote = (noteId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.notes ? { ...m, notes: m.notes.filter((n) => n.id !== noteId) } : m))
    );
    void deleteMessageNote(noteId).then((res) => {
      if (!res.ok) {
        toast.error("تعذّر حذف الملاحظة");
        void reloadThread({ messages: true });
      }
    });
  };

  const handleDeleteInternalNote = (noteId: string) => {
    setInternalNotes((prev) => prev.filter((n) => n.id !== noteId));
    void deleteInternalNote(noteId).then((res) => {
      if (!res.ok) {
        toast.error("تعذّر حذف الملاحظة");
        void reloadThread();
      }
    });
  };

  const internalMode = composerMode === "internal";
  // Free-form replies are blocked outside the window; internal notes never are.
  const replyBlocked = !internalMode && isOutsideWindow;

  let lastSessionId: string | null = null;

  return (
    <Card className="-m-4 flex h-[calc(100dvh-4rem)] overflow-hidden rounded-none border-0 md:m-0 md:h-[calc(100vh-7rem)] md:rounded-2xl md:border">
      {/* ── Conversations list (full screen on mobile until a chat is open) ── */}
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        loading={listPending}
        labels={labels}
        needsMeCount={needsMeCount}
        currentUserId={currentUserId}
        onSelect={handleSelectConversation}
        onTogglePin={handleListTogglePin}
        onAssign={handleListAssign}
        onOpenDialog={handleListOpenDialog}
        teammates={teammates}
        canOpenPatientProfile={canOpenPatientProfile}
        className={cn("w-full md:w-80 md:flex-shrink-0", activeId ? "hidden md:flex" : "flex")}
      />

      {/* ── Thread (full screen on mobile) ── */}
      <div className={cn("min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="font-sans text-sm">اختر محادثة لعرض الرسائل</p>
          </div>
        ) : threadMissing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="font-sans text-sm">المحادثة غير موجودة</p>
            <Button variant="outline" size="sm" onClick={handleBack}>
              العودة للمحادثات
            </Button>
          </div>
        ) : threadLoading || !selectedConversation ? (
          <ThreadSkeleton />
        ) : (
          <>
            <ThreadHeader
              detail={selectedConversation}
              labels={labels}
              teammates={teammates}
              currentUserId={currentUserId}
              canOpenPatientProfile={canOpenPatientProfile}
              aiTogglePending={aiTogglePending}
              onToggleAi={handleToggleAi}
              onBack={handleBack}
              onOpenDialog={(d) => (d === "escalate" ? openMessageEscalate(null) : setDialog(d))}
              onChanged={() => afterUtilityChange()}
              onDetailPatch={(patch) =>
                setSelectedConversation((prev) => (prev ? { ...prev, ...patch } : prev))
              }
            />

            {/* Messages + staff-only notes */}
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5">
              {timeline.length === 0 && (
                <p className="py-8 text-center font-sans text-xs text-muted-foreground">
                  لا توجد رسائل في هذه المحادثة
                </p>
              )}
              {timeline.map((item) => {
                if (item.kind === "internal") {
                  return (
                    <InternalNoteBubble
                      key={item.key}
                      note={item}
                      currentUserId={currentUserId}
                      onDelete={handleDeleteInternalNote}
                    />
                  );
                }
                const showDivider = !!item.sessionId && item.sessionId !== lastSessionId;
                if (item.sessionId) lastSessionId = item.sessionId;
                return (
                  <Fragment key={item.key}>
                    {showDivider && (
                      <div className="flex items-center gap-2 py-1" dir="rtl">
                        <Separator className="flex-1" />
                        <span className="whitespace-nowrap font-sans text-[10px] text-muted-foreground">
                          جلسة جديدة ·{" "}
                          {new Date(item.createdAt).toLocaleString("ar-EG", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <Separator className="flex-1" />
                      </div>
                    )}
                    <MessageBubble
                      msg={item}
                      contactName={selectedConversation.contactName}
                      canReply={!isOutsideWindow}
                      highlighted={!!item.id && highlightedId === item.id}
                      escalationHidden={
                        !!item.escalation && resolvedEscalations.has(item.escalation.id)
                      }
                      escalatedTo={item.id ? escalatedToByMessage.get(item.id) : null}
                      currentUserId={currentUserId}
                      onReply={() => item.id && startReply({ ...item, id: item.id })}
                      onJump={jumpToMessage}
                      onResolveEscalation={handleResolveEscalation}
                      onRetry={handleRetry}
                      onAddNote={() => openMessageNote(item)}
                      onEscalate={() => openMessageEscalate(item)}
                      onDeleteNote={handleDeleteMessageNote}
                    />
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div
              className={cn(
                "flex-shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-4 md:pb-3",
                internalMode && "bg-amber-50/60 dark:bg-amber-950/20"
              )}
            >
              {/* Reply to the patient / staff-only internal note */}
              <div className="mb-2 flex gap-1 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setComposerMode("reply")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1 font-sans text-xs font-medium transition-colors",
                    !internalMode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  رد على العميل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposerMode("internal");
                    setReplyingTo(null);
                    setQuickOpen(false);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1 font-sans text-xs font-medium transition-colors",
                    internalMode ? "bg-amber-500 text-white shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Lock className="h-3.5 w-3.5" />
                  ملاحظة داخلية للفريق
                </button>
              </div>

              {replyBlocked ? (
                // Outside the 24-hour window WhatsApp refuses free-form text —
                // only an approved template can reach the contact.
                <Alert variant="warning" className="flex-col gap-2.5 px-3.5 text-xs text-amber-800">
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      انتهت نافذة الـ24 ساعة منذ آخر رسالة من العميل. لا يمكن إرسال رسالة نصية حرة —
                      أرسل قالبًا معتمدًا من ميتا بدلاً من ذلك.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowTemplatePicker(true)}
                    className="self-start [&_svg]:size-3.5"
                  >
                    <FileText />
                    إرسال قالب معتمد
                  </Button>
                </Alert>
              ) : (
                <div className="flex flex-col gap-2">
                  {replyingTo && !internalMode && (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 py-2 pe-2 ps-3">
                      <Reply className="h-4 w-4 flex-shrink-0 text-primary" />
                      <button
                        type="button"
                        onClick={() => jumpToMessage(replyingTo.id)}
                        className="min-w-0 flex-1 border-s-2 border-primary ps-2 text-start"
                      >
                        <span className="block text-[11px] font-semibold text-primary">
                          الرد على {quoteAuthor(replyingTo, selectedConversation.contactName)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {replyingTo.snippet || "رسالة"}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setReplyingTo(null)}
                        aria-label="إلغاء الرد"
                        className="[&_svg]:size-4"
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                  {pendingFile && !internalMode && (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
                      {pendingPreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pendingPreviewUrl}
                          alt={pendingFile.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-xs text-foreground">
                        {pendingFile.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setPendingFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        aria-label="إلغاء المرفق"
                        className="[&_svg]:size-4"
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5 md:gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPendingFile(f);
                      }}
                    />
                    {!internalMode && !recording && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="إرفاق ملف"
                          className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                        >
                          <Paperclip />
                        </Button>
                        <QuickRepliesPanel
                          open={quickOpen}
                          onOpenChange={(o) => {
                            setQuickOpen(o);
                            if (o && !getReply().startsWith("/")) setQuickQuery("");
                          }}
                          initialQuery={quickQuery}
                          disabled={isOutsideWindow}
                          onInsert={handleQuickInsert}
                          onSend={handleQuickSend}
                        />
                      </>
                    )}
                    {!recording && (
                      <Textarea
                        ref={bindReplyInput}
                        onChange={(e) => handleReplyChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          internalMode
                            ? "ملاحظة يراها الفريق فقط — لا تُرسل للعميل..."
                            : pendingFile
                              ? "أضف تعليقاً (اختياري)..."
                              : "اكتب ردك... أو «/» للردود السريعة"
                        }
                        rows={1}
                        className={cn(
                          "max-h-40 min-h-10 flex-1 resize-none px-3.5 py-2.5 leading-relaxed md:min-h-[4.25rem]",
                          internalMode &&
                            "border-amber-300 bg-amber-50 focus-visible:ring-amber-400 dark:bg-amber-950/30"
                        )}
                        dir="rtl"
                      />
                    )}
                    {!internalMode && !pendingFile && !hasText ? (
                      <VoiceRecorder
                        disabled={isOutsideWindow}
                        onRecorded={handleVoiceRecorded}
                        onActiveChange={setRecording}
                      />
                    ) : (
                      <Button
                        size="icon"
                        onClick={() => {
                          if (pendingFile && !internalMode) handleSendMedia(pendingFile);
                          else handleSend();
                        }}
                        disabled={(!pendingFile || internalMode) && !hasText}
                        aria-label={internalMode ? "حفظ الملاحظة" : "إرسال"}
                        className={cn(
                          "h-10 w-10 shrink-0 rounded-xl",
                          internalMode && "bg-amber-500 hover:bg-amber-600"
                        )}
                      >
                        {internalMode ? <Lock /> : <Send />}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <LabelsDialog
              open={dialog === "labels"}
              onOpenChange={(o) => setDialog(o ? "labels" : null)}
              conversationId={selectedConversation.id}
              labels={labels}
              selectedIds={selectedConversation.labelIds}
              onLabelsChange={(next) => {
                setLabels(next);
                refreshConversations();
              }}
              onSelectedChange={(ids) => {
                setSelectedConversation((prev) => (prev ? { ...prev, labelIds: ids } : prev));
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === selectedConversation.id
                      ? { ...c, labels: labels.filter((l) => ids.includes(l.id)) }
                      : c
                  )
                );
              }}
            />
            <ReminderDialog
              open={dialog === "reminder"}
              onOpenChange={(o) => setDialog(o ? "reminder" : null)}
              conversationId={selectedConversation.id}
              reminders={selectedConversation.reminders}
              currentUserId={currentUserId}
              onChanged={() => {
                afterUtilityChange();
                refreshReminders();
              }}
            />
            <EscalateDialog
              open={dialog === "escalate"}
              onOpenChange={(o) => setDialog(o ? "escalate" : null)}
              conversationId={selectedConversation.id}
              message={targetMessage}
              teammates={teammates}
              currentUserId={currentUserId}
              onDone={() => afterUtilityChange()}
            />
            <MessageNoteDialog
              open={noteDialogOpen}
              onOpenChange={setNoteDialogOpen}
              message={targetMessage}
              onSaved={() => void reloadThread({ messages: true })}
            />
          </>
        )}
      </div>

      {listDialog && listDialogConversation && (
        <>
          <LabelsDialog
            open={listDialog.dialog === "labels"}
            onOpenChange={(o) => !o && setListDialog(null)}
            conversationId={listDialog.conversationId}
            labels={labels}
            selectedIds={listDialogConversation.labels.map((l) => l.id)}
            onLabelsChange={(next) => {
              setLabels(next);
              refreshConversations();
            }}
            onSelectedChange={(ids) => {
              const id = listDialog.conversationId;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === id ? { ...c, labels: labels.filter((l) => ids.includes(l.id)) } : c
                )
              );
              setSelectedConversation((prev) =>
                prev?.id === id ? { ...prev, labelIds: ids } : prev
              );
            }}
          />
          <ReminderDialog
            open={listDialog.dialog === "reminder"}
            onOpenChange={(o) => !o && setListDialog(null)}
            conversationId={listDialog.conversationId}
            reminders={listDialog.reminders}
            currentUserId={currentUserId}
            onChanged={() => {
              void loadListReminders(listDialog.conversationId);
              afterUtilityChange();
              refreshReminders();
            }}
          />
          <EscalateDialog
            open={listDialog.dialog === "escalate"}
            onOpenChange={(o) => !o && setListDialog(null)}
            conversationId={listDialog.conversationId}
            message={null}
            teammates={teammates}
            currentUserId={currentUserId}
            onDone={() => afterUtilityChange()}
          />
        </>
      )}

      {showTemplatePicker && selectedConversation && (
        <WhatsappTemplatePicker
          conversationId={selectedConversation.id}
          onClose={() => setShowTemplatePicker(false)}
          onSent={handleTemplateSent}
        />
      )}
    </Card>
  );
}

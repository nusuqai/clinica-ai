"use client";

import { useState, useEffect, useMemo, useRef, useTransition, useCallback, Fragment } from "react";
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
  Paperclip,
  X,
  CheckCircle2,
} from "lucide-react";
import { WhatsappIcon } from "@/components/icons/whatsapp-icon";
import WhatsappTemplatePicker from "@/components/admin/whatsapp-template-picker";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { ChatImage } from "@/components/ui/chat-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  sendAdminReply,
  sendAdminMediaReply,
  createStaffMediaUpload,
  retryWhatsappDelivery,
  resolveMessageEscalation,
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
import {
  fetchConversations,
  fetchConversationDetail,
  fetchMessages,
} from "@/server/actions/conversations";
import type { AgentMessageMetadata } from "@/agent/types";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

interface ChatInboxProps {
  conversations: ConversationSummary[];
  selectedConversation: ConversationDetail | null;
  messages: MessageItem[];
  clinicId: string;
}

/**
 * `sending` → in flight. `sent` → persisted and delivered, kept only until the
 * server row arrives. `failed_sync` → nothing was written to the database.
 * `failed_whatsapp` → the row exists but WhatsApp delivery failed.
 */
type PendingStatus = "sending" | "sent" | "failed_sync" | "failed_whatsapp";

/** Formats an audio length as m:ss. */
function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Optimistic media on a pending staff attachment (kept until the server row
 *  arrives). `file` is retained so a failed send can be retried. */
interface PendingMedia {
  kind: "image" | "video" | "audio" | "document";
  mimeType: string;
  filename?: string;
  /** Local object URL for instant preview before the upload lands. */
  localUrl?: string;
  caption?: string;
  file: File;
  /** Intrinsic dimensions for an image (read client-side before upload). */
  width?: number;
  height?: number;
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
  /** Set when this is a media attachment, not a text reply. */
  media?: PendingMedia;
}

/** Categorises a browser File's mime into the outbound media kind. */
function clientMediaKind(mime: string): "image" | "video" | "audio" | "document" {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
}

interface RenderedMessage {
  key: string;
  /** Server message id (absent on optimistic bubbles) — used for media playback. */
  id?: string;
  content: string;
  senderType: MessageItem["senderType"];
  sessionId: string | null;
  createdAt: Date;
  pending?: PendingMessage;
  voice?: MessageItem["voice"];
  media?: MessageItem["media"];
  /** Local preview URL for a still-uploading attachment (no server id yet). */
  mediaLocalUrl?: string;
  structured?: MessageItem["structured"];
  escalation?: MessageItem["escalation"];
  reaction?: MessageItem["reaction"];
}

export default function ChatInbox({
  conversations: initialConversations,
  selectedConversation: initialConversation,
  messages: initialMessages,
  clinicId,
}: ChatInboxProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedConversation, setSelectedConversation] = useState(initialConversation);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [listPending, startListTransition] = useTransition();
  const [aiTogglePending, startAiToggle] = useTransition();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  // A file the admin picked to attach, staged before send (the textarea becomes
  // its optional caption).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Escalation ids being resolved (optimistically hidden while the call runs).
  const [resolvedEscalations, setResolvedEscalations] = useState<Set<string>>(new Set());
  // Ticks so the 24-hour-window gate re-evaluates as time passes without a
  // reload — the window can lapse while the admin sits on a thread.
  const [nowTs, setNowTs] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync when server re-renders with fresh data
  useEffect(() => setConversations(initialConversations), [initialConversations]);
  useEffect(() => setMessages(initialMessages), [initialMessages]);
  useEffect(() => setSelectedConversation(initialConversation), [initialConversation]);

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

  // Server rows plus this thread's optimistic bubbles. A pending entry that
  // already has a row hides that row, so a message that failed to reach
  // WhatsApp renders once — from pending state, carrying its badge.
  const threadMessages = useMemo<RenderedMessage[]>(() => {
    const mine = pending.filter((p) => p.conversationId === activeId);
    const superseded = new Set(mine.map((p) => p.serverId).filter((id): id is string => !!id));
    return [
      ...messages
        .filter((m) => !superseded.has(m.id))
        .map((m) => ({
          key: m.id,
          id: m.id,
          content: m.content,
          senderType: m.senderType,
          sessionId: m.sessionId,
          createdAt: m.createdAt,
          voice: m.voice,
          media: m.media,
          structured: m.structured,
          escalation: m.escalation,
          reaction: m.reaction,
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
    ];
  }, [messages, pending, activeId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const refreshConversations = useCallback(() => {
    startListTransition(async () => {
      try {
        const fresh = await fetchConversations(clinicId);
        setConversations(fresh);
      } catch (err) {
        console.error("Failed to refresh conversations:", err);
      }
    });
  }, [clinicId]);
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
        setMessages((prev) =>
          prev.some((m) => m.id === row.id)
            ? prev
            : [
                ...prev,
                {
                  id: row.id,
                  content: row.content,
                  senderType: row.senderType,
                  sessionId: row.sessionId,
                  createdAt: new Date(row.createdAt),
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
                },
              ]
        );

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

      // Patch the sidebar in place — preview, timestamp, unread, order.
      // This is the single source of truth for an existing conversation's
      // summary row; nothing else should refetch and overwrite it for the
      // "new message on an existing conversation" case.
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === row.conversationId);
        if (idx === -1) {
          // Genuinely unknown conversation (e.g. a brand-new contact) — no
          // summary fields to patch from a bare message row, fall back once.
          refreshConversations();
          return prev;
        }
        const updated: ConversationSummary = {
          ...prev[idx],
          lastMessage: row.content,
          lastMessageAt: new Date(row.createdAt),
          unreadCount:
            row.senderType === SenderType.USER && row.conversationId !== activeId
              ? prev[idx].unreadCount + 1
              : prev[idx].unreadCount,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest]; // mirrors orderBy: { updatedAt: "desc" }
      });
    },
    [activeId, refreshConversations]
  );

  // A message row changed after insert — a TTS agent reply gets its metadata.voice
  // attached post-stream, or a patient reacts to a message (metadata.reaction).
  // Patch the open thread so the audio player / reaction chip appears live.
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

  // Client-side cache of conversation detail + messages, keyed by conversation
  // id. Lets switching back to an already-visited thread render instantly
  // instead of waiting on the server round-trip triggered by router.push.
  // ✅ correct — generic type goes in <>, initial value goes in the () call
  const conversationCache = useRef<
    Map<string, { detail: ConversationDetail; messages: MessageItem[] }>
  >(new Map());
  // Sync when server re-renders with fresh data, and cache it for this id so
  // switching back later can skip the loading gap.
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    setMessages(initialMessages);
    setSelectedConversation(initialConversation);
    if (initialConversation) {
      conversationCache.current.set(initialConversation.id, {
        detail: initialConversation,
        messages: initialMessages,
      });
    }
  }, [initialConversation, initialMessages]);
  const handleSelectConversation = (id: string) => {
    const cached = conversationCache.current.get(id);
    if (cached) {
      // Instant paint from cache; router.push below still refreshes it
      // server-side, and the effect above will reconcile once that lands.
      setSelectedConversation(cached.detail);
      setMessages(cached.messages);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    router.push(`/admin/messages?${params.toString()}`);
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
    },
    [patchPending, router]
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

  /** Uploads a staged file straight to Storage (signed URL), then persists +
   *  relays it. Used for the first attempt and for retrying a sync failure. */
  const deliverMedia = useCallback(
    async (clientId: string, conversationId: string, media: PendingMedia) => {
      try {
        const up = await createStaffMediaUpload(conversationId, media.mimeType);
        if (!up.ok) {
          patchPending(clientId, { status: "failed_sync" });
          return;
        }
        const supabase = createClient();
        const { error: upErr } = await supabase.storage
          .from(up.bucket)
          .uploadToSignedUrl(up.path, up.token, media.file, {
            contentType: media.mimeType || undefined,
          });
        if (upErr) {
          console.error("Storage upload failed:", upErr);
          patchPending(clientId, { status: "failed_sync" });
          return;
        }
        const result = await sendAdminMediaReply(conversationId, {
          path: up.path,
          mimeType: media.mimeType || "application/octet-stream",
          filename: media.filename,
          caption: media.caption,
          width: media.width,
          height: media.height,
        });
        if (!result.ok) {
          patchPending(clientId, { status: "failed_sync" });
          return;
        }
        patchPending(clientId, {
          serverId: result.messageId,
          status: result.whatsappSendFailed ? "failed_whatsapp" : "sent",
        });
      } catch (err) {
        console.error("Failed to send admin media:", err);
        patchPending(clientId, { status: "failed_sync" });
      }
    },
    [patchPending]
  );

  const handleSendMedia = (file: File) => {
    if (!activeId || isOutsideWindow) return;
    const conversationId = activeId;
    const caption = reply.trim();
    const clientId = crypto.randomUUID();
    setReply("");
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
        },
      ]);
      await deliverMedia(clientId, conversationId, media);
    })();
  };

  const handleResolveEscalation = (escalationId: string) => {
    // Optimistically hide the badge; restore it if the server rejects.
    setResolvedEscalations((prev) => new Set(prev).add(escalationId));
    void (async () => {
      try {
        const res = await resolveMessageEscalation(escalationId);
        if (!res.ok) {
          setResolvedEscalations((prev) => {
            const next = new Set(prev);
            next.delete(escalationId);
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to resolve escalation:", err);
        setResolvedEscalations((prev) => {
          const next = new Set(prev);
          next.delete(escalationId);
          return next;
        });
      }
    })();
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

    // A media send that never persisted — re-upload + resend from the kept File.
    if (entry.media) {
      void deliverMedia(clientId, entry.conversationId, entry.media);
      return;
    }

    void deliver(clientId, entry.conversationId, entry.content);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (pendingFile) handleSendMedia(pendingFile);
      else handleSend();
    }
  };

  // Ref mirror of `conversations` so the "mark read" effect below can read
  // current unread state without depending on (and rerunning on) every list update.
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Opening a conversation reads it — zero the badge immediately (optimistic).
  // Server-side persistence is handled by the page render itself (it calls
  // markConversationRead whenever it renders with an `id`), so we deliberately
  // do NOT fire a second server action here: doing so races the RSC navigation
  // that router.push kicks off, and the concurrent pair can trip Supabase's
  // single-use refresh-token rotation, logging the admin out mid-select and
  // bouncing them to the home page. One request per select keeps auth stable.
  // Only runs when there's actually something unread, so it's a no-op on repeat
  // visits to an already-read thread.
  useEffect(() => {
    if (!activeId) return;
    const current = conversationsRef.current.find((c) => c.id === activeId);
    if (!current || current.unreadCount === 0) return;

    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)));
  }, [activeId]);

  return (
    <Card className="flex h-[calc(100vh-7rem)] overflow-hidden">
      {/* ── Left pane: conversations list ── */}
      <aside className="flex w-72 flex-shrink-0 flex-col border-e border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">المحادثات</h2>
          {listPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {conversations.length === 0 && (
            <li className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Inbox className="h-8 w-8 opacity-40" />
              <p className="font-sans text-xs">لا توجد محادثات بعد</p>
            </li>
          )}
          {conversations.map((conv) => (
            <li key={conv.id}>
              <Button
                variant="ghost"
                onClick={() => handleSelectConversation(conv.id)}
                className={[
                  "block h-auto w-full whitespace-normal rounded-none px-4 py-3 text-start font-normal text-foreground hover:bg-muted/50 hover:text-foreground",
                  conv.hasUnresolvedEscalation ? "bg-red-50" : "",
                  activeId === conv.id ? "bg-accent/8 border-e-2 border-accent" : "",
                ].join(" ")}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex max-w-[140px] items-center gap-1.5 truncate font-sans text-sm font-medium text-foreground">
                    {conv.hasUnresolvedEscalation && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 flex-shrink-0 text-red-500"
                        aria-label="طلب تصعيد غير محلول"
                      />
                    )}
                    <span className="truncate">{conv.contactName}</span>
                  </span>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {conv.unreadCount > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent font-sans text-[10px] font-bold text-white">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                    {conv.channel === Channel.WHATSAPP ? (
                      <WhatsappIcon className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-accent" />
                    )}
                  </div>
                </div>
                {conv.lastMessage && (
                  <p className="truncate font-sans text-xs text-muted-foreground">
                    {conv.lastMessage}
                  </p>
                )}
                {conv.lastMessageAt && (
                  <p className="mt-0.5 font-sans text-[10px] text-muted-foreground/60" dir="rtl">
                    {formatDistanceToNow(new Date(conv.lastMessageAt), {
                      addSuffix: true,
                      locale: ar,
                    })}
                  </p>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Right pane: message thread ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selectedConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="font-sans text-sm">اختر محادثة لعرض الرسائل</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-5 py-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
                <span className="font-sans text-xs font-bold text-accent">
                  {selectedConversation.contactName.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-sans text-sm font-medium text-foreground">
                  {selectedConversation.contactName}
                </p>
                {selectedConversation.contactPhone && (
                  <p
                    className="flex items-center gap-1 font-sans text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    <Phone className="h-3 w-3" />
                    {selectedConversation.contactPhone}
                  </p>
                )}
              </div>
              <div className="ms-auto flex items-center gap-2">
                {selectedConversation.userId ? (
                  <Button
                    asChild
                    variant="ghost"
                    className="h-auto gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-normal text-primary hover:bg-primary/20 hover:text-primary [&_svg]:size-3.5"
                  >
                    <a
                      href={`/admin/users/${selectedConversation.userId}`}
                      target="_blank"
                      rel="noopener noreferrer"

                      title="فتح ملف العميل في تبويب جديد"
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      ملف العميل
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                ) : (
                  <Badge
                    className="cursor-not-allowed gap-1.5 bg-muted py-1 font-normal text-muted-foreground/60"
                    title="لا يوجد حساب مرتبط بعد — سيظهر الملف بعد تسجيل العميل"
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    ملف العميل
                  </Badge>
                )}
                {selectedConversation.escalations.length > 0 &&
                  (() => {
                    const unresolved = selectedConversation.escalations.filter(
                      (e) => !e.resolvedAt
                    );
                    const isUnresolved = unresolved.length > 0;
                    const shown = isUnresolved ? unresolved : selectedConversation.escalations;
                    return (
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px]",
                          isUnresolved ? "bg-red-100 text-red-700" : "text-muted-foreground",
                        ].join(" ")}
                        title={shown.map((e) => escalationReasonLabel(e.reason)).join(" · ")}
                      >
                        {isUnresolved && <AlertTriangle className="h-3 w-3" />}
                        {isUnresolved
                          ? `${unresolved.length} طلب تصعيد بانتظار الرد`
                          : `${selectedConversation.escalations.length} طلب تصعيد (تم الرد)`}
                      </span>
                    );
                  })()}
                {selectedConversation.activeSessionId && (
                  <Badge
                    asChild
                    variant={selectedConversation.aiEnabled ? "accent" : "muted"}
                    className="cursor-pointer gap-1.5 py-1 font-normal disabled:opacity-50"
                  >
                    <button
                      onClick={handleToggleAi}
                      disabled={aiTogglePending}
                      title="تفعيل/إيقاف رد المساعد الذكي لهذه الجلسة"
                    >
                      {selectedConversation.aiEnabled ? (
                        <Bot className="h-3.5 w-3.5" />
                      ) : (
                        <BotOff className="h-3.5 w-3.5" />
                      )}
                      {selectedConversation.aiEnabled ? "الذكاء مفعّل" : "الذكاء متوقف"}
                    </button>
                  </Badge>
                )}
                {selectedConversation.channel === Channel.WHATSAPP ? (
                  <Badge className="bg-green-100 px-2 font-normal text-green-700">
                    <WhatsappIcon className="h-3 w-3" />
                    واتساب
                  </Badge>
                ) : (
                  <Badge variant="accent" className="px-2 font-normal">
                    <Globe className="h-3 w-3" />
                    ويب
                  </Badge>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {threadMessages.length === 0 && (
                <p className="py-8 text-center font-sans text-xs text-muted-foreground">
                  لا توجد رسائل في هذه المحادثة
                </p>
              )}
              {threadMessages.map((msg, idx) => {
                const prev = threadMessages[idx - 1];
                const showDivider = !!msg.sessionId && msg.sessionId !== prev?.sessionId;
                const isOutgoing =
                  msg.senderType === SenderType.ADMIN || msg.senderType === SenderType.AGENT;
                const isAgent = msg.senderType === SenderType.AGENT;
                const status = msg.pending?.status;
                const isFailed = status === "failed_sync" || status === "failed_whatsapp";
                return (
                  <Fragment key={msg.key}>
                    {showDivider && (
                      <div className="flex items-center gap-2 py-1" dir="rtl">
                        <div className="h-px flex-1 bg-border" />
                        <span className="whitespace-nowrap font-sans text-[10px] text-muted-foreground">
                          جلسة جديدة ·{" "}
                          {new Date(msg.createdAt).toLocaleString("ar-EG", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div
                      className={["flex", isOutgoing ? "justify-start" : "justify-end"].join(" ")}
                    >
                      <div
                        className={[
                          "max-w-[70%] rounded-2xl px-3.5 py-2 font-sans text-sm leading-relaxed transition-opacity",
                          isAgent
                            ? "rounded-ss-sm border border-accent/20 bg-accent/10 text-foreground"
                            : isOutgoing
                              ? isFailed
                                ? "rounded-ss-sm border border-red-200 bg-red-50 text-foreground"
                                : "rounded-ss-sm bg-muted text-foreground"
                              : "rounded-se-sm bg-primary text-white",
                          status === "sending" ? "opacity-50" : "",
                        ].join(" ")}
                      >
                        {isAgent && (
                          <p className="mb-0.5 text-[10px] font-medium text-accent">
                            🤖 المساعد الذكي
                          </p>
                        )}
                        {msg.voice && (
                          <div className="mb-1">
                            {msg.voice.status === "failed" ? (
                              <p className="flex items-center gap-1 text-[11px] text-red-600">
                                🎤 تعذّر تفريغ الرسالة الصوتية
                              </p>
                            ) : (
                              <audio
                                controls
                                preload="none"
                                src={msg.id ? `/api/admin/media/${msg.id}` : undefined}
                                className="h-9 w-full max-w-[240px]"
                              />
                            )}
                            {typeof msg.voice.durationSec === "number" && (
                              <span
                                className="mt-0.5 block text-[10px] text-muted-foreground"
                                dir="ltr"
                              >
                                🎤 {formatDuration(msg.voice.durationSec)}
                              </span>
                            )}
                          </div>
                        )}
                        {msg.media && (msg.id || msg.mediaLocalUrl) && (
                          <div className="mb-1">
                            {(() => {
                              // Prefer the signed endpoint once persisted; fall back
                              // to the local object URL while still uploading.
                              const mediaUrl = msg.id
                                ? `/api/admin/media/${msg.id}`
                                : msg.mediaLocalUrl;
                              return msg.media.kind === "image" ? (
                                <ChatImage
                                  src={mediaUrl}
                                  alt={msg.media.caption ?? "صورة"}
                                  width={msg.media.width}
                                  height={msg.media.height}
                                  maxWidth={240}
                                />
                              ) : msg.media.kind === "sticker" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={mediaUrl}
                                  alt="ملصق"
                                  loading="lazy"
                                  className="h-24 w-24 object-contain"
                                />
                              ) : msg.media.kind === "video" ? (
                                <video
                                  controls
                                  preload="none"
                                  src={mediaUrl}
                                  className="max-h-64 w-full max-w-[240px] rounded-lg"
                                />
                              ) : (
                                // document (or archived audio) — a download link.
                                <Button
                                  asChild
                                  variant="outline"
                                  className="h-auto gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs font-normal hover:bg-muted"
                                >
                                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                                    <FileText className="h-4 w-4 flex-shrink-0" />
                                    <span className="max-w-[180px] truncate">
                                      {msg.media.filename ?? "ملف مرفق"}
                                    </span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                                  </a>
                                </Button>
                              );
                            })()}
                            {msg.media.analysis && (
                              <p className="mt-1 text-[10px] italic text-muted-foreground">
                                🔍 {msg.media.analysis}
                              </p>
                            )}
                            {msg.media.extraction && (
                              <div className="mt-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                                <p className="mb-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-500">
                                  📋 نص مستخرج من الصورة (للمراجعة)
                                </p>
                                <p className="whitespace-pre-wrap text-xs text-foreground">
                                  {msg.media.extraction}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        {isAgent ? (
                          <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          // For a voice message the content IS the transcript; render it
                          // beneath the player. Skip the empty string of a spoken reply.
                          msg.content && <p>{msg.content}</p>
                        )}
                        {msg.escalation && !resolvedEscalations.has(msg.escalation.id) && (
                          <Alert
                            variant="warning"
                            className="mt-1.5 items-center rounded-lg border-amber-300 px-2 py-1 text-[11px] text-amber-800"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="flex-1">
                              {escalationReasonLabel(msg.escalation.reason)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handleResolveEscalation(msg.escalation!.id)}
                              className="h-auto gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-xs hover:bg-amber-700 [&_svg]:size-3"
                            >
                              <CheckCircle2 />
                              تحديد كمحلولة
                            </Button>
                          </Alert>
                        )}
                        {status === "sending" ? (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            جارٍ الإرسال...
                          </p>
                        ) : isFailed ? (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-red-700">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                            <span>
                              {status === "failed_whatsapp"
                                ? "تم الحفظ لكن لم تصل إلى واتساب"
                                : "لم يتم حفظ الرسالة"}
                            </span>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => handleRetry(msg.pending!.clientId)}
                              className="h-auto gap-1 p-0 text-xs text-[inherit] underline hover:no-underline [&_svg]:size-3"
                            >
                              <RotateCw />
                              إعادة المحاولة
                            </Button>
                          </div>
                        ) : (
                          <p
                            className={[
                              "mt-1 text-[10px]",
                              isOutgoing ? "text-muted-foreground" : "text-white/60",
                            ].join(" ")}
                            dir="ltr"
                          >
                            {new Date(msg.createdAt).toLocaleTimeString("ar-EG", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                        {msg.reaction && (
                          <div className="mt-1 inline-flex items-center rounded-full border border-border bg-background px-1.5 py-0.5 text-sm leading-none shadow-sm">
                            {msg.reaction}
                          </div>
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="flex-shrink-0 border-t border-border px-4 py-3">
              {isOutsideWindow ? (
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
                  {/* Staged attachment preview */}
                  {pendingFile && (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
                      {pendingFile.type.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={URL.createObjectURL(pendingFile)}
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
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPendingFile(f);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="إرفاق ملف"
                      className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                    >
                      <Paperclip />
                    </Button>
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        pendingFile
                          ? "أضف تعليقاً (اختياري)..."
                          : "اكتب ردك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
                      }
                      rows={2}
                      className="flex-1 px-3.5 py-2.5 leading-relaxed"
                      dir="rtl"
                    />
                    <Button
                      size="icon"
                      onClick={() => {
                        if (pendingFile) handleSendMedia(pendingFile);
                        else handleSend();
                      }}
                      disabled={!pendingFile && !reply.trim()}
                      className="h-10 w-10 shrink-0 rounded-xl"
                    >
                      <Send />
                    </Button>
                  </div>
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
    </Card>
  );
}

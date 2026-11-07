"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  MoreHorizontal,
  Reply,
  RotateCw,
  StickyNote,
  Trash2,
  UserRound,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { SenderType } from "@prisma/client";
import { ChatImage } from "@/components/ui/chat-image";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { cn } from "@/lib/utils";
import { MenuItem, formatDuration } from "./shared";
import { quoteAuthor, type RenderedMessage, type RenderedInternalNote } from "./types";

export function MessageBubble({
  msg,
  contactName,
  canReply,
  highlighted,
  escalationHidden,
  escalatedTo,
  currentUserId,
  onReply,
  onJump,
  onResolveEscalation,
  onRetry,
  onAddNote,
  onEscalate,
  onDeleteNote,
}: {
  msg: RenderedMessage;
  contactName: string;
  /** Free-form replies are allowed (a template can't carry a quote). */
  canReply: boolean;
  highlighted: boolean;
  escalationHidden: boolean;
  /** "Escalated to <name>" when a colleague escalation points at this message. */
  escalatedTo?: string | null;
  currentUserId: string;
  onReply: () => void;
  onJump: (id: string) => void;
  onResolveEscalation: (id: string) => void;
  onRetry: (clientId: string) => void;
  onAddNote: () => void;
  onEscalate: () => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOutgoing = msg.senderType === SenderType.ADMIN || msg.senderType === SenderType.AGENT;
  const isAgent = msg.senderType === SenderType.AGENT;
  const status = msg.pending?.status;
  const isFailed = status === "failed_sync" || status === "failed_whatsapp";
  const saved = !!msg.id;
  const voiceSrc = msg.id ? `/api/admin/media/${msg.id}` : msg.voiceLocalUrl;
  const transcribing = msg.voice?.status === "transcribing";

  // Saved messages get the tools: reply (quote), note, escalate to a colleague.
  // Always visible on touch screens (no hover), revealed on hover on desktop.
  const tools = saved ? (
    <div className="flex shrink-0 flex-col items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
      {canReply && (
        <Hint label="رد على هذه الرسالة">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReply}
            aria-label="رد على هذه الرسالة"
            className="text-muted-foreground hover:text-foreground [&_svg]:size-4"
          >
            <Reply />
          </Button>
        </Hint>
      )}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="أدوات الرسالة"
            className="text-muted-foreground hover:text-foreground [&_svg]:size-4"
          >
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-52 rounded-2xl p-1.5">
          {canReply && (
            <MenuItem
              icon={<Reply />}
              label="رد"
              onClick={() => {
                setMenuOpen(false);
                onReply();
              }}
            />
          )}
          <MenuItem
            icon={<StickyNote />}
            label="إضافة ملاحظة"
            onClick={() => {
              setMenuOpen(false);
              onAddNote();
            }}
          />
          <MenuItem
            icon={<UserRoundPlus />}
            label="تصعيد إلى زميل"
            onClick={() => {
              setMenuOpen(false);
              onEscalate();
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  ) : null;

  return (
    <div
      className={cn("group flex items-center gap-1", isOutgoing ? "justify-start" : "justify-end")}
    >
      {/* Tools sit on the bubble's inner side: after an outgoing one, before an incoming one. */}
      {!isOutgoing && tools}
      <div className="flex max-w-[85%] flex-col gap-1 md:max-w-[70%]">
        <div
          id={msg.id ? `msg-${msg.id}` : undefined}
          className={cn(
            "rounded-2xl px-3.5 py-2 font-sans text-sm leading-relaxed transition-[opacity,box-shadow]",
            isAgent
              ? "rounded-ss-sm border border-accent/20 bg-accent/10 text-foreground"
              : isOutgoing
                ? isFailed
                  ? "rounded-ss-sm border border-red-200 bg-red-50 text-foreground"
                  : "rounded-ss-sm bg-muted text-foreground"
                : "rounded-se-sm bg-primary text-white",
            status === "sending" && "opacity-50",
            highlighted && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background"
          )}
        >
          {isAgent && (
            <p className="mb-0.5 text-[10px] font-medium text-accent">
              🤖 {msg.agentName ?? "المساعد الذكي"}
            </p>
          )}
          {msg.senderType === SenderType.ADMIN && msg.senderName && (
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-primary">
              <UserRound className="h-3 w-3" />
              {msg.senderName}
            </p>
          )}
          {msg.replyTo && (
            <button
              type="button"
              onClick={() => onJump(msg.replyTo!.id)}
              className={cn(
                "mb-1.5 block w-full rounded-lg border-s-[3px] px-2 py-1 text-start transition-colors",
                isOutgoing
                  ? "border-primary bg-foreground/5 hover:bg-foreground/10"
                  : "border-white/70 bg-white/15 hover:bg-white/25"
              )}
            >
              <span
                className={cn(
                  "block text-[11px] font-semibold",
                  isOutgoing ? "text-primary" : "text-white"
                )}
              >
                {quoteAuthor(msg.replyTo, contactName)}
              </span>
              <span
                className={cn(
                  "line-clamp-2 block text-xs",
                  isOutgoing ? "text-muted-foreground" : "text-white/80"
                )}
              >
                {msg.replyTo.snippet || "رسالة"}
              </span>
            </button>
          )}
          {(msg.voice || msg.voiceLocalUrl) && (
            <div className="mb-1">
              {msg.voice?.status === "failed" && msg.senderType === SenderType.USER ? (
                <p className="flex items-center gap-1 text-[11px] text-red-600">
                  🎤 تعذّر تفريغ الرسالة الصوتية
                </p>
              ) : (
                <audio
                  controls
                  preload="none"
                  src={voiceSrc}
                  className="h-9 w-full max-w-[240px]"
                />
              )}
              {typeof (msg.voice?.durationSec ?? msg.pending?.voice?.durationSec) === "number" && (
                <span
                  className={cn(
                    "mt-0.5 block text-[10px]",
                    isOutgoing ? "text-muted-foreground" : "text-white/70"
                  )}
                  dir="ltr"
                >
                  🎤{" "}
                  {formatDuration(
                    (msg.voice?.durationSec ?? msg.pending?.voice?.durationSec) as number
                  )}
                </span>
              )}
              {transcribing && (
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جارٍ تفريغ النص...
                </span>
              )}
            </div>
          )}
          {msg.media && (msg.id || msg.mediaLocalUrl) && (
            <div className="mb-1">
              {(() => {
                const mediaUrl = msg.id ? `/api/admin/media/${msg.id}` : msg.mediaLocalUrl;
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
            // A voice note's content IS its transcript (a placeholder while a
            // staff note is still transcribing — hidden then).
            msg.content &&
            !transcribing &&
            !msg.pending?.voice && <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          )}
          {msg.escalation && !escalationHidden && (
            <Alert
              variant="warning"
              className="mt-1.5 items-center rounded-lg border-amber-300 px-2 py-1 text-[11px] text-amber-800"
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1">{escalationReasonLabel(msg.escalation.reason)}</span>
              <Button
                size="sm"
                onClick={() => onResolveEscalation(msg.escalation!.id)}
                className="h-auto gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-xs hover:bg-amber-700 [&_svg]:size-3"
              >
                <CheckCircle2 />
                تحديد كمحلولة
              </Button>
            </Alert>
          )}
          {escalatedTo && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-[10px] font-medium",
                isOutgoing ? "text-amber-700" : "text-amber-100"
              )}
            >
              <UserRoundPlus className="h-3 w-3" />
              مُصعّدة إلى {escalatedTo}
            </p>
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
                onClick={() => onRetry(msg.pending!.clientId)}
                className="h-auto gap-1 p-0 text-xs text-[inherit] underline hover:no-underline [&_svg]:size-3"
              >
                <RotateCw />
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <p
              className={cn(
                "mt-1 text-[10px]",
                isOutgoing ? "text-muted-foreground" : "text-white/60"
              )}
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

        {/* Staff notes on this message — never sent, never seen by the AI. */}
        {msg.notes?.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-sans text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
              isOutgoing ? "self-start" : "self-end"
            )}
          >
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="whitespace-pre-wrap break-words">{n.content}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700/80 dark:text-amber-300/80">
                {n.visibility === "CLINIC" ? (
                  <Users className="h-2.5 w-2.5" />
                ) : (
                  <Lock className="h-2.5 w-2.5" />
                )}
                {n.authorId === currentUserId ? "أنت" : n.authorName}
              </p>
            </div>
            {n.authorId === currentUserId && (
              <button
                type="button"
                onClick={() => onDeleteNote(n.id)}
                aria-label="حذف الملاحظة"
                className="shrink-0 rounded p-0.5 text-amber-700/60 hover:bg-amber-100 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {isOutgoing && tools}
    </div>
  );
}

/** A staff-only internal message, centred and visually distinct. */
export function InternalNoteBubble({
  note,
  currentUserId,
  onDelete,
}: {
  note: RenderedInternalNote;
  currentUserId: string;
  onDelete: (id: string) => void;
}) {
  const mine = note.authorId === currentUserId;
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "w-full max-w-[90%] rounded-2xl border border-dashed border-amber-400 bg-amber-50 px-3.5 py-2 font-sans text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50 md:max-w-[75%]",
          note.pending && "opacity-60"
        )}
      >
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          <Lock className="h-3 w-3" />
          ملاحظة داخلية · {mine ? "أنت" : (note.authorName ?? "عضو في الفريق")}
          <span className="font-normal opacity-70">· لا تُرسل للعميل</span>
        </p>
        <p className="whitespace-pre-wrap break-words">{note.content}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-amber-700/70" dir="ltr">
            {new Date(note.createdAt).toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {mine && !note.pending && (
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              aria-label="حذف الملاحظة"
              className="rounded p-0.5 text-amber-700/60 hover:bg-amber-100 hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Headset, FileText, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// ToolCallCard is temporarily unused — tool cards are hidden in the web chat
// (issue #71). Keep this import handy for when the UI is re-enabled.
// import { ToolCallCard } from "./tool-cards";
import { ChatImage } from "@/components/ui/chat-image";
import type { ChatMessage } from "./types";
import { Button } from "@/components/ui/button";

/** Renders a media attachment (image/video/document) sent in the chat. */
function MediaAttachment({ media }: { media: NonNullable<ChatMessage["media"]> }) {
  if (media.kind === "image") {
    return (
      <ChatImage
        src={media.url}
        alt={media.caption ?? "صورة"}
        width={media.width}
        height={media.height}
        maxWidth={260}
      />
    );
  }
  if (media.kind === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media.url} alt="ملصق" loading="lazy" className="h-24 w-24 object-contain" />;
  }
  if (media.kind === "video") {
    return (
      <video controls preload="none" src={media.url} className="max-h-64 max-w-full rounded-lg" />
    );
  }
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs font-normal hover:bg-muted"
    >
      <a href={media.url} target="_blank" rel="noopener noreferrer">
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="max-w-[180px] truncate">{media.filename ?? "ملف مرفق"}</span>
        <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
      </a>
    </Button>
  );
}

/** Who wrote a quoted message, from the patient's point of view. */
const QUOTE_AUTHOR: Record<ChatMessage["role"], string> = {
  user: "أنت",
  agent: "خدمة العملاء",
  admin: "أحد الموظفين",
};

/** Scrolls to the quoted message and flashes it. The widget only loads the live
 *  session, so an older quote has nothing to jump to — the preview still reads. */
function jumpTo(id: string) {
  const el = document.getElementById(`chat-msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-amber-400");
  setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1600);
}

/** The message a reply quotes, WhatsApp-style. `onPrimary` = inside the
 *  patient's own (primary-coloured) bubble. */
function QuotedPreview({
  replyTo,
  onPrimary,
}: {
  replyTo: NonNullable<ChatMessage["replyTo"]>;
  onPrimary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => jumpTo(replyTo.id)}
      className={[
        "block w-full rounded-lg border-s-[3px] px-2 py-1 text-start transition-colors",
        onPrimary
          ? "border-white/70 bg-white/15 hover:bg-white/25"
          : "border-primary bg-muted/70 hover:bg-muted",
      ].join(" ")}
    >
      <span
        className={[
          "block text-[11px] font-semibold",
          onPrimary ? "text-white" : "text-primary",
        ].join(" ")}
      >
        {QUOTE_AUTHOR[replyTo.role]}
      </span>
      <span
        className={[
          "line-clamp-2 block text-xs",
          onPrimary ? "text-white/80" : "text-muted-foreground",
        ].join(" ")}
      >
        {replyTo.snippet || "رسالة"}
      </span>
    </button>
  );
}

export default function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isAdmin = message.role === "admin";
  // Jump target for a quote (local optimistic ids are never quoted).
  const anchorId = `chat-msg-${message.id}`;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          id={anchorId}
          className="max-w-[80%] space-y-1 overflow-hidden rounded-2xl rounded-se-sm bg-primary px-3.5 py-2 font-sans text-sm leading-relaxed text-white transition-shadow"
        >
          {message.replyTo && <QuotedPreview replyTo={message.replyTo} onPrimary />}
          {message.audioUrl && (
            <audio controls src={message.audioUrl} className="h-9 w-full max-w-[220px]" />
          )}
          {message.media && <MediaAttachment media={message.media} />}
          {message.content && (
            <p className="break-words [overflow-wrap:anywhere]">{message.content}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      {/* One customer-support avatar for both staff and assistant replies, so
          the conversation reads as a single support desk. */}
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
        <Headset className="h-4 w-4 text-primary" />
      </div>
      <div id={anchorId} className="max-w-[85%] space-y-1 rounded-2xl transition-shadow">
        {isAdmin && <p className="text-[10px] font-medium text-primary">أحد الموظفين</p>}
        {message.replyTo && <QuotedPreview replyTo={message.replyTo} />}
        {(message.content || message.streaming) && (
          <div className="prose prose-sm prose-neutral max-w-none break-words rounded-2xl rounded-ss-sm bg-muted px-3.5 py-2 font-sans text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {message.streaming && !message.content && (
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0.3s]" />
              </span>
            )}
          </div>
        )}
        {message.audioUrl && (
          // Spoken (TTS) reply. autoPlay only for a reply that just arrived (the
          // patient just sent voice, so a gesture exists); reloaded history keeps
          // controls but never autoplays. Controls remain as a fallback if the
          // browser blocks autoplay.
          <audio
            controls
            autoPlay={!!message.autoPlayAudio}
            src={message.audioUrl}
            className="h-9 w-full max-w-[240px]"
          />
        )}
        {message.media && (
          <div className="rounded-2xl rounded-ss-sm bg-muted px-3 py-2">
            <MediaAttachment media={message.media} />
          </div>
        )}
        {/* Tool-execution cards are intentionally hidden in the patient web chat
            (issue #71). The toolCalls data is still carried on the message and
            persisted in metadata — only the UI is suppressed for now; re-enable
            by rendering ToolCallCard again. */}
        {/* {message.toolCalls?.map((call, i) => (
          <ToolCallCard key={i} call={call} />
        ))} */}
      </div>
    </div>
  );
}

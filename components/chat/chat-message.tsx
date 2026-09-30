"use client";

import { Bot, Headset, FileText, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolCallCard } from "./tool-cards";
import { ChatImage } from "@/components/ui/chat-image";
import type { ChatMessage } from "./types";

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
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs hover:bg-muted"
    >
      <FileText className="h-4 w-4 flex-shrink-0" />
      <span className="max-w-[180px] truncate">{media.filename ?? "ملف مرفق"}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
    </a>
  );
}

export default function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isAdmin = message.role === "admin";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] space-y-1 overflow-hidden rounded-2xl rounded-se-sm bg-primary px-3.5 py-2 font-sans text-sm leading-relaxed text-white">
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
      <div
        className={[
          "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
          isAdmin ? "bg-primary/15" : "bg-accent/15",
        ].join(" ")}
      >
        {isAdmin ? (
          <Headset className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-accent" />
        )}
      </div>
      <div className="max-w-[85%] space-y-1">
        {isAdmin && <p className="text-[10px] font-medium text-primary">أحد الموظفين</p>}
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
        {message.toolCalls?.map((call, i) => (
          <ToolCallCard key={i} call={call} />
        ))}
      </div>
    </div>
  );
}

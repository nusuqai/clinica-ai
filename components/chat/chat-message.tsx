"use client";

import { Bot, Headset } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolCallCard } from "./tool-cards";
import type { ChatMessage } from "./types";

export default function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isAdmin = message.role === "admin";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-se-sm bg-primary px-3.5 py-2 font-sans text-sm leading-relaxed text-white">
          {message.content}
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
          <div className="prose prose-sm prose-neutral max-w-none rounded-2xl rounded-ss-sm bg-muted px-3.5 py-2 font-sans text-sm leading-relaxed text-foreground dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
        {message.toolCalls?.map((call, i) => (
          <ToolCallCard key={i} call={call} />
        ))}
      </div>
    </div>
  );
}

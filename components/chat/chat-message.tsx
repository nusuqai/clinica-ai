"use client";

import { Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolCallCard } from "./tool-cards";
import type { ChatMessage } from "./types";

export default function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-se-sm bg-primary px-3.5 py-2 text-sm text-white font-sans leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="mt-0.5 w-7 h-7 flex-shrink-0 rounded-full bg-accent/15 flex items-center justify-center">
        <Bot className="w-4 h-4 text-accent" />
      </div>
      <div className="max-w-[85%] space-y-1">
        {(message.content || message.streaming) && (
          <div className="rounded-2xl rounded-ss-sm bg-muted px-3.5 py-2 text-sm text-foreground font-sans leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {message.streaming && !message.content && (
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.3s]" />
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

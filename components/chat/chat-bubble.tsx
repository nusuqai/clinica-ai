"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Bot } from "lucide-react";
import ChatMessageView from "./chat-message";
import { getWebChatMessages } from "@/server/actions/chat";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import type { ChatMessage, ClientToolCall } from "./types";

let idCounter = 0;
const nextId = () => `local-${Date.now()}-${idCounter++}`;

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // TODO: why this is exists ?, the below useEffect it do the samething

  // Resolve the conversation id as soon as the widget mounts, independent of
  // whether the panel has been opened — otherwise the realtime subscription
  // below never starts and admin replies sent before the first open are missed.
  useEffect(() => {
    getWebChatMessages().then((state) => {
      if (state) setConversationId(state.conversationId);
    });
  }, []);

  // Load the active session's history the first time the panel is opened.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    getWebChatMessages().then((state) => {
      if (!state) return;
      setConversationId(state.conversationId);
      setMessages(
        state.messages.map((m) => ({
          id: m.id,
          role:
            m.senderType === "USER"
              ? "user"
              : m.senderType === "ADMIN"
                ? "admin"
                : "agent",
          content: m.content,
          toolCalls:
            (m.metadata?.toolCalls as ClientToolCall[] | undefined) ??
            undefined,
        })),
      );
    });
  }, [open, loaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Admin replies land in the DB straight from the inbox. Realtime payloads
  // come back unauthorized for this role (empty row, 401 in `errors`), so we
  // treat the event as a signal to refetch rather than trusting its content.
  // Agent replies are already streamed in via send(), so only ADMIN messages
  // need this path (deduped by id in case of overlap).
  useRealtimeMessages(conversationId, () => {
    getWebChatMessages().then((state) => {
      if (!state) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newAdminMessages = state.messages
          .filter((m) => m.senderType === "ADMIN" && !existingIds.has(m.id))
          .map((m) => ({
            id: m.id,
            role: "admin" as const,
            content: m.content,
          }));
        return newAdminMessages.length ? [...prev, ...newAdminMessages] : prev;
      });
    });
  });

  const patchAgent = (agentId: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === agentId ? fn(m) : m)));

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);

    const agentId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text },
      {
        id: agentId,
        role: "agent",
        content: "",
        streaming: true,
        toolCalls: [],
      },
    ]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) throw new Error("network");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim());
          handleEvent(agentId, ev);
        }
      }
    } catch {
      patchAgent(agentId, (m) => ({
        ...m,
        streaming: false,
        error: true,
        content: m.content || "تعذّر الاتصال بالمساعد. حاول مرة أخرى.",
      }));
    } finally {
      setStreaming(false);
      patchAgent(agentId, (m) => ({ ...m, streaming: false }));
    }
  }

  function handleEvent(agentId: string, ev: Record<string, unknown>) {
    switch (ev.type) {
      case "token":
        patchAgent(agentId, (m) => ({
          ...m,
          content: m.content + String(ev.text),
        }));
        break;
      case "tool_result":
        patchAgent(agentId, (m) => ({
          ...m,
          toolCalls: [
            ...(m.toolCalls ?? []),
            {
              name: String(ev.name),
              args: {},
              result: (ev.result as Record<string, unknown>) ?? null,
              status: ev.status === "error" ? "error" : "ok",
            },
          ],
        }));
        break;
      case "done":
        patchAgent(agentId, (m) => ({
          ...m,
          streaming: false,
          content: String(ev.text ?? m.content),
        }));
        break;
      case "handoff":
        patchAgent(agentId, (m) => ({
          ...m,
          streaming: false,
          content: "تم تحويل محادثتك إلى أحد الموظفين، سيتم الرد عليك قريباً.",
        }));
        break;
      case "error":
        patchAgent(agentId, (m) => ({
          ...m,
          streaming: false,
          error: true,
          content: String(ev.message ?? "خطأ غير متوقع"),
        }));
        break;
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="المساعد الذكي"
        className="fixed bottom-6 end-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all"
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 end-6 z-40 flex flex-col w-[min(36rem,calc(100vw-3rem))] h-[min(44rem,calc(100vh-8rem))] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-primary text-white flex-shrink-0">
            <Bot className="w-5 h-5" />
            <div>
              <p className="text-sm font-heading font-semibold">
                المساعد الذكي
              </p>
              <p className="text-[11px] text-white/70">
                يساعدك على إنجاز مهامك
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3" dir="rtl">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 h-full text-center text-muted-foreground px-6">
                <Bot className="w-10 h-10 opacity-30" />
                <p className="text-xs font-sans">
                  مرحباً! كيف يمكنني مساعدتك اليوم؟ يمكنني حجز المواعيد والإجابة
                  عن استفساراتك.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <ChatMessageView key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-3 border-t border-border flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="اكتب رسالتك..."
                rows={1}
                disabled={streaming}
                dir="rtl"
                className="flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 max-h-40 overflow-y-auto leading-relaxed"
              />
              <button
                onClick={send}
                disabled={streaming || !input.trim()}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

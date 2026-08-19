import "server-only";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { SenderType } from "@prisma/client";
import { createModel } from "./model";
import { getToolsForRole } from "./tools";
import { buildSystemPrompt } from "./prompts";
import type { AgentContext, ToolCallRecord, TokenUsage } from "./types";

export type { AgentContext } from "./types";

export interface PriorMessage {
  senderType: SenderType;
  content: string;
  toolCalls?: ToolCallRecord[];
}

/** Events streamed to the web SSE layer as the agent works. */
export type AgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | {
      type: "tool_result";
      name: string;
      result: unknown;
      status: "ok" | "error";
    }
  | {
      type: "done";
      text: string;
      toolCalls: ToolCallRecord[];
      usage: TokenUsage;
    }
  | { type: "handoff" };

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

function intFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * How many of the most-recent session messages are fed to the LLM as context.
 * Older messages are dropped from the prompt entirely (they still live in the DB
 * and render in the UI). Caps per-turn input tokens on long conversations.
 */
const HISTORY_LIMIT = intFromEnv("AGENT_HISTORY_LIMIT", 24);

/**
 * Of the kept messages, only the most-recent this-many retain their full raw
 * tool-call results (the big JSON: slot lists, doctor lists, …). Older kept
 * messages are collapsed to the agent's own final text — the model still sees
 * what happened, without re-paying for stale payloads it no longer needs. The
 * IDs a booking references live in the recent window, so accuracy is preserved.
 */
const TOOL_DETAIL_LIMIT = intFromEnv("AGENT_TOOL_DETAIL_LIMIT", 6);

const emptyUsage = (): TokenUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  model: DEFAULT_MODEL,
});

function buildAgent(ctx: AgentContext) {
  return createReactAgent({
    llm: createModel(),
    tools: getToolsForRole(ctx),
    prompt: buildSystemPrompt(ctx),
  });
}

/** A per-turn context line carrying "now" — injected as a separate message so it
 * stays out of the cacheable system-prompt prefix (see prompts.ts). */
function nowContextMessage(): SystemMessage {
  const now = new Date();
  return new SystemMessage(
    `التاريخ والوقت الحالي: ${now.toLocaleString("ar-EG", {
      dateStyle: "full",
      timeStyle: "short",
    })} (ISO: ${now.toISOString()}).`,
  );
}

function toLangChainMessages(prior: PriorMessage[]): BaseMessage[] {
  // Keep only the most recent window; older messages stay in the DB/UI but are
  // dropped from the prompt to cap per-turn input tokens.
  const kept =
    prior.length > HISTORY_LIMIT ? prior.slice(-HISTORY_LIMIT) : prior;
  // Below this index, tool-calling turns are collapsed to their final text.
  const detailFrom = Math.max(0, kept.length - TOOL_DETAIL_LIMIT);

  const result: BaseMessage[] = [];
  kept.forEach((m, i) => {
    if (m.senderType === SenderType.USER) {
      result.push(new HumanMessage(m.content));
      return;
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      if (i < detailFrom) {
        // Stale tool turn: replay the agent's own summary, not the raw payloads.
        // The model still knows what happened; it just doesn't re-pay for slot
        // lists / doctor dumps it no longer needs the IDs from.
        result.push(
          new AIMessage(
            m.content ||
              `(تم تنفيذ: ${m.toolCalls.map((tc) => tc.name).join("، ")})`,
          ),
        );
        return;
      }
      // Recent tool turn: reconstruct it in full so the LLM can reference the
      // IDs (doctor ids, slot ids, etc.) returned by previous tool calls.
      result.push(
        new AIMessage({
          content: "",
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args,
          })),
        }),
      );
      for (const tc of m.toolCalls) {
        result.push(
          new ToolMessage({
            content:
              typeof tc.result === "string"
                ? tc.result
                : JSON.stringify(tc.result),
            tool_call_id: tc.id,
          }),
        );
      }
      if (m.content) {
        result.push(new AIMessage(m.content));
      }
      return;
    }
    result.push(new AIMessage(m.content));
  });

  // Give the model "now" without a tool round-trip, placed just before the
  // current (last) user turn so it doesn't disturb the cached prefix.
  const insertAt = result.length > 0 ? result.length - 1 : 0;
  result.splice(insertAt, 0, nowContextMessage());
  return result;
}

function parseToolOutput(output: unknown): unknown {
  const raw =
    typeof output === "string"
      ? output
      : output && typeof output === "object" && "content" in output
        ? (output as { content: unknown }).content
        : output;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Streams the agent's work for the web channel. Yields token/tool events and a
 * final `done` event carrying the assembled text + tool calls for persistence.
 */
export async function* runAgentStream(
  ctx: AgentContext,
  prior: PriorMessage[],
): AsyncGenerator<AgentStreamEvent> {
  const agent = buildAgent(ctx);
  const messages = toLangChainMessages(prior);

  let finalText = "";
  const toolCalls: ToolCallRecord[] = [];
  const pending: { id: string; name: string; args: Record<string, unknown> }[] =
    [];

  // A ReAct turn makes one LLM call per tool-calling round, so token usage is
  // summed across every `on_chat_model_end` event, not read from the last one.
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let usageModel = DEFAULT_MODEL;

  const stream = agent.streamEvents(
    { messages },
    { version: "v2", configurable: { thread_id: ctx.sessionId } },
  );

  for await (const ev of stream) {
    if (ev.event === "on_chat_model_stream") {
      const chunk = ev.data?.chunk as { content?: unknown } | undefined;
      const text = typeof chunk?.content === "string" ? chunk.content : "";
      if (text) {
        finalText += text;
        yield { type: "token", text };
      }
    } else if (ev.event === "on_tool_start") {
      const args = (ev.data?.input ?? {}) as Record<string, unknown>;
      pending.push({ id: ev.run_id, name: ev.name, args });
      yield { type: "tool_start", name: ev.name, args };
    } else if (ev.event === "on_tool_end") {
      const result = parseToolOutput(ev.data?.output);
      const status: "ok" | "error" =
        result && typeof result === "object" && "error" in result
          ? "error"
          : "ok";
      const idx = pending.findIndex(
        (p) => p.id === ev.run_id || p.name === ev.name,
      );
      const entry =
        idx >= 0
          ? pending.splice(idx, 1)[0]
          : { id: ev.run_id, name: ev.name, args: {} };
      toolCalls.push({
        id: entry.id,
        name: ev.name,
        args: entry.args,
        result,
        status,
      });
      yield { type: "tool_result", name: ev.name, result, status };
    } else if (ev.event === "on_chat_model_end") {
      // LangChain surfaces per-call usage on the final AIMessage. Field names
      // are input_tokens / output_tokens / total_tokens; the billed model name
      // is on response_metadata. Sum prompt/completion separately — never derive
      // cost from total_tokens (providers don't always keep it consistent).
      const out = ev.data?.output as
        | {
            usage_metadata?: {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
            };
            response_metadata?: { model_name?: string };
          }
        | undefined;
      const u = out?.usage_metadata;
      if (u) {
        promptTokens += u.input_tokens ?? 0;
        completionTokens += u.output_tokens ?? 0;
        totalTokens += u.total_tokens ?? 0;
      }
      if (out?.response_metadata?.model_name) {
        usageModel = out.response_metadata.model_name;
      }
    }
  }

  yield {
    type: "done",
    text: finalText.trim(),
    toolCalls,
    usage: { promptTokens, completionTokens, totalTokens, model: usageModel },
  };
}

/**
 * Non-streaming run for the WhatsApp channel. Returns final text + tool calls.
 */
export async function runAgentToText(
  ctx: AgentContext,
  prior: PriorMessage[],
): Promise<{ text: string; toolCalls: ToolCallRecord[]; usage: TokenUsage }> {
  let text = "";
  let toolCalls: ToolCallRecord[] = [];
  let usage: TokenUsage = emptyUsage();
  for await (const ev of runAgentStream(ctx, prior)) {
    if (ev.type === "done") {
      text = ev.text;
      toolCalls = ev.toolCalls;
      usage = ev.usage;
    }
  }
  return { text, toolCalls, usage };
}

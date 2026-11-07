import "server-only";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
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
  /** Emitted first on a GUEST turn: the (possibly just-created) conversation id,
   *  so the browser can persist it and reload history / receive admin replies —
   *  a guest has no account to resolve the conversation from. */
  | { type: "init"; conversationId: string }
  | { type: "token"; text: string }
  /** Emitted once for a voice turn: the transcript of the user's audio, so the
   *  UI can render what was understood before the reply streams. */
  | { type: "transcript"; text: string }
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
  | { type: "handoff" }
  /** A spoken (TTS) reply is available for this agent message — the web widget
   *  plays it back via the owner-scoped media endpoint. */
  | { type: "audio"; messageId: string }
  | { type: "error"; message: string };

/** The model assumed when a provider response carries no model name. Exported
 *  so billing can label a usage row it had to synthesize (see agentRunner). */
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

// LangGraph's default (25 steps ≈ 12 tool rounds) is tight once the agent pages
// through lists itself (up to 3 pages per question, see LIST_RULES in prompts).
const RECURSION_LIMIT = 40;

/** The usage of ONE LLM call, minus the model name. */
type CallUsage = Omit<TokenUsage, "model">;

/**
 * Reads one LLM call's billable token counts off its final AIMessage.
 *
 * All counts come from LangChain's usage_metadata; cache reads are a subset of
 * input_tokens, not extra.
 */
function readCallUsage(msg: {
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_token_details?: { cache_read?: number };
  };
}): CallUsage {
  const u = msg.usage_metadata;
  return {
    promptTokens: u?.input_tokens ?? 0,
    completionTokens: u?.output_tokens ?? 0,
    cachedInputTokens: u?.input_token_details?.cache_read ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };
}

function addCallUsage(sum: CallUsage, call: CallUsage): void {
  sum.promptTokens += call.promptTokens;
  sum.completionTokens += call.completionTokens;
  sum.cachedInputTokens += call.cachedInputTokens;
  sum.totalTokens += call.totalTokens;
}

function emptyUsage(): CallUsage {
  return { promptTokens: 0, completionTokens: 0, cachedInputTokens: 0, totalTokens: 0 };
}

async function buildAgent(ctx: AgentContext) {
  return createReactAgent({
    llm: createModel(),
    tools: await getToolsForRole(ctx),
    prompt: await buildSystemPrompt(ctx),
  });
}

/**
 * Extracts visible reply text from a streamed chunk's content. Chat Completions
 * delivers `content` as a plain string; the Responses API (used for reasoning
 * models) delivers an array of typed parts — we take only the `text` parts, so
 * hidden `reasoning` parts never leak to the patient.
 */
function chunkText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (part && typeof part === "object") {
      const p = part as { type?: string; text?: unknown };
      if (p.type === "text" && typeof p.text === "string") text += p.text;
    }
  }
  return text;
}

function toLangChainMessages(prior: PriorMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  for (const m of prior) {
    if (m.senderType === SenderType.USER) {
      result.push(new HumanMessage(m.content));
    } else if (m.toolCalls && m.toolCalls.length > 0) {
      // Reconstruct the full tool-calling turn so the LLM can reference
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
    } else {
      result.push(new AIMessage(m.content));
    }
  }
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
  const agent = await buildAgent(ctx);
  const messages = toLangChainMessages(prior);

  let finalText = "";
  const toolCalls: ToolCallRecord[] = [];
  const pending: { id: string; name: string; args: Record<string, unknown> }[] =
    [];

  // A ReAct turn makes one LLM call per tool-calling round, so token usage is
  // summed across every `on_chat_model_end` event, not read from the last one.
  const usage = emptyUsage();
  let usageModel = DEFAULT_MODEL;

  const stream = agent.streamEvents(
    { messages },
    { version: "v2", recursionLimit: RECURSION_LIMIT, configurable: { thread_id: ctx.sessionId } },
  );

  for await (const ev of stream) {
    if (ev.event === "on_chat_model_stream") {
      const chunk = ev.data?.chunk as { content?: unknown } | undefined;
      const text = chunkText(chunk?.content);
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
      // LangChain surfaces per-call usage on the final AIMessage; the billed
      // model name is on response_metadata. Sum each token kind separately —
      // never derive cost from total_tokens (providers don't always keep it
      // consistent).
      const out = ev.data?.output as
        | (Parameters<typeof readCallUsage>[0] & {
            response_metadata?: { model_name?: string };
          })
        | undefined;
      if (out) addCallUsage(usage, readCallUsage(out));
      if (out?.response_metadata?.model_name) {
        usageModel = out.response_metadata.model_name;
      }
    }
  }

  yield {
    type: "done",
    text: finalText.trim(),
    toolCalls,
    usage: { ...usage, model: usageModel },
  };
}

/**
 * Non-streaming run for the WhatsApp channel. Returns final text + tool calls.
 */
/**
 * Runs the agent to a single buffered reply — no streaming. Used by channels
 * that deliver one whole message (WhatsApp), so unlike `runAgentStream` this
 * makes a plain `invoke` (no token/SSE events) and reconstructs the reply, tool
 * calls and usage from the final message state.
 */
export async function runAgentToText(
  ctx: AgentContext,
  prior: PriorMessage[],
): Promise<{ text: string; toolCalls: ToolCallRecord[]; usage: TokenUsage }> {
  const agent = await buildAgent(ctx);
  const messages = toLangChainMessages(prior);

  const result = (await agent.invoke(
    { messages },
    { recursionLimit: RECURSION_LIMIT, configurable: { thread_id: ctx.sessionId } },
  )) as { messages?: BaseMessage[] };
  // The final state is the input history FOLLOWED BY this turn's messages. Read
  // only this turn's: re-collecting the replayed history's tool calls would save
  // them onto this reply, and they'd be replayed (and re-collected) next turn —
  // doubling the history every turn.
  const out = (result.messages ?? []).slice(messages.length);

  // Pair each tool_call id with the ToolMessage that carries its result.
  const toolResults = new Map<string, ToolMessage>();
  for (const m of out) {
    if (m instanceof ToolMessage && m.tool_call_id) toolResults.set(m.tool_call_id, m);
  }

  const usage = emptyUsage();
  let usageModel = DEFAULT_MODEL;
  const toolCalls: ToolCallRecord[] = [];
  let finalText = "";

  for (const m of out) {
    // Not `instanceof AIMessage`: a streamed model call (see createModel) yields an
    // AIMessageChunk, which is a sibling class, not a subclass — instanceof would
    // skip every AI message (empty reply, zero usage, no tool calls recorded).
    if (!AIMessage.isInstance(m)) continue;

    addCallUsage(usage, readCallUsage(m));
    const model = (m.response_metadata as { model_name?: string } | undefined)?.model_name;
    if (model) usageModel = model;

    for (const tc of m.tool_calls ?? []) {
      const tm = tc.id ? toolResults.get(tc.id) : undefined;
      const parsed = tm ? parseToolOutput(tm) : null;
      const status: "ok" | "error" =
        tm?.status === "error" ||
        (parsed && typeof parsed === "object" && "error" in parsed)
          ? "error"
          : "ok";
      toolCalls.push({ id: tc.id ?? "", name: tc.name, args: tc.args ?? {}, result: parsed, status });
    }

    // The final answer is the last AI message that carries visible text.
    const text = chunkText(m.content);
    if (text) finalText = text;
  }

  return {
    text: finalText.trim(),
    toolCalls,
    usage: { ...usage, model: usageModel },
  };
}

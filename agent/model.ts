import { ChatOpenAI } from "@langchain/openai";

/**
 * The one place the LLM provider is configured. Swapping to `ChatAnthropic`
 * later only touches this module.
 *
 * Default is a GPT-5.6 reasoning model (Luna): it plans before answering, which
 * the booking flow needs, at a fraction of gpt-4o's cost and with a far larger
 * context window. Reasoning models don't take a `temperature` (they reject a
 * non-default value), so we only set temperature for the older non-reasoning
 * models and instead pass a `reasoning.effort` dial for the 5.x/o-series.
 */

const DEFAULT_MODEL = "gpt-5.6-luna";

/** OpenAI reasoning effort levels (SDK `ReasoningEffort`). Higher = more
 *  thinking → smarter but slower and more output tokens (reasoning tokens are
 *  billed as output). `medium` is a good default for the booking agent. */
type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** gpt-5.x and the o-series are reasoning models; gpt-4o / gpt-4.1 are not. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

export function createModel() {
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  const base = {
    model,
    apiKey: process.env.OPENAI_API_KEY,
    // Surface token usage on streamed runs so `on_chat_model_end` carries
    // `usage_metadata` (needed to meter cost per reply). For reasoning models
    // output_tokens already includes the (hidden) reasoning tokens.
    streamUsage: true,
  };

  if (isReasoningModel(model)) {
    const effort = (process.env.OPENAI_REASONING_EFFORT ?? "medium") as ReasoningEffort;
    // Reasoning + function tools require the Responses API on gpt-5.6 — Chat
    // Completions rejects that combination (which the agent always needs, since
    // it calls tools). `reasoning.effort` is honored here.
    return new ChatOpenAI({ ...base, reasoning: { effort }, useResponsesApi: true });
  }

  return new ChatOpenAI({ ...base, temperature: 0 });
}

import { ChatOpenAI } from "@langchain/openai";

/**
 * The one place the LLM provider is configured. Swapping to `ChatAnthropic`
 * later only touches this module.
 */
export function createModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY,
    // Surface token usage on streamed runs so `on_chat_model_end` carries
    // `usage_metadata` (needed to meter cost per reply).
    streamUsage: true,
  });
}

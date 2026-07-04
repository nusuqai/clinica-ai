import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";

export type R = Record<string, unknown>;

/** Wraps a handler so the LLM gets a JSON string; the parsed object is the card. */
export function jsonTool<S extends z.ZodTypeAny>(
  config: { name: string; description: string; schema: S },
  handler: (input: z.infer<S>) => Promise<unknown>,
): DynamicStructuredTool {
  return tool(async (input) => {
    const result = await handler(input as z.infer<S>);
    return JSON.stringify(result);
  }, config) as DynamicStructuredTool;
}

export const money = (v: unknown) => (v == null ? null : Number(v));
export const timeStr = (d: Date) =>
  new Date(d).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const dateStr = (d: Date) => new Date(d).toISOString().slice(0, 10);

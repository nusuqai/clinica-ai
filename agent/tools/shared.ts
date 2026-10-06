import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { formatSlotTime } from "@/lib/slot-time";

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

// ─── Lists ──────────────────────────────────────────────────────────────────
// Every list tool returns one page: a tool result goes straight into the
// model's context. The model picks the filters itself and fetches the next
// page itself — the user is never asked to narrow a search or pick a page
// (see LIST_RULES in agent/prompts.ts).

/** Appended to every paged tool's description. */
export const LIST_HINT =
  "طبّق المرشّحات بنفسك مما يُفهم من كلام المستخدم. استخدم total للعدّ مباشرة، وإذا كان hasMore=true واحتجت البقية فاطلب nextPage بنفسك.";

/** The `page` argument of a paged tool. */
export const pageField = z
  .number()
  .int()
  .nullable()
  .describe("رقم الصفحة: اتركه فارغاً للأولى، ومرّر nextPage من النتيجة السابقة للتالية");

/** A page's metadata for the model, telling it exactly what to ask for next. */
export function pageInfo(p: { total: number; page: number; hasMore: boolean }) {
  return {
    total: p.total,
    page: p.page,
    hasMore: p.hasMore,
    ...(p.hasMore && { nextPage: p.page + 1 }),
  };
}

export const money = (v: unknown) => (v == null ? null : Number(v));
export const timeStr = (d: Date) => formatSlotTime(d);
export const dateStr = (d: Date) => new Date(d).toISOString().slice(0, 10);

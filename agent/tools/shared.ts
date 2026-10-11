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
// model's context. A broad (unfiltered) request doesn't return rows at
// all: the tool answers `needsFilter` with the choices to offer, the agent asks
// the user one question, then calls again with what they picked. Filters the
// user already gave are applied without asking, and pages are fetched by the
// agent itself — the user never picks a page (see LIST_RULES in agent/prompts.ts).

/** Appended to every paged tool's description. */
export const LIST_HINT =
  "مرّر أي مرشّح ذكره المستخدم أو فُهم من كلامه. إذا أعادت الأداة needsFilter=true فاسأل المستخدم سؤالاً واحداً قصيراً واعرض عليه الخيارات (choices)، ثم أعد الطلب بما اختاره. مرّر showAll=true فقط إذا طلب المستخدم الكل صراحةً. استخدم total للعدّ مباشرة، وإذا كان hasMore=true واحتجت البقية فاطلب nextPage بنفسك.";

/** The `showAll` argument: the user explicitly wants the whole list, unfiltered. */
export const showAllField = z
  .boolean()
  .nullable()
  .describe("true فقط إذا طلب المستخدم القائمة كاملة صراحةً، أو ردّ بأنه يريد الكل");

/** One option the agent offers when asking the user to narrow a list. */
export interface FilterChoice {
  /** What to show the user. */
  label: string;
  /** The tool arguments that select this choice. */
  args: Record<string, unknown>;
  /** How many items it holds, when known. */
  count?: number;
}

/**
 * Whether to ask the user for a filter instead of returning rows: the request
 * had no filter, the user didn't ask for everything, it's the first page, and
 * there is something to choose from (an empty list is reported as empty).
 */
export function shouldAskForFilter(
  filtered: boolean,
  input: { showAll?: boolean | null; page?: number | null },
  total: number,
): boolean {
  return !filtered && !input.showAll && !input.page && total > 0;
}

/** The tool result that makes the agent ask one question with these choices. */
export function askForFilter(total: number, question: string, choices: FilterChoice[]) {
  return { needsFilter: true, total, question, choices };
}

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

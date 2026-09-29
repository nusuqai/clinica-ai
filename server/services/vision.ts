import "server-only";
import type { TokenUsage } from "@/agent/types";

/**
 * Image understanding for patient photos (issue #52).
 *
 * A patient photo is read exactly ONCE: this describes it in Arabic, and the
 * caller stores that description on the message (`metadata.media.analysis`) so
 * every later turn reuses the text instead of re-sending the image. This mirrors
 * how voice notes are transcribed once (see `transcription.ts`).
 *
 * The vision call is a distinct, separately-billed operation — the caller hands
 * the returned `usage` to `chargeExtraction` (see `aiCredit.ts`), a USD-only
 * ledger line that never costs the clinic a unit (same as transcription/TTS).
 *
 * Uses the same chat model as the agent (Responses API), so no new key or model
 * config is needed. Raw `fetch` (no SDK) to match the rest of the integration.
 */

const OPENAI_BASE = "https://api.openai.com/v1";
/** Same model the agent runs on (gpt-5.6-luna is multimodal — verified). */
const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

/** What the vision pass is asked to produce: a faithful Arabic description a
 *  clinic assistant can then reason over, NOT a diagnosis or an answer. */
const DESCRIBE_PROMPT =
  "أنت مساعد لعيادة. صف محتوى هذه الصورة بدقة وإيجاز باللغة العربية حتى يتمكن مساعد آخر " +
  "من فهمها دون رؤيتها. اذكر ما يظهر فعلاً فقط (نص مكتوب، مستند، جزء من الجسم، منتج، إلخ) " +
  "دون تشخيص أو استنتاج طبي. إن كانت الصورة تحتوي نصاً فانقله كما هو.";

export interface ImageDescriptionResult {
  /** Arabic description of the image; empty string if the model returned none. */
  description: string;
  /** Tokens the vision call billed (image tokens are included in input_tokens). */
  usage: TokenUsage;
  /** The model that actually ran — snapshotted onto the usage log. */
  model: string;
}

/** Extracts the concatenated output text from a Responses API payload. */
function extractOutputText(json: Record<string, unknown>): string {
  // The SDK exposes `output_text`; the raw API nests it under output[].content[].
  if (typeof json.output_text === "string") return json.output_text.trim();
  const output = Array.isArray(json.output) ? json.output : [];
  let text = "";
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: string; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string") text += p.text;
    }
  }
  return text.trim();
}

/**
 * Describes an image with the vision model. Returns the Arabic description plus
 * the call's token usage. Throws on an API error so the caller can degrade
 * (archive the image, escalate) rather than answer from a bad description.
 */
export async function describeImage(input: {
  bytes: Buffer;
  mimeType: string;
}): Promise<ImageDescriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  // Strip any codec/parameter suffix; the data URI wants a clean image mime.
  const baseMime = input.mimeType.split(";")[0].trim().toLowerCase() || "image/jpeg";
  const dataUrl = `data:${baseMime};base64,${input.bytes.toString("base64")}`;

  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      // Low effort: describing is a perception task, not a reasoning one — keeps
      // the one-time cost minimal.
      reasoning: { effort: "low" },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: DESCRIBE_PROMPT },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message;
    throw new Error(`image description failed (${res.status}): ${err ?? "unknown error"}`);
  }

  const description = extractOutputText(json);
  const u =
    (json.usage as
      { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined) ?? {};
  const model = typeof json.model === "string" ? json.model : VISION_MODEL;

  return {
    description,
    usage: {
      promptTokens: u.input_tokens ?? 0,
      completionTokens: u.output_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
      model,
    },
    model,
  };
}

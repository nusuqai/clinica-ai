import "server-only";

/**
 * Text-to-speech for agent voice replies (issue #49).
 *
 * Only ever invoked when a clinic's `voiceReplyEnabled` is on AND the patient's
 * turn was itself a voice message (see the runner) — text-in always yields
 * text-out. Output is OGG/Opus, the format WhatsApp accepts as a voice note and
 * that browsers play natively.
 *
 * Billed separately from the agent reply: the caller passes the synthesized
 * `characters` to `chargeTts` (see `aiCredit.ts`).
 */

export interface TtsResult {
  /** OGG/Opus audio bytes. */
  bytes: Buffer;
  mimeType: string;
  /** Character count of the spoken text — the billing basis for TTS. */
  characters: number;
  /** Rough spoken length in seconds (for display); ~14 chars/sec of speech. */
  durationSec: number;
  model: string;
}

const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = process.env.OPENAI_TTS_VOICE ?? "alloy";

/** OpenAI TTS caps input length; keep well under it to avoid a hard reject. */
const MAX_TTS_CHARS = 4000;

/** Synthesizes speech from text. Returns null if TTS is unavailable/failed so
 *  the caller can fall back to a text reply rather than drop the answer. */
export async function synthesizeSpeech(text: string): Promise<TtsResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[tts] OPENAI_API_KEY is not set — falling back to text");
    return null;
  }

  const input = text.slice(0, MAX_TTS_CHARS);
  try {
    const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_TTS_MODEL,
        voice: DEFAULT_TTS_VOICE,
        input,
        // Opus in an OGG container — WhatsApp voice-note compatible.
        response_format: "opus",
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[tts] synthesis failed (${res.status}): ${err}`);
      return null;
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      mimeType: "audio/ogg",
      characters: input.length,
      durationSec: Math.max(1, Math.round(input.length / 14)),
      model: DEFAULT_TTS_MODEL,
    };
  } catch (err) {
    console.error("[tts] synthesis threw — falling back to text:", err);
    return null;
  }
}

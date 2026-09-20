import "server-only";

/**
 * Speech-to-text for patient voice notes (issue #49).
 *
 * Deliberately behind a small `Transcriber` interface: the default is OpenAI
 * `gpt-4o-transcribe` (same key/vendor as the agent, good Arabic, cheap), but a
 * clinic whose dialect it mishears can be swapped to a more accurate provider
 * (e.g. ElevenLabs Scribe) without touching callers. Model is env-configurable.
 *
 * Raw `fetch` (no SDK) to match `lib/meta/whatsapp.ts`'s style and avoid a new
 * dependency. Cost is billed separately from the agent reply — the caller hands
 * `durationSec` to `chargeTranscription` (see `aiCredit.ts`).
 */

export interface TranscriptionInput {
  bytes: Buffer;
  mimeType: string;
  /** ISO-639-1 hint; improves accuracy. Defaults to Arabic for this product. */
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  /** Audio length in seconds (for billing/display); null if undeterminable. */
  durationSec: number | null;
  /** The model that actually ran — snapshotted onto the usage log. */
  model: string;
}

export interface Transcriber {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-transcribe";

/** Nominal bitrates (bits/sec) per mime, used ONLY to estimate duration when
 *  the API doesn't report it. WhatsApp voice notes are OGG/Opus ~16 kbps. */
const NOMINAL_BITRATE: Record<string, number> = {
  "audio/ogg": 16_000,
  "audio/opus": 16_000,
  "audio/amr": 12_200,
  "audio/3gpp": 12_200,
  "audio/mpeg": 128_000,
  "audio/mp4": 96_000,
  "audio/aac": 96_000,
  "audio/wav": 256_000,
  "audio/webm": 32_000,
};

function estimateDurationSec(byteLength: number, mimeType: string): number | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const bitrate = NOMINAL_BITRATE[base];
  if (!bitrate) return null;
  return Math.max(1, Math.round((byteLength * 8) / bitrate));
}

function extForMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/amr": "amr",
    "audio/3gpp": "3gp",
  };
  return map[base] ?? "bin";
}

/** Default OpenAI-backed transcriber. */
class OpenAiTranscriber implements Transcriber {
  constructor(private readonly model: string = DEFAULT_TRANSCRIBE_MODEL) {}

  async transcribe({
    bytes,
    mimeType,
    language = "ar",
  }: TranscriptionInput): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    // whisper-1 supports verbose_json (which returns an exact `duration`);
    // the gpt-4o-* transcribe models only support json/text.
    const supportsVerbose = this.model === "whisper-1";

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      `audio.${extForMime(mimeType)}`
    );
    form.append("model", this.model);
    form.append("language", language);
    form.append("response_format", supportsVerbose ? "verbose_json" : "json");

    const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error as { message?: string } | undefined)?.message;
      throw new Error(`transcription failed (${res.status}): ${err ?? "unknown error"}`);
    }

    const text = typeof json.text === "string" ? json.text.trim() : "";
    // Prefer an API-reported duration, else estimate from the byte size.
    const reported =
      (typeof json.duration === "number" && json.duration) ||
      (typeof (json.usage as { seconds?: number } | undefined)?.seconds === "number" &&
        (json.usage as { seconds: number }).seconds) ||
      null;
    const durationSec = reported
      ? Math.round(reported)
      : estimateDurationSec(bytes.byteLength, mimeType);

    return { text, durationSec, model: this.model };
  }
}

let defaultTranscriber: Transcriber | null = null;

/** The process-wide transcriber (default OpenAI). Pluggable for tests / per-
 *  clinic overrides later. */
export function getTranscriber(): Transcriber {
  if (!defaultTranscriber) defaultTranscriber = new OpenAiTranscriber();
  return defaultTranscriber;
}

/** Convenience wrapper. */
export function transcribeAudio(input: TranscriptionInput): Promise<TranscriptionResult> {
  return getTranscriber().transcribe(input);
}

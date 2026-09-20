import "server-only";
import { createAdminClient } from "./admin";

/**
 * Patient-media storage (issue #49) — voice notes and any other binary a
 * patient sends. Everything here goes through the service-role admin client:
 * the bucket is PRIVATE, so bytes are written server-side and only ever read
 * back through short-lived signed URLs (never a public URL).
 *
 * Layout: `<clinicId>/<conversationId>/<uuid>.<ext>` — per-clinic prefix so a
 * clinic's media is isolated (and RLS can key on the leading path segment),
 * grouped by conversation for easy inspection.
 *
 * The audio bytes live ONLY in the bucket. The database stores a pointer to
 * `path` plus the transcript (see `Message.metadata.voice`); it never holds the
 * audio itself.
 */

/** Private bucket for patient-sent media. Create it per environment (local
 *  stack, dev, prod) — buckets are not part of Prisma migrations. */
export const PATIENT_MEDIA_BUCKET = process.env.PATIENT_MEDIA_BUCKET ?? "patient-media";

/** Default signed-URL lifetime (seconds) — short: URLs are minted on demand
 *  when someone opens the player, not stored. */
const DEFAULT_SIGNED_URL_TTL = 60 * 10; // 10 minutes

/** Strips any `; codecs=…` parameter — MediaRecorder emits
 *  `audio/webm;codecs=opus` and WhatsApp `audio/ogg; codecs=opus`, but the
 *  bucket's allow-list keys on the base type. */
function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** Maps a media mime type to a file extension for the stored object. */
function extForMime(mime: string): string {
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
  // Strip any `; codecs=…` parameter before matching.
  const base = mime.split(";")[0].trim().toLowerCase();
  return map[base] ?? "bin";
}

export interface UploadPatientMediaArgs {
  clinicId: string;
  conversationId: string;
  bytes: ArrayBuffer | Uint8Array | Buffer;
  contentType: string;
}

export interface StoredMedia {
  /** Object path within the bucket — persist this, not a URL. */
  path: string;
  contentType: string;
  /** Byte length of the stored object. */
  size: number;
}

/** Uploads patient media to the private bucket and returns its storage path. */
export async function uploadPatientMedia(args: UploadPatientMediaArgs): Promise<StoredMedia> {
  const { clinicId, conversationId, bytes, contentType } = args;
  const supabase = createAdminClient();

  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Store the base mime (no codec parameter) — that's what the bucket allow-list
  // and players key on.
  const storedType = baseMime(contentType);
  const ext = extForMime(contentType);
  const path = `${clinicId}/${conversationId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(PATIENT_MEDIA_BUCKET).upload(path, body, {
    contentType: storedType,
    upsert: false,
  });
  if (error) {
    throw new Error(`patient-media upload failed: ${error.message}`);
  }

  return { path, contentType: storedType, size: body.byteLength };
}

/**
 * Mints a short-lived signed URL for a stored object so a browser (dashboard or
 * chat bubble) can play it. Returns null if the object is missing or signing
 * fails — callers render a "media unavailable" state rather than crash.
 */
export async function getPatientMediaSignedUrl(
  path: string,
  expiresIn: number = DEFAULT_SIGNED_URL_TTL
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error(`[storage] failed to sign patient-media url for ${path}:`, error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Downloads a stored object's bytes (server-side only — e.g. to forward a
 * TTS-generated reply to WhatsApp's media upload). Returns null on failure.
 */
export async function downloadPatientMedia(path: string): Promise<Buffer | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(PATIENT_MEDIA_BUCKET).download(path);
  if (error || !data) {
    console.error(`[storage] failed to download patient-media ${path}:`, error);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

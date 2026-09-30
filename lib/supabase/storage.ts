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
    // Audio (voice notes).
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/amr": "amr",
    "audio/3gpp": "3gp",
    // Images.
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    // Video.
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "video/quicktime": "mov",
    // Documents.
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/zip": "zip",
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

/** Categorises a mime type into the media kind used for outbound sends + the
 *  stored metadata. Anything non-media is treated as a document. */
export function outboundMediaKind(mime: string): "image" | "video" | "audio" | "document" {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
}

export interface UploadTarget {
  /** Object path within the bucket — persist this once the upload lands. */
  path: string;
  /** One-time token the browser passes to `uploadToSignedUrl`. */
  token: string;
  bucket: string;
}

/**
 * Mints a one-time signed upload URL so a browser (staff, sending an attachment)
 * can upload DIRECTLY to the private bucket — bypassing the server's request body
 * limit, so files up to the bucket's size cap (100 MB) work. The path is minted
 * server-side under the clinic/conversation prefix; the caller uploads with
 * `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)`.
 */
export async function createPatientMediaUploadUrl(args: {
  clinicId: string;
  conversationId: string;
  mimeType: string;
}): Promise<UploadTarget> {
  const supabase = createAdminClient();
  const path = `${args.clinicId}/${args.conversationId}/${crypto.randomUUID()}.${extForMime(args.mimeType)}`;
  const { data, error } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw new Error(`failed to create upload url: ${error?.message ?? "unknown"}`);
  }
  return { path, token: data.token, bucket: PATIENT_MEDIA_BUCKET };
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

/** Deletes a stored object. Best-effort: logs and returns false on failure so a
 *  DB-row delete can still proceed (a stray object is harmless; a stuck row is
 *  not). Lives in the same private bucket as all patient media. */
export async function deletePatientMediaObject(path: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(PATIENT_MEDIA_BUCKET).remove([path]);
  if (error) {
    console.error(`[storage] failed to delete patient-media ${path}:`, error);
    return false;
  }
  return true;
}

// ─── Appointment attachments (lab results, x-rays, documents) ──────────────────

/** The original filename's extension, lower-cased, if it has a sane one;
 *  otherwise derived from the mime type. Keeps a downloaded lab/x-ray file
 *  opening in the right app. */
function extForAttachment(fileName: string, mime: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) {
    const ext = fileName.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
  }
  return extForMime(mime);
}

/**
 * Mints a one-time signed upload URL so a staff browser can upload a visit
 * attachment DIRECTLY to the private bucket — bypassing the server request-body
 * limit, so multi-MB scans/PDFs work. The path is minted server-side under the
 * clinic/appointment prefix; the caller uploads with
 * `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)`.
 *
 * Layout: `<clinicId>/appointments/<appointmentId>/<uuid>.<ext>`.
 */
export async function createAppointmentAttachmentUploadUrl(args: {
  clinicId: string;
  appointmentId: string;
  fileName: string;
  mimeType: string;
}): Promise<UploadTarget> {
  const supabase = createAdminClient();
  const ext = extForAttachment(args.fileName, args.mimeType);
  const path = `${args.clinicId}/appointments/${args.appointmentId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage
    .from(PATIENT_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw new Error(`failed to create attachment upload url: ${error?.message ?? "unknown"}`);
  }
  return { path, token: data.token, bucket: PATIENT_MEDIA_BUCKET };
}

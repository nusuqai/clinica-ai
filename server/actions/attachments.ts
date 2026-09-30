"use server";

import { revalidatePath } from "next/cache";
import { getClinicContext } from "@/lib/auth";
import {
  createAppointmentAttachmentUploadUrl,
  deletePatientMediaObject,
} from "@/lib/supabase/storage";
import { authorizeAppointmentStaffWrite } from "@/server/services/appointmentAccess";
import {
  createAttachment,
  deleteAttachmentRow,
  getAttachment,
  renameAttachmentRow,
} from "@/server/services/attachments";

// Staff (doctor/admin) attach files to a visit from its detail page. The browser
// uploads bytes DIRECTLY to the private bucket via a one-time signed URL (so
// multi-MB scans/PDFs bypass the server body limit), then calls
// confirmAppointmentAttachmentAction to persist the row. Every action here
// re-establishes WHO is asking and WHICH appointment via the request host —
// never trusting the client — through authorizeAppointmentStaffWrite.

// What a clinic may attach: photos/scans, PDFs, and common office documents.
const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

// Hard ceiling mirrored from the bucket cap, enforced again server-side so a
// crafted confirm can't record a bogus size.
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/**
 * Cleans a user-supplied display name: strips path separators and control
 * characters (it's a label, never a real path — the object path is uuid-based),
 * caps the length, and re-attaches the original file's extension when the user
 * dropped it, so the download still opens in the right app. Returns "" when the
 * name is empty after cleaning.
 */
function sanitizeFileName(next: string, original: string): string {
  const base = next
    .replace(/[/\\\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (!base) return "";
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot) : "";
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) {
    return (base + ext).slice(0, 200);
  }
  return base;
}

/** Revalidate every role's detail page for this appointment (cheap; only one
 *  actually exists in any given nav, the others are no-ops). */
function revalidateAppointment(appointmentId: string) {
  for (const role of ["doctor", "admin", "dashboard"]) {
    revalidatePath(`/${role}/appointments/${appointmentId}`, "page");
  }
}

export type CreateAttachmentUploadResult =
  { ok: true; path: string; token: string; bucket: string } | { ok: false; error: string };

/** Mints the signed upload URL for a new visit attachment (staff only). */
export async function createAppointmentAttachmentUploadAction(
  appointmentId: string,
  fileName: string,
  mimeType: string
): Promise<CreateAttachmentUploadResult> {
  const auth = await authorizeAppointmentStaffWrite(appointmentId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const mime = baseMime(mimeType);
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "نوع الملف غير مدعوم" };
  }

  try {
    const target = await createAppointmentAttachmentUploadUrl({
      clinicId: auth.clinicId,
      appointmentId,
      fileName: fileName || "attachment",
      mimeType: mime,
    });
    return { ok: true, path: target.path, token: target.token, bucket: target.bucket };
  } catch (err) {
    console.error("Failed to create attachment upload url:", err);
    return { ok: false, error: "تعذّر تجهيز الرفع" };
  }
}

export type ConfirmAttachmentResult = { ok: true; id: string } | { ok: false; error: string };

/** Persists the attachment row after the browser upload lands (staff only). */
export async function confirmAppointmentAttachmentAction(
  appointmentId: string,
  media: { path: string; fileName: string; contentType: string; size: number }
): Promise<ConfirmAttachmentResult> {
  const auth = await authorizeAppointmentStaffWrite(appointmentId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const mime = baseMime(media.contentType);
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: "نوع الملف غير مدعوم" };
  if (!Number.isFinite(media.size) || media.size <= 0 || media.size > MAX_SIZE) {
    return { ok: false, error: "حجم الملف غير صالح" };
  }
  // Never trust a client-supplied path: it must live under this clinic +
  // appointment's prefix (the same prefix the signed URL was minted for).
  const prefix = `${auth.clinicId}/appointments/${appointmentId}/`;
  if (!media.path.startsWith(prefix)) return { ok: false, error: "مسار غير صالح" };

  const row = await createAttachment({
    clinicId: auth.clinicId,
    appointmentId,
    uploadedById: auth.userId,
    // Staff may rename the file during upload; fall back to a default if blank.
    fileName: sanitizeFileName(media.fileName ?? "", media.fileName ?? "") || "attachment",
    storagePath: media.path,
    contentType: mime,
    size: Math.floor(media.size),
  });

  revalidateAppointment(appointmentId);
  return { ok: true, id: row.id };
}

export type RenameAttachmentResult = { ok: true } | { ok: false; error: string };

/** Renames an existing attachment's display name (staff only, on their own
 *  appointment (doctor) or any in the clinic (admin)). Only the shown/downloaded
 *  name changes — the bytes and storage path are untouched. */
export async function renameAppointmentAttachmentAction(
  attachmentId: string,
  fileName: string
): Promise<RenameAttachmentResult> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  const att = await getAttachment(attachmentId, ctx.clinic.id);
  if (!att) return { ok: false, error: "المرفق غير موجود" };

  const auth = await authorizeAppointmentStaffWrite(att.appointmentId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const clean = sanitizeFileName(fileName, att.fileName);
  if (!clean) return { ok: false, error: "اسم الملف غير صالح" };

  const ok = await renameAttachmentRow(attachmentId, auth.clinicId, clean);
  if (!ok) return { ok: false, error: "تعذّر إعادة تسمية الملف" };

  revalidateAppointment(att.appointmentId);
  return { ok: true };
}

export type DeleteAttachmentResult = { ok: true } | { ok: false; error: string };

/** Removes an attachment (row + bucket object). Staff only, on their own
 *  appointment (doctor) or any in the clinic (admin). */
export async function deleteAppointmentAttachmentAction(
  attachmentId: string
): Promise<DeleteAttachmentResult> {
  // Resolve the attachment's appointment first (clinic-scoped is enforced by the
  // write guard below, which re-checks the clinic via the appointment).
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  const att = await getAttachment(attachmentId, ctx.clinic.id);
  if (!att) return { ok: false, error: "المرفق غير موجود" };

  const auth = await authorizeAppointmentStaffWrite(att.appointmentId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const path = await deleteAttachmentRow(attachmentId, auth.clinicId);
  if (path) await deletePatientMediaObject(path);

  revalidateAppointment(att.appointmentId);
  return { ok: true };
}

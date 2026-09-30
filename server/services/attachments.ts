import "server-only";
import { prisma } from "@/lib/prisma";

// Visit attachments — files (lab results, x-rays, documents) staff attach to an
// appointment from its detail page. The bytes live in the private patient-media
// bucket (see lib/supabase/storage.ts); these rows are pointers + metadata read
// back through short-lived signed URLs. Every query here is clinic-scoped.

export type AttachmentKind = "image" | "pdf" | "document";

/** Coarse category for the UI, from the mime type: image preview, a PDF badge,
 *  or a generic document. */
export function attachmentKind(mime: string): AttachmentKind {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base === "application/pdf") return "pdf";
  return "document";
}

export interface AttachmentView {
  id: string;
  appointmentId: string;
  fileName: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
  createdAt: Date;
  uploadedByName: string;
}

/** One appointment's attachments, newest first, with the uploader's name. */
export async function listAppointmentAttachments(
  appointmentId: string,
  clinicId: string
): Promise<AttachmentView[]> {
  const rows = await prisma.appointmentAttachment.findMany({
    where: { appointmentId, clinicId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      appointmentId: true,
      fileName: true,
      contentType: true,
      size: true,
      kind: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    appointmentId: r.appointmentId,
    fileName: r.fileName,
    contentType: r.contentType,
    size: r.size,
    kind: r.kind as AttachmentKind,
    createdAt: r.createdAt,
    uploadedByName: r.uploadedBy.fullName,
  }));
}

/** Attachments for many appointments at once, grouped by `appointmentId` (newest
 *  first within each group) — so a patient's files can be shown next to their
 *  treatment records without an N+1. Clinic-scoped; appointments with none are
 *  simply absent from the returned map. */
export async function listAttachmentsForAppointments(
  appointmentIds: string[],
  clinicId: string
): Promise<Record<string, AttachmentView[]>> {
  if (appointmentIds.length === 0) return {};
  const rows = await prisma.appointmentAttachment.findMany({
    where: { clinicId, appointmentId: { in: appointmentIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      appointmentId: true,
      fileName: true,
      contentType: true,
      size: true,
      kind: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  });
  const grouped: Record<string, AttachmentView[]> = {};
  for (const r of rows) {
    (grouped[r.appointmentId] ??= []).push({
      id: r.id,
      appointmentId: r.appointmentId,
      fileName: r.fileName,
      contentType: r.contentType,
      size: r.size,
      kind: r.kind as AttachmentKind,
      createdAt: r.createdAt,
      uploadedByName: r.uploadedBy.fullName,
    });
  }
  return grouped;
}

/** Persists an attachment row after the browser has uploaded the bytes. */
export async function createAttachment(args: {
  clinicId: string;
  appointmentId: string;
  uploadedById: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<{ id: string }> {
  const row = await prisma.appointmentAttachment.create({
    data: {
      clinicId: args.clinicId,
      appointmentId: args.appointmentId,
      uploadedById: args.uploadedById,
      storagePath: args.storagePath,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      kind: attachmentKind(args.contentType),
    },
    select: { id: true },
  });
  return row;
}

/** One attachment row (with its storage path) — clinic-scoped. For read routes
 *  and delete. Returns null if it is not in this clinic. */
export async function getAttachment(attachmentId: string, clinicId: string) {
  return prisma.appointmentAttachment.findFirst({
    where: { id: attachmentId, clinicId },
    select: {
      id: true,
      appointmentId: true,
      storagePath: true,
      fileName: true,
      contentType: true,
    },
  });
}

/** Renames an attachment's display file name (clinic-scoped). Only the name
 *  shown in the UI and used for download changes — the stored object path is
 *  left untouched, so no bytes move. Returns false if nothing matched this
 *  clinic. */
export async function renameAttachmentRow(
  attachmentId: string,
  clinicId: string,
  fileName: string
): Promise<boolean> {
  const res = await prisma.appointmentAttachment.updateMany({
    where: { id: attachmentId, clinicId },
    data: { fileName },
  });
  return res.count > 0;
}

/** Deletes an attachment row (clinic-scoped). Returns the storage path so the
 *  caller can remove the bucket object, or null if nothing matched. */
export async function deleteAttachmentRow(
  attachmentId: string,
  clinicId: string
): Promise<string | null> {
  const row = await prisma.appointmentAttachment.findFirst({
    where: { id: attachmentId, clinicId },
    select: { id: true, storagePath: true },
  });
  if (!row) return null;
  await prisma.appointmentAttachment.delete({ where: { id: row.id } });
  return row.storagePath;
}

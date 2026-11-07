"use server";

import { prisma } from "@/lib/prisma";
import { can, getClinicContext, getPermittedContext } from "@/lib/auth";
import {
  createPatientMediaUploadUrl,
  deletePatientMediaObject,
  downloadPatientMedia,
} from "@/lib/supabase/storage";
import { listQuickReplies, type QuickReplyItem } from "@/server/services/inbox";

// The clinic's pool of saved replies. Anyone with `messages` can browse + use
// them inside a conversation; creating, editing and deleting needs the separate
// `quick_replies` permission.

export type QuickReplyResult<T = void> =
  ({ ok: true } & (T extends void ? object : { data: T })) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/** Images live under <clinicId>/quick-replies/ in the patient-media bucket. */
const FOLDER = "quick-replies";

export async function fetchQuickReplies(): Promise<{
  items: QuickReplyItem[];
  canManage: boolean;
}> {
  const ctx = await getPermittedContext("messages");
  if (!ctx) return { items: [], canManage: false };
  return { items: await listQuickReplies(ctx.clinic.id), canManage: can(ctx, "quick_replies") };
}

async function managerContext() {
  const ctx = await getClinicContext();
  if (!ctx || !can(ctx, "quick_replies")) return null;
  return ctx;
}

/** Signed upload slot for a quick-reply image (browser uploads directly). */
export async function createQuickReplyMediaUpload(
  mimeType: string
): Promise<QuickReplyResult<{ path: string; token: string; bucket: string }>> {
  const ctx = await managerContext();
  if (!ctx) return fail("forbidden");
  if (!mimeType.toLowerCase().startsWith("image/")) return fail("الصور فقط مدعومة");
  try {
    const target = await createPatientMediaUploadUrl({
      clinicId: ctx.clinic.id,
      conversationId: FOLDER,
      mimeType,
    });
    return { ok: true, data: target };
  } catch (err) {
    console.error("Failed to create quick-reply upload url:", err);
    return fail("server_error");
  }
}

export interface QuickReplyInput {
  title: string;
  content: string;
  category?: string | null;
  /** A freshly uploaded image (path from createQuickReplyMediaUpload). */
  media?: { path: string; mimeType: string; width?: number; height?: number } | null;
  /** Drop the existing image (edit only). */
  removeMedia?: boolean;
}

function validate(input: QuickReplyInput, clinicId: string): string | null {
  if (!input.title?.trim()) return "العنوان مطلوب";
  if (!input.content?.trim() && !input.media) return "نص الرد مطلوب";
  if (input.title.trim().length > 80) return "العنوان طويل جدًا";
  if (input.content.length > 4000) return "النص طويل جدًا";
  if (input.media && !input.media.path.startsWith(`${clinicId}/${FOLDER}/`)) return "forbidden";
  return null;
}

export async function createQuickReply(input: QuickReplyInput): Promise<QuickReplyResult> {
  const ctx = await managerContext();
  if (!ctx) return fail("forbidden");
  const error = validate(input, ctx.clinic.id);
  if (error) return fail(error);
  if (input.media && !(await downloadPatientMedia(input.media.path))) {
    return fail("لم يكتمل رفع الصورة");
  }

  await prisma.quickReply.create({
    data: {
      clinicId: ctx.clinic.id,
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category?.trim() || null,
      mediaPath: input.media?.path ?? null,
      mediaMimeType: input.media?.mimeType ?? null,
      mediaWidth: input.media?.width ?? null,
      mediaHeight: input.media?.height ?? null,
      createdById: ctx.user.id,
    },
  });
  return { ok: true };
}

export async function updateQuickReply(
  id: string,
  input: QuickReplyInput
): Promise<QuickReplyResult> {
  const ctx = await managerContext();
  if (!ctx) return fail("forbidden");
  const existing = await prisma.quickReply.findFirst({ where: { id, clinicId: ctx.clinic.id } });
  if (!existing) return fail("not_found");
  // An image already on the reply counts as content when the text is cleared.
  const keepsOldMedia = !!existing.mediaPath && !input.removeMedia && !input.media;
  const error = validate(input, ctx.clinic.id);
  if (error && !(error === "نص الرد مطلوب" && keepsOldMedia)) return fail(error);
  if (input.media && !(await downloadPatientMedia(input.media.path))) {
    return fail("لم يكتمل رفع الصورة");
  }

  const replacingMedia = !!input.media || !!input.removeMedia;
  await prisma.quickReply.update({
    where: { id },
    data: {
      title: input.title.trim(),
      content: input.content.trim(),
      category: input.category?.trim() || null,
      ...(replacingMedia
        ? {
            mediaPath: input.media?.path ?? null,
            mediaMimeType: input.media?.mimeType ?? null,
            mediaWidth: input.media?.width ?? null,
            mediaHeight: input.media?.height ?? null,
          }
        : {}),
    },
  });
  // Sent messages hold their own copy, so the old object can go.
  if (replacingMedia && existing.mediaPath && existing.mediaPath !== input.media?.path) {
    await deletePatientMediaObject(existing.mediaPath).catch(() => {});
  }
  return { ok: true };
}

export async function deleteQuickReply(id: string): Promise<QuickReplyResult> {
  const ctx = await managerContext();
  if (!ctx) return fail("forbidden");
  const existing = await prisma.quickReply.findFirst({ where: { id, clinicId: ctx.clinic.id } });
  if (!existing) return fail("not_found");
  await prisma.quickReply.delete({ where: { id } });
  if (existing.mediaPath) await deletePatientMediaObject(existing.mediaPath).catch(() => {});
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OperationStatus, Role } from "@prisma/client";
import { pageRequest } from "@/lib/pagination";
import { getPermittedContext } from "@/lib/auth";
import {
  createOperationAttachmentUploadUrl,
  deletePatientMediaObject,
} from "@/lib/supabase/storage";
import * as Operations from "@/server/services/operations";
import * as UserService from "@/server/services/users";

// Dashboard actions for Operations (العمليات). Every action resolves the caller's
// clinic + branch scope on the server and re-validates its input; nothing the
// client sends is trusted. The same service functions back the team assistant.

export type OperationActionResult =
  { ok: true; conflicts?: string[] } | { ok: false; error: string };

async function auth() {
  const ctx = await getPermittedContext("operations");
  if (!ctx) return null;
  return { clinicId: ctx.clinic.id, scope: ctx.branchIds, actorId: ctx.user.id };
}

const UNAUTHORIZED: OperationActionResult = { ok: false, error: "غير مصرح" };

function refresh(operationId?: string) {
  revalidatePath("/admin/operations", "layout");
  if (operationId) revalidatePath(`/admin/operations/${operationId}`, "page");
  revalidatePath("/admin/patients", "layout");
}

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "بيانات غير صالحة";
}

const id = z.string().uuid("معرّف غير صالح");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "النص طويل جداً")
    .transform((v) => v || null)
    .nullable()
    .optional();
const optId = id
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const optMoney = z
  .number()
  .min(0, "قيمة غير صالحة")
  .max(10_000_000, "قيمة كبيرة جداً")
  .nullable()
  .optional();
const optMinutes = z
  .number()
  .int()
  .min(5, "المدة 5 دقائق على الأقل")
  .max(1440, "المدة أكثر من يوم")
  .nullable()
  .optional();

// ─── Create / update ──────────────────────────────────────────────────────────

const createSchema = z.object({
  patientId: id,
  serviceId: optId,
  name: optText(200),
  doctorId: optId,
  branchId: optId,
  hospitalName: optText(200),
  price: optMoney,
  notes: optText(5000),
  coordinatorId: optId,
});

export async function createOperationAction(
  input: unknown
): Promise<OperationActionResult & { id?: string }> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const res = await Operations.createOperation(a.clinicId, a.scope, a.actorId, {
    ...parsed.data,
    coordinatorId: parsed.data.coordinatorId ?? a.actorId,
  });
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.data.id };
}

const updateSchema = z.object({
  serviceId: optId,
  name: optText(200),
  doctorId: optId,
  branchId: optId,
  hospitalName: optText(200),
  durationMin: optMinutes,
  anesthesia: optText(200),
  price: optMoney,
  notes: optText(5000),
  coordinatorId: optId,
  preOpInstructions: optText(5000),
  postOpInstructions: optText(5000),
  consentSigned: z.boolean().optional(),
  blockSchedule: z.boolean().optional(),
});

export async function updateOperationAction(
  operationId: string,
  input: unknown
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  // undefined = untouched; null = cleared.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  ) as Operations.OperationPatch;
  const res = await Operations.updateOperation(a.clinicId, a.scope, a.actorId, operationId, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true, conflicts: res.data.conflicts };
}

// ─── Schedule / status ────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر التاريخ"),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "اختر الوقت"),
  durationMin: optMinutes,
});

export async function previewScheduleConflictsAction(
  operationId: string,
  input: unknown
): Promise<{ ok: true; conflicts: string[] } | { ok: false; error: string }> {
  const a = await auth();
  if (!a) return UNAUTHORIZED as { ok: false; error: string };
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const op = await Operations.getOperation(a.clinicId, a.scope, operationId);
  if (!op) return { ok: false, error: "العملية غير موجودة" };
  if (!op.doctor) return { ok: true, conflicts: [] };
  const conflicts = await Operations.scheduleConflicts(a.clinicId, {
    doctorId: op.doctor.id,
    date: new Date(`${parsed.data.date}T00:00:00Z`),
    startTime: parsed.data.startTime.padStart(5, "0"),
    durationMin: parsed.data.durationMin ?? op.durationMin,
    excludeOperationId: op.id,
  });
  return { ok: true, conflicts };
}

export async function scheduleOperationAction(
  operationId: string,
  input: unknown
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const res = await Operations.scheduleOperation(a.clinicId, a.scope, a.actorId, operationId, {
    date: parsed.data.date,
    startTime: parsed.data.startTime,
    durationMin: parsed.data.durationMin ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true, conflicts: res.data.conflicts };
}

export async function setOperationStatusAction(
  operationId: string,
  status: OperationStatus,
  reason?: string | null
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  if (!Object.values(OperationStatus).includes(status))
    return { ok: false, error: "حالة غير صالحة" };
  const res = await Operations.setOperationStatus(
    a.clinicId,
    a.scope,
    a.actorId,
    operationId,
    status,
    reason
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function addChecklistItemsAction(
  operationId: string,
  labels: string[]
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  if (!Array.isArray(labels) || labels.some((l) => typeof l !== "string"))
    return { ok: false, error: "بيانات غير صالحة" };
  const res = await Operations.addChecklistItems(
    a.clinicId,
    a.scope,
    a.actorId,
    operationId,
    labels
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

export async function setChecklistItemDoneAction(
  operationId: string,
  itemId: string,
  done: boolean
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const res = await Operations.setChecklistItemDone(a.clinicId, a.scope, a.actorId, itemId, done);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

export async function removeChecklistItemAction(
  operationId: string,
  itemId: string
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const res = await Operations.removeChecklistItem(a.clinicId, a.scope, a.actorId, itemId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.number().min(0.01, "أدخل المبلغ").max(10_000_000, "مبلغ كبير جداً"),
  method: optText(60),
  note: optText(500),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export async function addOperationPaymentAction(
  operationId: string,
  input: unknown
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const res = await Operations.addPayment(a.clinicId, a.scope, a.actorId, operationId, {
    amount: parsed.data.amount,
    method: parsed.data.method,
    note: parsed.data.note,
    paidAt: parsed.data.paidAt ? new Date(`${parsed.data.paidAt}T12:00:00Z`) : null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

export async function removeOperationPaymentAction(
  operationId: string,
  paymentId: string
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const res = await Operations.removePayment(a.clinicId, a.scope, a.actorId, paymentId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(operationId);
  return { ok: true };
}

// ─── Message to the patient ───────────────────────────────────────────────────

const KINDS = ["details", "preop", "postop", "custom"] as const;

export async function previewOperationMessageAction(
  operationId: string,
  kind: Operations.OperationMessageKind,
  customText?: string | null
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const a = await auth();
  if (!a) return { ok: false, error: "غير مصرح" };
  if (!KINDS.includes(kind)) return { ok: false, error: "نوع غير صالح" };
  const res = await Operations.previewOperationMessage(
    a.clinicId,
    a.scope,
    operationId,
    kind,
    customText
  );
  return res.ok ? { ok: true, text: res.data.text } : { ok: false, error: res.error };
}

export async function sendOperationMessageAction(
  operationId: string,
  kind: Operations.OperationMessageKind,
  customText?: string | null
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  if (!KINDS.includes(kind)) return { ok: false, error: "نوع غير صالح" };
  try {
    const res = await Operations.sendOperationMessage(
      a.clinicId,
      a.scope,
      a.actorId,
      operationId,
      kind,
      customText
    );
    if (!res.ok) return { ok: false, error: res.error };
  } catch (e) {
    console.error("operation message send failed", e);
    return { ok: false, error: "تعذّر إرسال الرسالة عبر واتساب" };
  }
  refresh(operationId);
  revalidatePath("/admin/messages", "page");
  return { ok: true };
}

// ─── Attachments ──────────────────────────────────────────────────────────────

const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const MAX_SIZE = 25 * 1024 * 1024;

const baseMime = (m: string) => m.split(";")[0].trim().toLowerCase();

export async function createOperationAttachmentUploadAction(
  operationId: string,
  fileName: string,
  mimeType: string
): Promise<
  { ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }
> {
  const a = await auth();
  if (!a) return { ok: false, error: "غير مصرح" };
  const mime = baseMime(mimeType);
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: "نوع الملف غير مدعوم" };
  const op = await Operations.getOperation(a.clinicId, a.scope, operationId);
  if (!op) return { ok: false, error: "العملية غير موجودة" };
  try {
    const t = await createOperationAttachmentUploadUrl({
      clinicId: a.clinicId,
      operationId,
      fileName: fileName || "attachment",
      mimeType: mime,
    });
    return { ok: true, ...t };
  } catch (e) {
    console.error("operation attachment upload url failed", e);
    return { ok: false, error: "تعذّر تجهيز الرفع" };
  }
}

export async function confirmOperationAttachmentAction(
  operationId: string,
  media: { path: string; fileName: string; contentType: string; size: number }
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const mime = baseMime(media.contentType);
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: "نوع الملف غير مدعوم" };
  if (!Number.isFinite(media.size) || media.size <= 0 || media.size > MAX_SIZE)
    return { ok: false, error: "حجم الملف غير صالح" };
  // The path must be the one minted for this clinic + case.
  if (!media.path.startsWith(`${a.clinicId}/operations/${operationId}/`))
    return { ok: false, error: "مسار غير صالح" };
  const op = await Operations.getOperation(a.clinicId, a.scope, operationId);
  if (!op) return { ok: false, error: "العملية غير موجودة" };
  const fileName =
    (media.fileName ?? "")
      .replace(/[/\\\r\n\t]/g, " ")
      .trim()
      .slice(0, 200) || "attachment";
  await Operations.createOperationAttachment({
    clinicId: a.clinicId,
    operationId,
    uploadedById: a.actorId,
    storagePath: media.path,
    fileName,
    contentType: mime,
    size: Math.floor(media.size),
  });
  refresh(operationId);
  return { ok: true };
}

export async function deleteOperationAttachmentAction(
  operationId: string,
  attachmentId: string
): Promise<OperationActionResult> {
  const a = await auth();
  if (!a) return UNAUTHORIZED;
  const path = await Operations.deleteOperationAttachment(
    a.clinicId,
    a.scope,
    a.actorId,
    attachmentId
  );
  if (!path) return { ok: false, error: "الملف غير موجود" };
  await deletePatientMediaObject(path).catch((e) =>
    console.error("operation attachment object delete failed", e)
  );
  refresh(operationId);
  return { ok: true };
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/** Patient search for the "new operation" form. */
export async function searchOperationPatientsAction(
  query: string
): Promise<{ id: string; fullName: string; phone: string | null }[]> {
  const a = await auth();
  if (!a || !query.trim()) return [];
  const page = await UserService.listUsers(
    a.clinicId,
    { query, role: Role.PATIENT },
    pageRequest(1, 8)
  );
  return page.items.map((u) => ({ id: u.id, fullName: u.fullName, phone: u.phone }));
}

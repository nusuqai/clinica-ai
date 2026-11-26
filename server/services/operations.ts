import "server-only";
import {
  AppointmentStatus,
  OperationSource,
  OperationStatus,
  Prisma,
  Role,
  SenderType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import { normalizeHHMM } from "@/lib/availability/modes";
import { isWithinWhatsappWindow } from "@/lib/meta/window";
import { formatSlotDate } from "@/lib/slot-time";
import { formatFee } from "@/lib/currency";
import {
  hasServiceWindow,
  resolveWhatsappTransport,
  sendWhatsAppText,
} from "@/lib/whatsapp/transport";
import {
  OPERATION_STATUS_LABEL,
  OPERATION_TRANSITIONS,
  dateKey,
  formatHHMMAr,
  hhmmToMinutes,
  isSchedulable,
  operationLocation,
} from "@/lib/operations";
import { err, ok, type Result } from "./_result";
import { conversationRecipient, getWhatsappThread } from "./whatsappThread";
import { resolveActiveSession } from "./agentSession";
import { attachmentKind, type AttachmentKind } from "./attachments";

/**
 * Operations (العمليات) — surgeries run as team-managed cases. Design and rules:
 * docs/operations.md. Everything here is clinic-scoped; `scope` is the caller's
 * branch scope (null = all branches). A case at an outside hospital (no branch)
 * belongs to the whole clinic, so branch-limited members see it too.
 *
 * Patients never create a scheduled operation: the patient AI may only open a
 * REQUESTED case (`requestOperationFromPatient`); every other change is the
 * team's, from the dashboard or the team assistant.
 */

/** Minutes blocked on the surgeon's schedule when the case has no duration. */
export const DEFAULT_OPERATION_MINUTES = 120;
const MAX_MONEY = 10_000_000;

const OPEN_APPT: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

// ─── Scope ────────────────────────────────────────────────────────────────────

/** WHERE fragment: the cases a member may see (their branches + hospital cases). */
export function operationScopeWhere(scope: BranchScope): Prisma.OperationWhereInput {
  if (scope === null) return {};
  return { OR: [{ branchId: null }, { branchId: { in: [...scope] } }] };
}

function inOpScope(scope: BranchScope, branchId: string | null): boolean {
  return scope === null || branchId === null || scope.includes(branchId);
}

// ─── Views ────────────────────────────────────────────────────────────────────

export interface OperationListItem {
  id: string;
  name: string;
  status: OperationStatus;
  source: OperationSource;
  patient: { id: string; fullName: string; phone: string | null };
  doctor: { id: string; fullName: string } | null;
  branchId: string | null;
  location: string;
  /** "YYYY-MM-DD" (clinic wall-clock day) or null. */
  scheduledDate: string | null;
  startTime: string | null;
  durationMin: number | null;
  price: number | null;
  paid: number;
  remaining: number | null;
  checklistDone: number;
  checklistTotal: number;
  consentSigned: boolean;
  coordinator: { id: string; fullName: string } | null;
  createdAt: Date;
}

export interface OperationDetail extends OperationListItem {
  serviceId: string | null;
  serviceName: string | null;
  hospitalName: string | null;
  branchName: string | null;
  branchAddress: string | null;
  anesthesia: string | null;
  notes: string | null;
  requestNote: string | null;
  preOpInstructions: string | null;
  postOpInstructions: string | null;
  blockSchedule: boolean;
  cancelReason: string | null;
  doneAt: Date | null;
  conversationId: string | null;
  checklist: { id: string; label: string; done: boolean; doneAt: Date | null }[];
  payments: {
    id: string;
    amount: number;
    method: string | null;
    note: string | null;
    paidAt: Date;
  }[];
  events: { id: string; type: string; text: string; createdAt: Date; actorName: string | null }[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    kind: AttachmentKind;
    createdAt: Date;
    uploadedByName: string;
  }[];
}

const listSelect = {
  id: true,
  name: true,
  status: true,
  source: true,
  branchId: true,
  hospitalName: true,
  scheduledDate: true,
  startTime: true,
  durationMin: true,
  price: true,
  consentSigned: true,
  createdAt: true,
  patient: { select: { id: true, fullName: true, phone: true } },
  doctor: { select: { id: true, fullName: true } },
  branch: { select: { name: true, address: true } },
  coordinator: { select: { id: true, fullName: true } },
  payments: { select: { amount: true } },
  checklist: { select: { doneAt: true } },
} satisfies Prisma.OperationSelect;

type ListRow = Prisma.OperationGetPayload<{ select: typeof listSelect }>;

function money(v: Prisma.Decimal | null | undefined): number | null {
  return v == null ? null : Number(v);
}

function toListItem(r: ListRow): OperationListItem {
  const paid = r.payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    source: r.source,
    patient: r.patient,
    doctor: r.doctor,
    branchId: r.branchId,
    location: operationLocation(r),
    scheduledDate: r.scheduledDate ? dateKey(r.scheduledDate) : null,
    startTime: r.startTime,
    durationMin: r.durationMin,
    price: money(r.price),
    paid: Number(paid),
    remaining: r.price ? Number(r.price.minus(paid)) : null,
    checklistDone: r.checklist.filter((c) => c.doneAt).length,
    checklistTotal: r.checklist.length,
    consentSigned: r.consentSigned,
    coordinator: r.coordinator,
    createdAt: r.createdAt,
  };
}

export interface OperationFilter {
  statuses?: OperationStatus[];
  doctorId?: string | null;
  patientId?: string | null;
  coordinatorId?: string | null;
  /** Scheduled between these days ("YYYY-MM-DD", inclusive). */
  from?: string | null;
  to?: string | null;
  /** Patient name / phone or operation name. */
  query?: string | null;
}

function filterWhere(clinicId: string, scope: BranchScope, f: OperationFilter) {
  const q = f.query?.trim();
  const and: Prisma.OperationWhereInput[] = [operationScopeWhere(scope)];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { patient: { fullName: { contains: q, mode: "insensitive" } } },
        { patient: { phone: { contains: q.replace(/\D/g, "") || q } } },
      ],
    });
  }
  if (f.from || f.to) {
    and.push({
      scheduledDate: {
        ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
        ...(f.to ? { lte: new Date(`${f.to}T00:00:00Z`) } : {}),
      },
    });
  }
  return {
    clinicId,
    ...(f.statuses?.length ? { status: { in: f.statuses } } : {}),
    ...(f.doctorId ? { doctorId: f.doctorId } : {}),
    ...(f.patientId ? { patientId: f.patientId } : {}),
    ...(f.coordinatorId ? { coordinatorId: f.coordinatorId } : {}),
    AND: and,
  } satisfies Prisma.OperationWhereInput;
}

/** Cases matching a filter: scheduled ones by date (soonest first), the rest newest first. */
export async function listOperations(
  clinicId: string,
  scope: BranchScope,
  filter: OperationFilter = {},
  page: { take?: number; skip?: number } = {}
): Promise<{ items: OperationListItem[]; total: number }> {
  const where = filterWhere(clinicId, scope, filter);
  const [rows, total] = await Promise.all([
    prisma.operation.findMany({
      where,
      select: listSelect,
      orderBy: [
        { scheduledDate: { sort: "asc", nulls: "last" } },
        { startTime: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: page.take ?? 200,
      skip: page.skip ?? 0,
    }),
    prisma.operation.count({ where }),
  ]);
  return { items: rows.map(toListItem), total };
}

/** How many cases sit in each status (for the list tabs). */
export async function countOperationsByStatus(
  clinicId: string,
  scope: BranchScope
): Promise<Record<OperationStatus, number>> {
  const rows = await prisma.operation.groupBy({
    by: ["status"],
    where: { clinicId, ...operationScopeWhere(scope) },
    _count: { _all: true },
  });
  const out = Object.fromEntries(Object.values(OperationStatus).map((s) => [s, 0])) as Record<
    OperationStatus,
    number
  >;
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

export async function getOperation(
  clinicId: string,
  scope: BranchScope,
  operationId: string
): Promise<OperationDetail | null> {
  const r = await prisma.operation.findFirst({
    where: { id: operationId, clinicId, ...operationScopeWhere(scope) },
    select: {
      ...listSelect,
      serviceId: true,
      service: { select: { name: true } },
      anesthesia: true,
      notes: true,
      requestNote: true,
      preOpInstructions: true,
      postOpInstructions: true,
      blockSchedule: true,
      cancelReason: true,
      doneAt: true,
      conversationId: true,
      checklist: {
        select: { id: true, label: true, doneAt: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      payments: {
        select: { id: true, amount: true, method: true, note: true, paidAt: true },
        orderBy: { paidAt: "asc" },
      },
      events: {
        select: {
          id: true,
          type: true,
          text: true,
          createdAt: true,
          actor: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      attachments: {
        select: {
          id: true,
          fileName: true,
          contentType: true,
          size: true,
          kind: true,
          createdAt: true,
          uploadedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!r) return null;
  return {
    ...toListItem(r),
    serviceId: r.serviceId,
    serviceName: r.service?.name ?? null,
    hospitalName: r.hospitalName,
    branchName: r.branch?.name ?? null,
    branchAddress: r.branch?.address ?? null,
    anesthesia: r.anesthesia,
    notes: r.notes,
    requestNote: r.requestNote,
    preOpInstructions: r.preOpInstructions,
    postOpInstructions: r.postOpInstructions,
    blockSchedule: r.blockSchedule,
    cancelReason: r.cancelReason,
    doneAt: r.doneAt,
    conversationId: r.conversationId,
    checklist: r.checklist.map((c) => ({
      id: c.id,
      label: c.label,
      done: !!c.doneAt,
      doneAt: c.doneAt,
    })),
    payments: r.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      note: p.note,
      paidAt: p.paidAt,
    })),
    events: r.events.map((e) => ({
      id: e.id,
      type: e.type,
      text: e.text,
      createdAt: e.createdAt,
      actorName: e.actor?.fullName ?? null,
    })),
    attachments: r.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
      kind: a.kind as AttachmentKind,
      createdAt: a.createdAt,
      uploadedByName: a.uploadedBy.fullName,
    })),
  };
}

/** A patient's own cases (patient AI / patient-facing). No scope: it is theirs. */
export async function listPatientOperations(clinicId: string, patientId: string) {
  return prisma.operation.findMany({
    where: { clinicId, patientId },
    select: {
      ...listSelect,
      preOpInstructions: true,
      postOpInstructions: true,
      checklist: {
        select: { label: true, doneAt: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// ─── History ──────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

function logEvent(
  db: Tx | typeof prisma,
  op: { id: string; clinicId: string },
  actorId: string | null,
  type: string,
  text: string
) {
  return db.operationEvent.create({
    data: { clinicId: op.clinicId, operationId: op.id, actorId, type, text },
  });
}

// ─── Validation helpers ───────────────────────────────────────────────────────

async function loadScoped(clinicId: string, scope: BranchScope, operationId: string) {
  return prisma.operation.findFirst({
    where: { id: operationId, clinicId, ...operationScopeWhere(scope) },
  });
}

const NOT_FOUND = "العملية غير موجودة";

function cleanText(v: string | null | undefined, max = 5000): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

async function validateRefs(
  clinicId: string,
  scope: BranchScope,
  v: {
    serviceId?: string | null;
    doctorId?: string | null;
    branchId?: string | null;
    coordinatorId?: string | null;
  }
): Promise<string | null> {
  if (v.serviceId) {
    const s = await prisma.service.findFirst({
      where: { id: v.serviceId, clinicId },
      select: { id: true },
    });
    if (!s) return "الخدمة غير موجودة";
  }
  if (v.doctorId) {
    const d = await prisma.doctor.findFirst({
      where: { id: v.doctorId, clinicId },
      select: { id: true },
    });
    if (!d) return "الطبيب غير موجود";
  }
  if (v.branchId) {
    if (scope !== null && !scope.includes(v.branchId)) return "لا يمكنك اختيار فرع خارج فروعك";
    const b = await prisma.branch.findFirst({
      where: { id: v.branchId, clinicId },
      select: { id: true },
    });
    if (!b) return "الفرع غير موجود";
  }
  if (v.coordinatorId) {
    const m = await prisma.clinicMember.findFirst({
      where: {
        clinicId,
        userId: v.coordinatorId,
        role: { in: [Role.ADMIN, Role.STAFF, Role.DOCTOR] },
      },
      select: { id: true },
    });
    if (!m) return "عضو الفريق غير موجود";
  }
  return null;
}

function validMoney(v: number | null | undefined): boolean {
  return v == null || (Number.isFinite(v) && v >= 0 && v <= MAX_MONEY);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface OperationInput {
  patientId: string;
  serviceId?: string | null;
  name?: string | null;
  doctorId?: string | null;
  branchId?: string | null;
  hospitalName?: string | null;
  durationMin?: number | null;
  anesthesia?: string | null;
  price?: number | null;
  notes?: string | null;
  requestNote?: string | null;
  coordinatorId?: string | null;
  preOpInstructions?: string | null;
  postOpInstructions?: string | null;
  /** Checklist lines; omitted = copied from the operation type (service). */
  checklist?: string[];
}

export async function createOperation(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  input: OperationInput,
  opts: {
    source?: OperationSource;
    status?: OperationStatus;
    conversationId?: string | null;
  } = {}
): Promise<Result<{ id: string }>> {
  const patient = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: input.patientId, clinicId } },
    select: { role: true },
  });
  if (patient?.role !== Role.PATIENT) return err("المريض غير موجود في هذه العيادة");
  const refError = await validateRefs(clinicId, scope, input);
  if (refError) return err(refError);
  if (!validMoney(input.price)) return err("السعر غير صالح");

  const service = input.serviceId
    ? await prisma.service.findUnique({
        where: { id: input.serviceId },
        select: {
          name: true,
          price: true,
          pricingType: true,
          durationMin: true,
          prepInstructions: true,
          postOpInstructions: true,
          operationChecklist: true,
        },
      })
    : null;
  const name = cleanText(input.name, 200) ?? service?.name ?? null;
  if (!name) return err("حدّد اسم العملية أو نوعها");

  const checklist = (input.checklist ?? service?.operationChecklist ?? [])
    .map((l) => l.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 50);
  const branchId = input.branchId ?? null;
  const status = opts.status ?? OperationStatus.PREPARING;
  const source = opts.source ?? OperationSource.STAFF;

  const op = await prisma.$transaction(async (tx) => {
    const created = await tx.operation.create({
      data: {
        clinicId,
        patientId: input.patientId,
        serviceId: input.serviceId ?? null,
        name,
        status,
        source,
        doctorId: input.doctorId ?? null,
        branchId,
        hospitalName: branchId ? null : cleanText(input.hospitalName, 200),
        durationMin: input.durationMin ?? service?.durationMin ?? null,
        anesthesia: cleanText(input.anesthesia, 200),
        price:
          input.price ??
          (service?.pricingType === "FIXED" && service.price != null
            ? Number(service.price)
            : null),
        notes: cleanText(input.notes),
        requestNote: cleanText(input.requestNote),
        coordinatorId: input.coordinatorId ?? null,
        conversationId: opts.conversationId ?? null,
        preOpInstructions:
          cleanText(input.preOpInstructions) ?? cleanText(service?.prepInstructions),
        postOpInstructions:
          cleanText(input.postOpInstructions) ?? cleanText(service?.postOpInstructions),
        createdById: actorId,
        checklist: {
          create: checklist.map((label, i) => ({ clinicId, label, sortOrder: i })),
        },
      },
      select: { id: true, clinicId: true },
    });
    await logEvent(
      tx,
      created,
      actorId,
      "created",
      source === OperationSource.PATIENT_AI
        ? `طلب المريض العملية عبر المساعد الذكي${input.requestNote ? `: ${cleanText(input.requestNote, 300)}` : ""}`
        : `تم إنشاء الحالة (${OPERATION_STATUS_LABEL[status]})`
    );
    return created;
  });
  return ok({ id: op.id });
}

/**
 * The patient asked the AI about an operation. Opens a REQUESTED case — or, if
 * they already have an open request for the same operation, adds to it — and
 * returns whether it is new (so the caller alerts the team only once).
 */
export async function requestOperationFromPatient(args: {
  clinicId: string;
  patientId: string;
  serviceId: string | null;
  name: string | null;
  note: string | null;
  conversationId: string | null;
}): Promise<Result<{ id: string; name: string; isNew: boolean }>> {
  const note = cleanText(args.note, 1000);
  const existing = await prisma.operation.findFirst({
    where: {
      clinicId: args.clinicId,
      patientId: args.patientId,
      status: { in: [OperationStatus.REQUESTED, OperationStatus.PREPARING] },
      ...(args.serviceId
        ? { serviceId: args.serviceId }
        : { serviceId: null, name: cleanText(args.name, 200) ?? "" }),
    },
    select: { id: true, clinicId: true, name: true, requestNote: true },
  });
  if (existing) {
    if (note) {
      await prisma.$transaction([
        prisma.operation.update({
          where: { id: existing.id },
          data: {
            requestNote: [existing.requestNote, note].filter(Boolean).join("\n"),
            conversationId: args.conversationId ?? undefined,
          },
        }),
        logEvent(prisma, existing, null, "request", `أضاف المريض عبر المساعد الذكي: ${note}`),
      ]);
    }
    return ok({ id: existing.id, name: existing.name, isNew: false });
  }
  const res = await createOperation(
    args.clinicId,
    null,
    null,
    {
      patientId: args.patientId,
      serviceId: args.serviceId,
      name: args.name,
      requestNote: note,
    },
    {
      source: OperationSource.PATIENT_AI,
      status: OperationStatus.REQUESTED,
      conversationId: args.conversationId,
    }
  );
  if (!res.ok) return res;
  const op = await prisma.operation.findUnique({
    where: { id: res.data.id },
    select: { name: true },
  });
  return ok({ id: res.data.id, name: op?.name ?? "", isNew: true });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export interface OperationPatch {
  serviceId?: string | null;
  name?: string | null;
  doctorId?: string | null;
  branchId?: string | null;
  hospitalName?: string | null;
  durationMin?: number | null;
  anesthesia?: string | null;
  price?: number | null;
  notes?: string | null;
  coordinatorId?: string | null;
  preOpInstructions?: string | null;
  postOpInstructions?: string | null;
  consentSigned?: boolean;
  blockSchedule?: boolean;
}

const FIELD_LABEL: Record<keyof OperationPatch, string> = {
  serviceId: "نوع العملية",
  name: "الاسم",
  doctorId: "الجرّاح",
  branchId: "المكان",
  hospitalName: "المكان",
  durationMin: "المدة",
  anesthesia: "التخدير",
  price: "السعر",
  notes: "الملاحظات الداخلية",
  coordinatorId: "المسؤول عن الحالة",
  preOpInstructions: "تعليمات ما قبل العملية",
  postOpInstructions: "تعليمات ما بعد العملية",
  consentSigned: "الإقرار",
  blockSchedule: "حجز جدول الجرّاح",
};

export async function updateOperation(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  operationId: string,
  patch: OperationPatch
): Promise<Result<{ conflicts: string[] }>> {
  const op = await loadScoped(clinicId, scope, operationId);
  if (!op) return err(NOT_FOUND);
  if (op.status === OperationStatus.CANCELLED || op.status === OperationStatus.CLOSED)
    return err(
      `لا يمكن تعديل عملية حالتها «${OPERATION_STATUS_LABEL[op.status]}» — أعد فتحها أولاً`
    );
  const refError = await validateRefs(clinicId, scope, patch);
  if (refError) return err(refError);
  if (patch.price !== undefined && !validMoney(patch.price)) return err("السعر غير صالح");
  if (patch.durationMin != null && (patch.durationMin < 5 || patch.durationMin > 24 * 60))
    return err("المدة يجب أن تكون بين 5 دقائق و24 ساعة");

  const data: Prisma.OperationUncheckedUpdateInput = {};
  const changed: string[] = [];
  const set = <K extends keyof OperationPatch>(key: K, value: unknown, current: unknown) => {
    const norm = (x: unknown) => (x instanceof Prisma.Decimal ? Number(x) : (x ?? null));
    if (norm(value) === norm(current)) return;
    (data as Record<string, unknown>)[key] = value;
    changed.push(FIELD_LABEL[key]);
  };
  if (patch.serviceId !== undefined) set("serviceId", patch.serviceId, op.serviceId);
  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 200);
    if (!name) return err("اسم العملية مطلوب");
    set("name", name, op.name);
  }
  if (patch.doctorId !== undefined) set("doctorId", patch.doctorId, op.doctorId);
  if (patch.branchId !== undefined || patch.hospitalName !== undefined) {
    // One place: a branch OR an outside hospital. Naming a hospital without a
    // branch moves the case out of its branch.
    let branchId = patch.branchId !== undefined ? patch.branchId : op.branchId;
    let hospital =
      patch.hospitalName !== undefined ? cleanText(patch.hospitalName, 200) : op.hospitalName;
    if (patch.hospitalName && patch.branchId === undefined) branchId = null;
    if (branchId) hospital = null;
    set("branchId", branchId, op.branchId);
    set("hospitalName", hospital, op.hospitalName);
  }
  if (patch.durationMin !== undefined) set("durationMin", patch.durationMin, op.durationMin);
  if (patch.anesthesia !== undefined)
    set("anesthesia", cleanText(patch.anesthesia, 200), op.anesthesia);
  if (patch.price !== undefined) set("price", patch.price, op.price);
  if (patch.notes !== undefined) set("notes", cleanText(patch.notes), op.notes);
  if (patch.coordinatorId !== undefined)
    set("coordinatorId", patch.coordinatorId, op.coordinatorId);
  if (patch.preOpInstructions !== undefined)
    set("preOpInstructions", cleanText(patch.preOpInstructions), op.preOpInstructions);
  if (patch.postOpInstructions !== undefined)
    set("postOpInstructions", cleanText(patch.postOpInstructions), op.postOpInstructions);
  if (patch.consentSigned !== undefined)
    set("consentSigned", patch.consentSigned, op.consentSigned);
  if (patch.blockSchedule !== undefined)
    set("blockSchedule", patch.blockSchedule, op.blockSchedule);

  if (changed.length === 0) return ok({ conflicts: [] });

  // A scheduled case can't lose its surgeon.
  if (op.status === OperationStatus.SCHEDULED && data.doctorId === null)
    return err("لا يمكن إزالة الجرّاح من عملية محددة الموعد — أجّلها أولاً");
  // A different time/date for the reminder? No — only date/time reset it (schedule).
  await prisma.$transaction([
    prisma.operation.update({ where: { id: op.id }, data }),
    logEvent(prisma, op, actorId, "updated", `تعديل: ${[...new Set(changed)].join("، ")}`),
  ]);

  const scheduleTouched = "doctorId" in data || "durationMin" in data || "blockSchedule" in data;
  if (scheduleTouched && op.status === OperationStatus.SCHEDULED) {
    await syncOperationBlocks(op.id);
    const fresh = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
    if (fresh.doctorId && fresh.scheduledDate && fresh.startTime) {
      return ok({
        conflicts: await scheduleConflicts(clinicId, {
          doctorId: fresh.doctorId,
          date: fresh.scheduledDate,
          startTime: fresh.startTime,
          durationMin: fresh.durationMin,
          excludeOperationId: fresh.id,
        }),
      });
    }
  }
  return ok({ conflicts: [] });
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

/** The operation's window as wall-clock-in-UTC instants (the Slot convention). */
function operationWindow(date: Date, startTime: string, durationMin: number | null) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMinutes(hhmmToMinutes(startTime));
  const end = new Date(start.getTime() + (durationMin ?? DEFAULT_OPERATION_MINUTES) * 60_000);
  return { start, end };
}

function parseDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayLabel(d: Date): string {
  return formatSlotDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "الأحد 10 ديسمبر 2026 الساعة 10:00 ص" */
export function whenLabel(date: Date | null, startTime: string | null): string {
  if (!date) return "";
  return `${dayLabel(date)}${startTime ? ` الساعة ${formatHHMMAr(startTime)}` : ""}`;
}

/**
 * What already sits in the surgeon's day at that time: booked slot visits and
 * day-only visits with a set time that overlap, other operations, and queue
 * bookings that day (no clock time, so only counted). Human lines, for a
 * warning — scheduling never auto-cancels anything.
 */
export async function scheduleConflicts(
  clinicId: string,
  args: {
    doctorId: string;
    date: Date;
    startTime: string;
    durationMin: number | null;
    excludeOperationId?: string;
  }
): Promise<string[]> {
  const { start, end } = operationWindow(args.date, args.startTime, args.durationMin);
  const startMin = hhmmToMinutes(args.startTime);
  const endMin = startMin + (args.durationMin ?? DEFAULT_OPERATION_MINUTES);
  const [slots, dayOnly, queueCount, ops] = await Promise.all([
    prisma.slot.findMany({
      where: {
        clinicId,
        doctorId: args.doctorId,
        date: args.date,
        startTime: { lt: end },
        endTime: { gt: start },
        heldById: { not: null },
        appointment: { status: { in: OPEN_APPT } },
      },
      select: {
        startTime: true,
        appointment: { select: { id: true, patient: { select: { fullName: true } } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId,
        doctorId: args.doctorId,
        bookingDate: args.date,
        slotId: null,
        scheduledTime: { not: null },
        status: { in: OPEN_APPT },
      },
      select: {
        scheduledTime: true,
        totalDurationMin: true,
        patient: { select: { fullName: true } },
      },
    }),
    prisma.appointment.count({
      where: {
        clinicId,
        doctorId: args.doctorId,
        bookingDate: args.date,
        slotId: null,
        scheduledTime: null,
        status: { in: OPEN_APPT },
      },
    }),
    prisma.operation.findMany({
      where: {
        clinicId,
        doctorId: args.doctorId,
        scheduledDate: args.date,
        status: OperationStatus.SCHEDULED,
        ...(args.excludeOperationId ? { id: { not: args.excludeOperationId } } : {}),
      },
      select: {
        name: true,
        startTime: true,
        durationMin: true,
        patient: { select: { fullName: true } },
      },
    }),
  ]);

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (!s.appointment || seen.has(s.appointment.id)) continue;
    seen.add(s.appointment.id);
    lines.push(`موعد ${s.appointment.patient.fullName} الساعة ${formatSlotTimeAr(s.startTime)}`);
  }
  for (const a of dayOnly) {
    const m = hhmmToMinutes(a.scheduledTime!);
    if (m < endMin && m + (a.totalDurationMin ?? 30) > startMin)
      lines.push(`موعد ${a.patient.fullName} الساعة ${formatHHMMAr(a.scheduledTime)}`);
  }
  for (const o of ops) {
    if (!o.startTime) continue;
    const m = hhmmToMinutes(o.startTime);
    if (m < endMin && m + (o.durationMin ?? DEFAULT_OPERATION_MINUTES) > startMin)
      lines.push(
        `عملية أخرى (${o.name} — ${o.patient.fullName}) الساعة ${formatHHMMAr(o.startTime)}`
      );
  }
  if (queueCount > 0)
    lines.push(`${queueCount} حجز بنظام الدور/اليوم في نفس اليوم مع نفس الطبيب (بدون وقت محدد)`);
  return lines;
}

function formatSlotTimeAr(d: Date): string {
  return d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/**
 * Re-applies the case's hold on the surgeon's schedule: frees every slot it
 * blocked, then — if it is SCHEDULED with blockSchedule on — blocks the free
 * slots its window overlaps. Slots already booked are left alone (reported as
 * conflicts instead); slots the doctor blocked by hand are never touched.
 */
export async function syncOperationBlocks(operationId: string): Promise<void> {
  const op = await prisma.operation.findUnique({
    where: { id: operationId },
    select: {
      id: true,
      status: true,
      blockSchedule: true,
      doctorId: true,
      scheduledDate: true,
      startTime: true,
      durationMin: true,
    },
  });
  const release = prisma.slot.updateMany({
    where: { blockedByOperationId: operationId },
    data: { isBlocked: false, blockedByOperationId: null },
  });
  if (
    !op ||
    op.status !== OperationStatus.SCHEDULED ||
    !op.blockSchedule ||
    !op.doctorId ||
    !op.scheduledDate ||
    !op.startTime
  ) {
    await release;
    return;
  }
  const { start, end } = operationWindow(op.scheduledDate, op.startTime, op.durationMin);
  await prisma.$transaction([
    release,
    prisma.slot.updateMany({
      where: {
        doctorId: op.doctorId,
        date: op.scheduledDate,
        startTime: { lt: end },
        endTime: { gt: start },
        isBlocked: false,
        heldById: null,
      },
      data: { isBlocked: true, blockedByOperationId: op.id },
    }),
  ]);
}

/**
 * Newly generated slots must respect operations already scheduled: called after
 * slot generation for a doctor's [from, until) range.
 */
export async function blockNewSlotsForOperations(
  doctorId: string,
  from: Date,
  until: Date
): Promise<void> {
  const ops = await prisma.operation.findMany({
    where: {
      doctorId,
      status: OperationStatus.SCHEDULED,
      blockSchedule: true,
      scheduledDate: { gte: from, lt: until },
      startTime: { not: null },
    },
    select: { id: true },
  });
  for (const o of ops) await syncOperationBlocks(o.id);
}

export async function scheduleOperation(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  operationId: string,
  input: { date: string; startTime: string; durationMin?: number | null }
): Promise<Result<{ conflicts: string[] }>> {
  const op = await loadScoped(clinicId, scope, operationId);
  if (!op) return err(NOT_FOUND);
  if (!isSchedulable(op.status))
    return err(`لا يمكن تحديد موعد لعملية حالتها «${OPERATION_STATUS_LABEL[op.status]}»`);
  if (!op.doctorId) return err("حدّد الجرّاح أولاً قبل تحديد موعد العملية");
  const date = parseDay(input.date);
  if (!date) return err("التاريخ غير صالح (YYYY-MM-DD)");
  const startTime = normalizeHHMM(input.startTime);
  if (!startTime) return err("الوقت غير صالح (HH:MM)");
  const durationMin = input.durationMin ?? op.durationMin;
  if (durationMin != null && (durationMin < 5 || durationMin > 24 * 60))
    return err("المدة يجب أن تكون بين 5 دقائق و24 ساعة");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date.getTime() < today.getTime() - 86_400_000) return err("لا يمكن تحديد موعد في تاريخ مضى");

  const before =
    op.status === OperationStatus.SCHEDULED && op.scheduledDate
      ? whenLabel(op.scheduledDate, op.startTime)
      : null;
  const after = whenLabel(date, startTime);
  await prisma.$transaction([
    prisma.operation.update({
      where: { id: op.id },
      data: {
        status: OperationStatus.SCHEDULED,
        scheduledDate: date,
        startTime,
        durationMin,
        // A new date deserves a new reminder.
        reminderSentAt: null,
      },
    }),
    logEvent(
      prisma,
      op,
      actorId,
      "scheduled",
      before ? `تغيير الموعد من ${before} إلى ${after}` : `تحديد موعد العملية: ${after}`
    ),
  ]);
  await syncOperationBlocks(op.id);
  return ok({
    conflicts: await scheduleConflicts(clinicId, {
      doctorId: op.doctorId,
      date,
      startTime,
      durationMin,
      excludeOperationId: op.id,
    }),
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function setOperationStatus(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  operationId: string,
  to: OperationStatus,
  reason?: string | null
): Promise<Result<void>> {
  const op = await loadScoped(clinicId, scope, operationId);
  if (!op) return err(NOT_FOUND);
  if (op.status === to) return err(`العملية بالفعل «${OPERATION_STATUS_LABEL[to]}»`);
  if (!OPERATION_TRANSITIONS[op.status].includes(to))
    return err(
      `لا يمكن تغيير الحالة من «${OPERATION_STATUS_LABEL[op.status]}» إلى «${OPERATION_STATUS_LABEL[to]}»`
    );

  const why = cleanText(reason, 500);
  const data: Prisma.OperationUncheckedUpdateInput = { status: to };
  let text = `تغيير الحالة من «${OPERATION_STATUS_LABEL[op.status]}» إلى «${OPERATION_STATUS_LABEL[to]}»`;
  if (to === OperationStatus.CANCELLED) {
    data.cancelReason = why;
  } else if (op.status === OperationStatus.CANCELLED) {
    data.cancelReason = null;
  }
  if (to === OperationStatus.PREPARING && op.status === OperationStatus.SCHEDULED) {
    // Postpone: the date is gone; set a new one by scheduling again.
    data.scheduledDate = null;
    data.startTime = null;
    data.reminderSentAt = null;
    text = `تأجيل العملية (كانت ${whenLabel(op.scheduledDate, op.startTime)})`;
  }
  if (to === OperationStatus.DONE && op.status === OperationStatus.SCHEDULED) {
    data.doneAt = new Date();
    data.followUpSentAt = null;
  }
  if (why) text += ` — ${why}`;

  await prisma.$transaction([
    prisma.operation.update({ where: { id: op.id }, data }),
    logEvent(prisma, op, actorId, "status", text),
  ]);
  // Leaving SCHEDULED frees the surgeon's slots.
  if (op.status === OperationStatus.SCHEDULED) await syncOperationBlocks(op.id);
  return ok(undefined);
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function addChecklistItems(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  operationId: string,
  labels: string[]
): Promise<Result<void>> {
  const op = await loadScoped(clinicId, scope, operationId);
  if (!op) return err(NOT_FOUND);
  const clean = labels.map((l) => l.trim().slice(0, 200)).filter(Boolean);
  if (clean.length === 0) return err("اكتب بنداً واحداً على الأقل");
  const count = await prisma.operationChecklistItem.count({ where: { operationId } });
  if (count + clean.length > 60) return err("القائمة طويلة جداً");
  await prisma.$transaction([
    prisma.operationChecklistItem.createMany({
      data: clean.map((label, i) => ({ clinicId, operationId, label, sortOrder: count + i })),
    }),
    logEvent(prisma, op, actorId, "checklist", `إضافة للتجهيزات: ${clean.join("، ")}`),
  ]);
  return ok(undefined);
}

async function scopedItem(clinicId: string, scope: BranchScope, itemId: string) {
  const item = await prisma.operationChecklistItem.findFirst({
    where: { id: itemId, clinicId },
    include: { operation: true },
  });
  if (!item || !inOpScope(scope, item.operation.branchId)) return null;
  return item;
}

export async function setChecklistItemDone(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  itemId: string,
  done: boolean
): Promise<Result<void>> {
  const item = await scopedItem(clinicId, scope, itemId);
  if (!item) return err("البند غير موجود");
  if (!!item.doneAt === done) return ok(undefined);
  await prisma.$transaction([
    prisma.operationChecklistItem.update({
      where: { id: item.id },
      data: done ? { doneAt: new Date(), doneById: actorId } : { doneAt: null, doneById: null },
    }),
    logEvent(
      prisma,
      item.operation,
      actorId,
      "checklist",
      done ? `تم: ${item.label}` : `إلغاء علامة «تم»: ${item.label}`
    ),
  ]);
  return ok(undefined);
}

export async function removeChecklistItem(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  itemId: string
): Promise<Result<void>> {
  const item = await scopedItem(clinicId, scope, itemId);
  if (!item) return err("البند غير موجود");
  await prisma.$transaction([
    prisma.operationChecklistItem.delete({ where: { id: item.id } }),
    logEvent(prisma, item.operation, actorId, "checklist", `حذف من التجهيزات: ${item.label}`),
  ]);
  return ok(undefined);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function addPayment(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  operationId: string,
  input: { amount: number; method?: string | null; note?: string | null; paidAt?: Date | null }
): Promise<Result<void>> {
  const op = await loadScoped(clinicId, scope, operationId);
  if (!op) return err(NOT_FOUND);
  if (op.status === OperationStatus.CANCELLED) return err("العملية ملغاة");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > MAX_MONEY)
    return err("المبلغ غير صالح");
  const method = cleanText(input.method, 60);
  await prisma.$transaction([
    prisma.operationPayment.create({
      data: {
        clinicId,
        operationId,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        method,
        note: cleanText(input.note, 500),
        paidAt: input.paidAt ?? new Date(),
        createdById: actorId,
      },
    }),
    logEvent(
      prisma,
      op,
      actorId,
      "payment",
      `تسجيل دفعة ${formatFee(input.amount)}${method ? ` (${method})` : ""}`
    ),
  ]);
  return ok(undefined);
}

export async function removePayment(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  paymentId: string
): Promise<Result<void>> {
  const p = await prisma.operationPayment.findFirst({
    where: { id: paymentId, clinicId },
    include: { operation: true },
  });
  if (!p || !inOpScope(scope, p.operation.branchId)) return err("الدفعة غير موجودة");
  await prisma.$transaction([
    prisma.operationPayment.delete({ where: { id: p.id } }),
    logEvent(prisma, p.operation, actorId, "payment", `حذف دفعة ${formatFee(Number(p.amount))}`),
  ]);
  return ok(undefined);
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function createOperationAttachment(args: {
  clinicId: string;
  operationId: string;
  uploadedById: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<{ id: string }> {
  const op = { id: args.operationId, clinicId: args.clinicId };
  const [row] = await prisma.$transaction([
    prisma.operationAttachment.create({
      data: { ...args, kind: attachmentKind(args.contentType) },
      select: { id: true },
    }),
    logEvent(prisma, op, args.uploadedById, "attachment", `إرفاق ملف: ${args.fileName}`),
  ]);
  return row;
}

export async function getOperationAttachment(attachmentId: string, clinicId: string) {
  return prisma.operationAttachment.findFirst({
    where: { id: attachmentId, clinicId },
    select: {
      id: true,
      operationId: true,
      storagePath: true,
      fileName: true,
      operation: { select: { branchId: true } },
    },
  });
}

/** Deletes the row; returns the storage path for the caller to remove, or null. */
export async function deleteOperationAttachment(
  clinicId: string,
  scope: BranchScope,
  actorId: string | null,
  attachmentId: string
): Promise<string | null> {
  const a = await getOperationAttachment(attachmentId, clinicId);
  if (!a || !inOpScope(scope, a.operation.branchId)) return null;
  await prisma.$transaction([
    prisma.operationAttachment.delete({ where: { id: a.id } }),
    logEvent(
      prisma,
      { id: a.operationId, clinicId },
      actorId,
      "attachment",
      `حذف ملف: ${a.fileName}`
    ),
  ]);
  return a.storagePath;
}

export function operationInScope(scope: BranchScope, branchId: string | null): boolean {
  return inOpScope(scope, branchId);
}

// ─── Messages to the patient ──────────────────────────────────────────────────

export type OperationMessageKind = "details" | "preop" | "postop" | "custom";

export const OPERATION_MESSAGE_LABEL: Record<OperationMessageKind, string> = {
  details: "تفاصيل العملية (الموعد والمكان والتعليمات)",
  preop: "تعليمات ما قبل العملية والتجهيزات المطلوبة",
  postop: "تعليمات ما بعد العملية",
  custom: "رسالة مخصّصة",
};

const messageSelect = {
  id: true,
  clinicId: true,
  name: true,
  status: true,
  branchId: true,
  hospitalName: true,
  scheduledDate: true,
  startTime: true,
  preOpInstructions: true,
  postOpInstructions: true,
  patient: { select: { id: true, fullName: true, phone: true } },
  doctor: { select: { fullName: true } },
  branch: { select: { name: true, address: true } },
  clinic: { select: { name: true } },
  checklist: {
    select: { label: true, doneAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.OperationSelect;

type MessageSource = Prisma.OperationGetPayload<{ select: typeof messageSelect }>;

/** The text the patient would receive. Plain text (no markdown) for both providers. */
export function composeOperationMessage(
  op: MessageSource,
  kind: OperationMessageKind,
  customText?: string | null
): Result<string> {
  if (kind === "custom") {
    const t = cleanText(customText, 4000);
    return t ? ok(t) : err("اكتب نص الرسالة");
  }
  const first = op.patient.fullName.split(" ")[0] || op.patient.fullName;
  const open = op.checklist.filter((c) => !c.doneAt).map((c) => `- ${c.label}`);
  const location = op.branch
    ? `${op.branch.name}${op.branch.address ? ` — ${op.branch.address}` : ""}`
    : (op.hospitalName ?? "");

  if (kind === "postop") {
    if (!op.postOpInstructions)
      return err("لا توجد تعليمات ما بعد العملية لهذه الحالة — أضفها أولاً");
    return ok(
      `مرحباً ${first} 🌷\nتعليمات ما بعد عملية ${op.name} من ${op.clinic.name}:\n\n${op.postOpInstructions}\n\nلأي استفسار أو إن شعرت بأي أعراض مقلقة رد على هذه الرسالة.`
    );
  }
  if (kind === "preop") {
    if (!op.preOpInstructions && open.length === 0)
      return err("لا توجد تعليمات أو تجهيزات مطلوبة لهذه الحالة — أضفها أولاً");
    return ok(
      [
        `مرحباً ${first} 👋`,
        `استعداداً لعملية ${op.name} في ${op.clinic.name}:`,
        op.preOpInstructions ? `\nتعليمات قبل العملية:\n${op.preOpInstructions}` : "",
        open.length ? `\nالمطلوب تجهيزه قبل العملية:\n${open.join("\n")}` : "",
        "\nلأي استفسار رد على هذه الرسالة.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  // details
  if (op.status !== OperationStatus.SCHEDULED || !op.scheduledDate)
    return err("لم يُحدَّد موعد العملية بعد — حدّد الموعد أولاً أو أرسل رسالة مخصّصة");
  return ok(
    [
      `مرحباً ${first} 👋`,
      `تم تحديد موعد عمليتك في ${op.clinic.name}:`,
      `\n🩺 العملية: ${op.name}`,
      `📅 الموعد: ${whenLabel(op.scheduledDate, op.startTime)}`,
      location ? `📍 المكان: ${location}` : "",
      op.doctor ? `👨‍⚕️ الجرّاح: د. ${op.doctor.fullName}` : "",
      op.preOpInstructions ? `\nتعليمات قبل العملية:\n${op.preOpInstructions}` : "",
      open.length ? `\nالمطلوب تجهيزه قبل العملية:\n${open.join("\n")}` : "",
      "\nلأي استفسار رد على هذه الرسالة.",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

/** Loads the case (scoped) and composes the message, without sending. */
export async function previewOperationMessage(
  clinicId: string,
  scope: BranchScope,
  operationId: string,
  kind: OperationMessageKind,
  customText?: string | null
): Promise<Result<{ text: string; patientName: string }>> {
  const op = await prisma.operation.findFirst({
    where: { id: operationId, clinicId, ...operationScopeWhere(scope) },
    select: messageSelect,
  });
  if (!op) return err(NOT_FOUND);
  const text = composeOperationMessage(op, kind, customText);
  if (!text.ok) return text;
  return ok({ text: text.data, patientName: op.patient.fullName });
}

/**
 * Sends an operation message to the patient over WhatsApp, threads it into
 * their inbox conversation as a team (ADMIN) message, and logs it on the case.
 * On the official API it refuses when Meta's 24h window is closed (free text
 * can't be delivered then).
 */
export async function sendOperationMessage(
  clinicId: string,
  scope: BranchScope,
  actorId: string,
  operationId: string,
  kind: OperationMessageKind,
  customText?: string | null
): Promise<Result<{ text: string }>> {
  const op = await prisma.operation.findFirst({
    where: { id: operationId, clinicId, ...operationScopeWhere(scope) },
    select: messageSelect,
  });
  if (!op) return err(NOT_FOUND);
  const composed = composeOperationMessage(op, kind, customText);
  if (!composed.ok) return composed;
  const text = composed.data;

  const thread = await getWhatsappThread(clinicId, op.patient);
  const recipient = thread ? conversationRecipient(thread) : null;
  if (!thread || !recipient) return err("لا يوجد رقم واتساب مسجّل لهذا المريض");
  const transport = await resolveWhatsappTransport(clinicId, thread.id, {
    preferBranchId: op.branchId,
  });
  if (!transport) return err("لا يوجد رقم واتساب متصل للعيادة");
  if (hasServiceWindow(transport.provider)) {
    const last = await prisma.message.findFirst({
      where: {
        conversationId: thread.id,
        senderType: SenderType.USER,
        whatsappConfigId: transport.configId,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!isWithinWhatsappWindow(last?.createdAt ?? null))
      return err(
        "نافذة واتساب (24 ساعة) مغلقة مع هذا المريض على الرقم الرسمي، فلا يمكن إرسال رسالة حرة الآن. اطلب من المريض مراسلة العيادة أولاً، أو فعّل «تذكير العملية» بقالب معتمد من صفحة التذكيرات."
      );
  }

  const wamid = await sendWhatsAppText(transport, recipient, text);
  const sessionId = await resolveActiveSession(thread.id, clinicId).catch(() => null);
  await prisma.$transaction([
    prisma.message.create({
      data: {
        clinicId,
        conversationId: thread.id,
        sessionId,
        senderType: SenderType.ADMIN,
        senderId: actorId,
        content: text,
        isRead: true,
        whatsappMessageId: wamid,
        whatsappConfigId: transport.configId,
        metadata: { operationId: op.id, operationMessage: kind },
      },
    }),
    prisma.conversation.update({ where: { id: thread.id }, data: { updatedAt: new Date() } }),
    logEvent(
      prisma,
      op,
      actorId,
      "message",
      `إرسال للمريض عبر واتساب: ${OPERATION_MESSAGE_LABEL[kind]}`
    ),
  ]);
  return ok({ text });
}

// ─── Form options (dashboard) ─────────────────────────────────────────────────

export interface OperationFormOptions {
  doctors: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  services: { id: string; name: string; price: number | null }[];
  team: { id: string; name: string }[];
}

/** Choices for the create / edit forms, limited to what the member may pick. */
export async function operationFormOptions(
  clinicId: string,
  scope: BranchScope
): Promise<OperationFormOptions> {
  const [doctors, branches, services, team] = await Promise.all([
    prisma.doctor.findMany({
      where: {
        clinicId,
        isActive: true,
        ...(scope ? { branches: { some: { branchId: { in: [...scope] } } } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.branch.findMany({
      where: { clinicId, isActive: true, ...(scope ? { id: { in: [...scope] } } : {}) },
      select: { id: true, name: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    }),
    prisma.service.findMany({
      where: { clinicId, kind: "OPERATION", isActive: true },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
    }),
    prisma.clinicMember.findMany({
      where: { clinicId, role: { in: [Role.ADMIN, Role.STAFF] } },
      select: { user: { select: { id: true, fullName: true } } },
    }),
  ]);
  return {
    doctors: doctors.map((d) => ({ id: d.id, name: d.fullName })),
    branches,
    services: services.map((s) => ({ id: s.id, name: s.name, price: money(s.price) })),
    team: team
      .map((m) => ({ id: m.user.id, name: m.user.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar")),
  };
}

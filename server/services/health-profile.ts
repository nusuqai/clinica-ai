import "server-only";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildSnapshot,
  hasAnswer,
  missingRequired,
  parseAnswer,
  questionInputSchema,
  sectionInputSchema,
  type AnswersMap,
  type AnswerValue,
  type HealthAnswerSource,
  type HealthQuestionAudience,
  type HealthQuestionView,
  type HealthSectionView,
  type QuestionSnapshot,
} from "@/lib/health-profile";
import { ok, err, type Result } from "./_result";

// Dynamic patient health profile — DB layer. Shared rules live in
// lib/health-profile.ts; storage rules are documented in prisma/schema.prisma
// above HealthProfileSection.
//
// SAFE EDITING: anything a patient already answered is ARCHIVED, never deleted
// (the answer FKs are NO ACTION, so the DB backs this up). Unanswered sections,
// questions and options are deleted outright — there is nothing to protect.

// ─── Reading the form ────────────────────────────────────────────────────────

const questionInclude = {
  options: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.HealthProfileQuestionInclude;

type QuestionRow = Prisma.HealthProfileQuestionGetPayload<{ include: typeof questionInclude }>;

function toQuestionView(q: QuestionRow): HealthQuestionView {
  return {
    id: q.id,
    sectionId: q.sectionId,
    parentId: q.parentId,
    showWhen: q.showWhen,
    label: q.label,
    helpText: q.helpText,
    type: q.type,
    audience: q.audience,
    required: q.required,
    minValue: q.minValue,
    maxValue: q.maxValue,
    unit: q.unit,
    multiline: q.multiline,
    placeholder: q.placeholder,
    archived: q.archivedAt !== null,
    options: q.options.map((o) => ({ id: o.id, label: o.label, archived: o.archivedAt !== null })),
  };
}

/**
 * A clinic's form, ordered. `includeArchived` is for the builder; everyone else
 * gets active sections/questions/options only. `audience: "PATIENT"` drops
 * staff-only questions (patient web + AI agent asking).
 */
export async function getClinicForm(
  clinicId: string,
  opts: { includeArchived?: boolean; audience?: HealthQuestionAudience } = {}
): Promise<HealthSectionView[]> {
  const active = !opts.includeArchived;
  const sections = await prisma.healthProfileSection.findMany({
    where: { clinicId, ...(active && { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      questions: {
        where: {
          ...(active && { archivedAt: null }),
          ...(opts.audience && { audience: opts.audience }),
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: questionInclude,
      },
    },
  });
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    archived: s.archivedAt !== null,
    questions: s.questions.map((q) => {
      const view = toQuestionView(q);
      return active ? { ...view, options: view.options.filter((o) => !o.archived) } : view;
    }),
  }));
}

/** Builder: answer counts per question, so the UI can say what is protected. */
export async function countAnswersByQuestion(clinicId: string): Promise<Record<string, number>> {
  const rows = await prisma.patientHealthAnswer.groupBy({
    by: ["questionId"],
    where: { clinicId, OR: [{ optionId: { not: null } }, { value: { not: Prisma.DbNull } }] },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.questionId, r._count._all]));
}

/** Platform list: question/section counts per clinic. */
export async function formSummaryByClinic(): Promise<
  Record<string, { sections: number; questions: number; required: number }>
> {
  const [sections, questions, required] = await Promise.all([
    prisma.healthProfileSection.groupBy({
      by: ["clinicId"],
      where: { archivedAt: null },
      _count: { _all: true },
    }),
    prisma.healthProfileQuestion.groupBy({
      by: ["clinicId"],
      where: { archivedAt: null, section: { archivedAt: null } },
      _count: { _all: true },
    }),
    prisma.healthProfileQuestion.groupBy({
      by: ["clinicId"],
      where: {
        archivedAt: null,
        required: true,
        audience: "PATIENT",
        section: { archivedAt: null },
      },
      _count: { _all: true },
    }),
  ]);
  const out: Record<string, { sections: number; questions: number; required: number }> = {};
  const slot = (id: string) => (out[id] ??= { sections: 0, questions: 0, required: 0 });
  for (const r of sections) slot(r.clinicId).sections = r._count._all;
  for (const r of questions) slot(r.clinicId).questions = r._count._all;
  for (const r of required) slot(r.clinicId).required = r._count._all;
  return out;
}

// ─── Builder: sections ───────────────────────────────────────────────────────

const firstIssue = (e: { issues: { message: string }[] }) =>
  e.issues[0]?.message ?? "بيانات غير صالحة";

async function nextSectionOrder(clinicId: string): Promise<number> {
  const agg = await prisma.healthProfileSection.aggregate({
    where: { clinicId },
    _max: { sortOrder: true },
  });
  return (agg._max?.sortOrder ?? -1) + 1;
}

async function nextQuestionOrder(sectionId: string): Promise<number> {
  const agg = await prisma.healthProfileQuestion.aggregate({
    where: { sectionId },
    _max: { sortOrder: true },
  });
  return (agg._max?.sortOrder ?? -1) + 1;
}

export async function createSection(
  clinicId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = sectionInputSchema.safeParse(input);
  if (!parsed.success) return err(firstIssue(parsed.error));
  const row = await prisma.healthProfileSection.create({
    data: {
      clinicId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sortOrder: await nextSectionOrder(clinicId),
    },
    select: { id: true },
  });
  return ok(row);
}

export async function updateSection(clinicId: string, id: string, input: unknown): Promise<Result> {
  const parsed = sectionInputSchema.safeParse(input);
  if (!parsed.success) return err(firstIssue(parsed.error));
  const res = await prisma.healthProfileSection.updateMany({
    where: { id, clinicId },
    data: { title: parsed.data.title, description: parsed.data.description ?? null },
  });
  return res.count ? ok(undefined) : err("القسم غير موجود");
}

/** Delete if nothing in it was ever answered, else archive (answers stay readable). */
export async function removeSection(
  clinicId: string,
  id: string
): Promise<Result<{ archived: boolean }>> {
  const section = await prisma.healthProfileSection.findFirst({ where: { id, clinicId } });
  if (!section) return err("القسم غير موجود");
  const answered = await prisma.patientHealthAnswer.count({
    where: { question: { sectionId: id } },
  });
  if (answered > 0) {
    await prisma.healthProfileSection.update({ where: { id }, data: { archivedAt: new Date() } });
    return ok({ archived: true });
  }
  await prisma.healthProfileSection.delete({ where: { id } });
  return ok({ archived: false });
}

export async function restoreSection(clinicId: string, id: string): Promise<Result> {
  const res = await prisma.healthProfileSection.updateMany({
    where: { id, clinicId },
    data: { archivedAt: null },
  });
  return res.count ? ok(undefined) : err("القسم غير موجود");
}

/** Swap with the neighbour above/below (active sections only). */
export async function moveSection(
  clinicId: string,
  id: string,
  dir: "up" | "down"
): Promise<Result> {
  const list = await prisma.healthProfileSection.findMany({
    where: { clinicId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return reorder(list, id, dir, (rowId, sortOrder) =>
    prisma.healthProfileSection.update({ where: { id: rowId }, data: { sortOrder } })
  );
}

async function reorder(
  list: { id: string }[],
  id: string,
  dir: "up" | "down",
  write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>
): Promise<Result> {
  const i = list.findIndex((r) => r.id === id);
  if (i === -1) return err("العنصر غير موجود");
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return ok(undefined);
  const ids = list.map((r) => r.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // Renumber the whole list: fixes any ties left by concurrent inserts.
  await prisma.$transaction(ids.map((rowId, idx) => write(rowId, idx)));
  return ok(undefined);
}

// ─── Builder: questions ──────────────────────────────────────────────────────

/** A follow-up must sit under an active, top-level BOOLEAN question of the same section. */
async function checkParent(
  clinicId: string,
  sectionId: string,
  parentId: string | null | undefined,
  selfId?: string
): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === selfId) return "لا يمكن ربط السؤال بنفسه.";
  const parent = await prisma.healthProfileQuestion.findFirst({
    where: { id: parentId, clinicId, archivedAt: null },
    select: { type: true, sectionId: true, parentId: true },
  });
  if (!parent) return "السؤال الأساسي غير موجود.";
  if (parent.type !== "BOOLEAN") return "سؤال المتابعة يُربط بسؤال نعم/لا فقط.";
  if (parent.parentId) return "لا يمكن ربط سؤال متابعة بسؤال متابعة آخر.";
  if (parent.sectionId !== sectionId) return "سؤال المتابعة يجب أن يكون في نفس قسم السؤال الأساسي.";
  return null;
}

/** Columns that only apply to some types, reset for the others. */
function typedColumns(v: ReturnType<typeof questionInputSchema.parse>) {
  return {
    minValue: v.type === "NUMBER" ? v.minValue : null,
    maxValue: v.type === "NUMBER" ? v.maxValue : null,
    unit: v.type === "NUMBER" ? (v.unit ?? null) : null,
    multiline: v.type === "TEXT" ? v.multiline : false,
    placeholder: v.type === "TEXT" || v.type === "NUMBER" ? (v.placeholder ?? null) : null,
  };
}

export async function createQuestion(
  clinicId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) return err(firstIssue(parsed.error));
  const v = parsed.data;

  const section = await prisma.healthProfileSection.findFirst({
    where: { id: v.sectionId, clinicId, archivedAt: null },
    select: { id: true },
  });
  if (!section) return err("القسم غير موجود");
  const parentError = await checkParent(clinicId, v.sectionId, v.parentId);
  if (parentError) return err(parentError);

  const row = await prisma.healthProfileQuestion.create({
    data: {
      clinicId,
      sectionId: v.sectionId,
      parentId: v.parentId ?? null,
      showWhen: v.parentId ? (v.showWhen ?? null) : null,
      label: v.label,
      helpText: v.helpText ?? null,
      type: v.type,
      audience: v.audience,
      required: v.required,
      sortOrder: await nextQuestionOrder(v.sectionId),
      ...typedColumns(v),
      ...(v.type === "SELECT" && {
        options: {
          create: v.options.map((o, i) => ({ clinicId, label: o.label, sortOrder: i })),
        },
      }),
    },
    select: { id: true },
  });
  return ok(row);
}

/**
 * Edit a question. Rules that keep existing answers valid:
 *  - `type` can't change once answered (archive + add a new question instead);
 *  - moving to another section is not offered (it would break follow-up links);
 *  - SELECT options: kept ids are renamed/reordered in place; removed ones are
 *    archived if anyone picked them, deleted otherwise; new ones are created.
 * Old answers keep their value + questionSnapshot; new bounds apply to new saves.
 */
export async function updateQuestion(
  clinicId: string,
  id: string,
  input: unknown
): Promise<Result> {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) return err(firstIssue(parsed.error));
  const v = parsed.data;

  const current = await prisma.healthProfileQuestion.findFirst({
    where: { id, clinicId },
    include: { options: true, _count: { select: { followUps: { where: { archivedAt: null } } } } },
  });
  if (!current) return err("السؤال غير موجود");
  if (v.sectionId !== current.sectionId) return err("لا يمكن نقل السؤال إلى قسم آخر.");

  if (v.type !== current.type) {
    const answered = await prisma.patientHealthAnswer.count({ where: { questionId: id } });
    if (answered > 0)
      return err("لا يمكن تغيير نوع سؤال تمت الإجابة عليه. أرشِفه وأضف سؤالاً جديداً.");
  }
  if (current._count.followUps > 0 && (v.type !== "BOOLEAN" || v.parentId))
    return err("لهذا السؤال أسئلة متابعة — يجب أن يبقى سؤال نعم/لا أساسياً.");
  const parentError = await checkParent(clinicId, current.sectionId, v.parentId, id);
  if (parentError) return err(parentError);

  // Options diff (SELECT only).
  const keepIds = new Set(v.options.flatMap((o) => (o.id ? [o.id] : [])));
  const known = new Map(current.options.map((o) => [o.id, o]));
  for (const o of v.options) if (o.id && !known.has(o.id)) return err("خيار غير معروف.");
  const removed =
    v.type === "SELECT" ? current.options.filter((o) => !keepIds.has(o.id)) : current.options;
  const removedIds = removed.map((o) => o.id);
  const picked = removedIds.length
    ? await prisma.patientHealthAnswer.groupBy({
        by: ["optionId"],
        where: { optionId: { in: removedIds } },
      })
    : [];
  const pickedIds = new Set(picked.map((p) => p.optionId));

  await prisma.$transaction([
    prisma.healthProfileQuestion.update({
      where: { id },
      data: {
        parentId: v.parentId ?? null,
        showWhen: v.parentId ? (v.showWhen ?? null) : null,
        label: v.label,
        helpText: v.helpText ?? null,
        type: v.type,
        audience: v.audience,
        required: v.required,
        ...typedColumns(v),
      },
    }),
    // Removed options: archive the picked ones, delete the rest.
    prisma.healthQuestionOption.updateMany({
      where: { id: { in: removedIds.filter((x) => pickedIds.has(x)) } },
      data: { archivedAt: new Date() },
    }),
    prisma.healthQuestionOption.deleteMany({
      where: { id: { in: removedIds.filter((x) => !pickedIds.has(x)) } },
    }),
    ...(v.type === "SELECT"
      ? v.options.map((o, i) =>
          o.id
            ? prisma.healthQuestionOption.update({
                where: { id: o.id },
                // Re-listing an archived option restores it.
                data: { label: o.label, sortOrder: i, archivedAt: null },
              })
            : prisma.healthQuestionOption.create({
                data: { clinicId, questionId: id, label: o.label, sortOrder: i },
              })
        )
      : []),
  ]);
  return ok(undefined);
}

/** Delete if never answered (incl. its follow-ups), else archive. */
export async function removeQuestion(
  clinicId: string,
  id: string
): Promise<Result<{ archived: boolean }>> {
  const q = await prisma.healthProfileQuestion.findFirst({
    where: { id, clinicId },
    select: { id: true },
  });
  if (!q) return err("السؤال غير موجود");
  const answered = await prisma.patientHealthAnswer.count({
    where: { OR: [{ questionId: id }, { question: { parentId: id } }] },
  });
  if (answered > 0) {
    const now = new Date();
    // Archive its follow-ups with it — they can't be shown without the parent.
    await prisma.healthProfileQuestion.updateMany({
      where: { OR: [{ id }, { parentId: id }], archivedAt: null },
      data: { archivedAt: now },
    });
    return ok({ archived: true });
  }
  await prisma.healthProfileQuestion.delete({ where: { id } }); // follow-ups cascade
  return ok({ archived: false });
}

export async function restoreQuestion(clinicId: string, id: string): Promise<Result> {
  const q = await prisma.healthProfileQuestion.findFirst({
    where: { id, clinicId },
    select: { parent: { select: { archivedAt: true } }, section: { select: { archivedAt: true } } },
  });
  if (!q) return err("السؤال غير موجود");
  if (q.parent?.archivedAt) return err("استعد السؤال الأساسي أولاً.");
  if (q.section.archivedAt) return err("استعد القسم أولاً.");
  await prisma.healthProfileQuestion.update({ where: { id }, data: { archivedAt: null } });
  return ok(undefined);
}

/** Swap with the neighbour among its siblings (same section and same parent). */
export async function moveQuestion(
  clinicId: string,
  id: string,
  dir: "up" | "down"
): Promise<Result> {
  const q = await prisma.healthProfileQuestion.findFirst({
    where: { id, clinicId },
    select: { sectionId: true, parentId: true },
  });
  if (!q) return err("السؤال غير موجود");
  const siblings = await prisma.healthProfileQuestion.findMany({
    where: { sectionId: q.sectionId, parentId: q.parentId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return reorder(siblings, id, dir, (rowId, sortOrder) =>
    prisma.healthProfileQuestion.update({ where: { id: rowId }, data: { sortOrder } })
  );
}

// ─── Patient answers ─────────────────────────────────────────────────────────

/** Archived-question answers, shown read-only under the live form. */
export interface ArchivedAnswerView {
  questionId: string;
  label: string;
  display: string;
}

export interface PatientHealthProfileView {
  sections: HealthSectionView[];
  answers: AnswersMap;
  archivedAnswers: ArchivedAnswerView[];
  updatedAt: Date | null;
}

function answerValue(a: { optionId: string | null; value: Prisma.JsonValue }): AnswerValue | null {
  if (a.optionId) return a.optionId;
  const v = a.value;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
}

function displayFromSnapshot(snapshot: QuestionSnapshot, value: AnswerValue | null): string {
  if (!hasAnswer(value)) return "—";
  if (snapshot.type === "BOOLEAN") return value === true ? "نعم" : "لا";
  if (snapshot.type === "SELECT") return snapshot.optionLabel ?? "—";
  if (snapshot.type === "NUMBER" && snapshot.unit) return `${value} ${snapshot.unit}`;
  return String(value);
}

/**
 * The patient's file at this clinic: the active form + current answers, plus
 * answers to questions since archived (read-only, from their snapshot).
 * `audience: "PATIENT"` hides staff-only questions and their answers.
 */
export async function getPatientHealthProfile(
  clinicId: string,
  patientId: string,
  opts: { audience?: HealthQuestionAudience } = {}
): Promise<PatientHealthProfileView> {
  const [sections, profile] = await Promise.all([
    getClinicForm(clinicId, { audience: opts.audience }),
    prisma.patientHealthProfile.findUnique({
      where: { clinicId_patientId: { clinicId, patientId } },
      include: {
        answers: {
          include: {
            question: {
              select: {
                archivedAt: true,
                audience: true,
                section: { select: { archivedAt: true } },
                parent: { select: { archivedAt: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const answers: AnswersMap = {};
  const archivedAnswers: ArchivedAnswerView[] = [];
  let updatedAt: Date | null = null;
  for (const a of profile?.answers ?? []) {
    if (opts.audience && a.question.audience !== opts.audience) continue;
    const value = answerValue(a);
    if (!hasAnswer(value)) continue;
    if (!updatedAt || a.updatedAt > updatedAt) updatedAt = a.updatedAt;
    const archived =
      a.question.archivedAt || a.question.section.archivedAt || a.question.parent?.archivedAt;
    if (archived) {
      const snap = a.questionSnapshot as unknown as QuestionSnapshot;
      archivedAnswers.push({
        questionId: a.questionId,
        label: snap.label,
        display: displayFromSnapshot(snap, value),
      });
    } else {
      answers[a.questionId] = value;
    }
  }
  return { sections, answers, archivedAnswers, updatedAt };
}

/**
 * Booking gate. Returns the required patient questions still missing, or []
 * when the patient may book: either everything required is answered, or they
 * already have an appointment at this clinic (existing patients are never
 * blocked by questions added later — they're asked, not stopped).
 */
export async function missingForBooking(
  clinicId: string,
  patientId: string
): Promise<HealthQuestionView[]> {
  const hasBooked = await prisma.appointment.findFirst({
    where: { clinicId, patientId },
    select: { id: true },
  });
  if (hasBooked) return [];
  const view = await getPatientHealthProfile(clinicId, patientId, { audience: "PATIENT" });
  return missingRequired(view.sections, view.answers);
}

/** All required patient questions still unanswered (ignores the booking exemption). */
export async function missingRequiredAnswers(
  clinicId: string,
  patientId: string
): Promise<HealthQuestionView[]> {
  const view = await getPatientHealthProfile(clinicId, patientId, { audience: "PATIENT" });
  return missingRequired(view.sections, view.answers);
}

/**
 * Save some answers (partial update: only the questions listed change).
 * `null`/"" clears an answer — the row is kept so its history survives.
 *
 * `writer` decides what may be written:
 *  - PATIENT / AGENT: PATIENT-audience questions only.
 *  - STAFF: every question.
 * Unchanged values are skipped (no revision noise). An unchanged answer that
 * points at a since-archived option is accepted as-is.
 */
export async function saveAnswers(params: {
  clinicId: string;
  patientId: string;
  answers: Record<string, unknown>;
  source: HealthAnswerSource;
  actorId: string;
}): Promise<Result<{ changed: number }>> {
  const { clinicId, patientId, source, actorId } = params;
  const entries = Object.entries(params.answers);
  if (entries.length === 0) return ok({ changed: 0 });
  if (entries.length > 200) return err("عدد الإجابات كبير جداً");

  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: patientId, clinicId } },
    select: { role: true },
  });
  if (member?.role !== Role.PATIENT) return err("المريض غير موجود");

  const ids = entries.map(([id]) => id);
  const rows = await prisma.healthProfileQuestion.findMany({
    where: { id: { in: ids }, clinicId },
    include: { ...questionInclude, section: { select: { archivedAt: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const profile = await prisma.patientHealthProfile.findUnique({
    where: { clinicId_patientId: { clinicId, patientId } },
    include: { answers: { where: { questionId: { in: ids } } } },
  });
  const existing = new Map((profile?.answers ?? []).map((a) => [a.questionId, a]));

  const changes: { q: HealthQuestionView; value: AnswerValue | null; prev: AnswerValue | null }[] =
    [];
  for (const [questionId, raw] of entries) {
    const row = byId.get(questionId);
    if (!row) return err("سؤال غير معروف");
    if (source !== "STAFF" && row.audience !== "PATIENT") return err("سؤال غير معروف");
    const q = toQuestionView(row);
    const prevRow = existing.get(questionId);
    const prev = prevRow ? answerValue(prevRow) : null;

    const parsed = parseAnswer(q, raw);
    let value: AnswerValue | null;
    if (parsed.ok) {
      value = parsed.value;
      if (
        q.type === "SELECT" &&
        value !== null &&
        q.options.find((o) => o.id === value)?.archived
      ) {
        if (value !== prev) return err(`«${q.label}»: هذا الخيار لم يعد متاحاً.`);
      }
    } else {
      return err(parsed.error);
    }
    const isArchived = row.archivedAt !== null || row.section.archivedAt !== null;
    if (value === prev || (!hasAnswer(value) && !hasAnswer(prev))) continue;
    if (isArchived) return err(`«${q.label}»: هذا السؤال لم يعد مستخدماً.`);
    changes.push({ q, value, prev });
  }
  if (changes.length === 0) return ok({ changed: 0 });

  try {
    await prisma.$transaction(async (tx) => {
      const prof =
        profile ??
        (await tx.patientHealthProfile.upsert({
          where: { clinicId_patientId: { clinicId, patientId } },
          update: {},
          create: { clinicId, patientId },
        }));
      for (const { q, value, prev } of changes) {
        const isSelect = q.type === "SELECT";
        const data = {
          optionId: isSelect && value !== null ? (value as string) : null,
          value: !isSelect && value !== null ? (value as Prisma.InputJsonValue) : Prisma.DbNull,
          questionSnapshot: buildSnapshot(q, value) as unknown as Prisma.InputJsonValue,
          source,
          updatedById: actorId,
        };
        const answer = await tx.patientHealthAnswer.upsert({
          where: { profileId_questionId: { profileId: prof.id, questionId: q.id } },
          update: data,
          create: { ...data, profileId: prof.id, clinicId, questionId: q.id },
          select: { id: true },
        });
        await tx.patientHealthAnswerRevision.create({
          data: {
            answerId: answer.id,
            clinicId,
            oldValue: prev === null ? Prisma.DbNull : (prev as Prisma.InputJsonValue),
            newValue: value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue),
            source,
            editedById: actorId,
          },
        });
      }
      await tx.patientHealthProfile.update({
        where: { id: prof.id },
        data: { updatedAt: new Date() },
      });
    });
    return ok({ changed: changes.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حفظ ملف المريض");
  }
}

// ─── Edit history ────────────────────────────────────────────────────────────

export interface AnswerRevisionView {
  id: string;
  questionLabel: string;
  oldDisplay: string;
  newDisplay: string;
  source: HealthAnswerSource;
  editedBy: string;
  editedAt: Date;
}

/** Newest first. Values are rendered against the current snapshot/options. */
export async function listAnswerRevisions(
  clinicId: string,
  patientId: string,
  limit = 100
): Promise<AnswerRevisionView[]> {
  const rows = await prisma.patientHealthAnswerRevision.findMany({
    where: { clinicId, answer: { profile: { patientId } } },
    orderBy: { editedAt: "desc" },
    take: limit,
    include: {
      editedBy: { select: { fullName: true } },
      answer: {
        select: {
          questionSnapshot: true,
          question: { include: questionInclude },
        },
      },
    },
  });
  return rows.map((r) => {
    const q = toQuestionView(r.answer.question);
    const snap = r.answer.questionSnapshot as unknown as QuestionSnapshot;
    const show = (v: Prisma.JsonValue) => {
      const val =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
      if (!hasAnswer(val)) return "—";
      if (q.type === "BOOLEAN") return val === true ? "نعم" : "لا";
      if (q.type === "SELECT") return q.options.find((o) => o.id === val)?.label ?? "—";
      if (q.type === "NUMBER" && q.unit) return `${val} ${q.unit}`;
      return String(val);
    };
    return {
      id: r.id,
      questionLabel: q.label || snap.label,
      oldDisplay: show(r.oldValue),
      newDisplay: show(r.newValue),
      source: r.source,
      editedBy: r.editedBy.fullName,
      editedAt: r.editedAt,
    };
  });
}

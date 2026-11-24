import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AppointmentStatus, ConversationKind, Role, SenderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pageRequest } from "@/lib/pagination";
import { branchIdFilter } from "@/lib/branch-scope";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { conversationScopeWhere, messageScopeWhere } from "@/lib/inbox-scope";
import * as AppointmentService from "@/server/services/appointments";
import * as UserService from "@/server/services/users";
import * as Scope from "@/server/services/branchScope";
import { listInboxTeammates } from "@/server/services/inbox";
import { personSearch, phoneDigits } from "@/server/services/_search";
import { listPatientRecords } from "@/server/services/treatments";
import { jsonTool, pageField, pageInfo } from "../shared";
import type { StaffToolContext } from "./pending";
import {
  actorInboxScope,
  appointmentBrief,
  appointmentBriefs,
  can,
  contactName,
  dateField,
  statusLabel,
} from "./helpers";

const PAGE_SIZE = 15;
const statusField = z
  .nativeEnum(AppointmentStatus)
  .nullable()
  .describe("حالة الموعد: PENDING قيد الانتظار، CONFIRMED مؤكد، CANCELLED ملغي، COMPLETED مكتمل، NO_SHOW لم يحضر");

/** The member's clinic-wide customer conversations (never team threads). */
function customerConversations(clinicId: string): Prisma.ConversationWhereInput {
  return { clinicId, kind: ConversationKind.CUSTOMER };
}

/** Read tools for ADMIN / STAFF, each built only when the member holds its permission. */
export function staffReadTools(ctx: StaffToolContext): DynamicStructuredTool[] {
  const { clinicId, staff } = ctx;
  const scope = staff.branchIds;
  const tools: DynamicStructuredTool[] = [];

  if (can(staff, "appointments", "doctors", "reports")) {
    tools.push(
      jsonTool(
        {
          name: "list_clinic_appointments",
          description:
            "اعرض مواعيد العيادة (ضمن فروع المستخدم) مع إمكانية التصفية بيوم محدد أو طبيب أو فرع أو حالة أو اسم/هاتف المريض، أو المواعيد القادمة فقط. يعيد total للعدّ المباشر.",
          schema: z.object({
            date: dateField.nullable().describe("يوم الزيارة YYYY-MM-DD"),
            upcoming: z.boolean().nullable().describe("المواعيد القادمة المفتوحة فقط"),
            status: statusField,
            doctorId: z.string().nullable(),
            branchId: z.string().nullable(),
            patientQuery: z.string().nullable().describe("اسم المريض أو رقم هاتفه"),
            page: pageField,
          }),
        },
        async (input) => {
          const res = await AppointmentService.listAppointments(
            clinicId,
            {
              date: input.date ?? undefined,
              upcoming: input.upcoming ?? undefined,
              status: input.status ?? undefined,
              doctorId: input.doctorId ?? undefined,
              branchId: input.branchId ?? undefined,
              patientQuery: input.patientQuery ?? undefined,
              branchScope: scope,
            },
            pageRequest(input.page ?? 1, PAGE_SIZE)
          );
          return {
            ...pageInfo(res),
            appointments: await appointmentBriefs(
              res.items.map((a) => a.id),
              clinicId
            ),
          };
        }
      ),
      jsonTool(
        {
          name: "appointments_day_summary",
          description:
            "ملخص مواعيد يوم محدد: العدد حسب الحالة وحسب الطبيب (ضمن فروع المستخدم). استخدمه لأسئلة مثل «كم موعد عندنا بكرة؟».",
          schema: z.object({
            date: dateField,
            branchId: z.string().nullable(),
            doctorId: z.string().nullable(),
          }),
        },
        async ({ date, branchId, doctorId }) => {
          const day = new Date(date);
          const where: Prisma.AppointmentWhereInput = {
            clinicId,
            OR: [{ slot: { date: day } }, { bookingDate: day }],
            ...(doctorId ? { doctorId } : {}),
            AND: [branchIdFilter(scope), ...(branchId ? [{ branchId }] : [])],
          };
          const [byStatus, byDoctor] = await Promise.all([
            prisma.appointment.groupBy({ by: ["status"], where, _count: { _all: true } }),
            prisma.appointment.groupBy({ by: ["doctorId"], where, _count: { _all: true } }),
          ]);
          const doctors = await prisma.doctor.findMany({
            where: { id: { in: byDoctor.map((d) => d.doctorId) } },
            select: { id: true, fullName: true },
          });
          const names = new Map(doctors.map((d) => [d.id, d.fullName]));
          return {
            date,
            total: byStatus.reduce((n, r) => n + r._count._all, 0),
            byStatus: byStatus.map((r) => ({
              status: r.status,
              label: statusLabel(r.status),
              count: r._count._all,
            })),
            byDoctor: byDoctor.map((r) => ({
              doctorId: r.doctorId,
              doctor: names.get(r.doctorId) ?? "",
              count: r._count._all,
            })),
          };
        }
      ),
      jsonTool(
        {
          name: "get_clinic_appointment",
          description: "تفاصيل موعد واحد بالمعرّف (المريض، الطبيب، الموعد، الفرع، الحالة، الملاحظات).",
          schema: z.object({ appointmentId: z.string() }),
        },
        async ({ appointmentId }) => {
          if (!(await Scope.appointmentInScope(appointmentId, clinicId, scope)))
            return { error: "الموعد غير موجود" };
          return (await appointmentBrief(clinicId, appointmentId)) ?? { error: "الموعد غير موجود" };
        }
      )
    );
  }

  // Finding a patient is allowed to anyone who books or manages them — a
  // permission opens a section, it doesn't block the lookups it needs.
  if (can(staff, "patients", "appointments", "medical_records", "messages")) {
    tools.push(
      jsonTool(
        {
          name: "search_patients",
          description: "ابحث عن مرضى العيادة بالاسم أو رقم الهاتف. يعيد المعرّف (patientId) والاسم والهاتف.",
          schema: z.object({ query: z.string() }),
        },
        async ({ query }) => {
          if (!query.trim()) return { error: "اكتب اسماً أو رقماً للبحث" };
          const res = await UserService.listUsers(
            clinicId,
            { query, role: Role.PATIENT },
            pageRequest(1, 10)
          );
          return {
            total: res.total,
            patients: res.items.map((u) => ({ patientId: u.id, name: u.fullName, phone: u.phone })),
          };
        }
      )
    );
  }

  if (can(staff, "medical_records")) {
    tools.push(
      jsonTool(
        {
          name: "get_patient_medical_file",
          description:
            "السجل الطبي لمريض في العيادة: الزيارات السابقة، الشكوى، التشخيص، الإجراءات والروشتات.",
          schema: z.object({ patientId: z.string() }),
        },
        async ({ patientId }) => {
          if (!(await UserService.isClinicPatient(patientId, clinicId)))
            return { error: "المريض غير موجود في هذه العيادة" };
          return medicalFile(clinicId, patientId);
        }
      )
    );
  }

  if (can(staff, "messages")) {
    tools.push(
      jsonTool(
        {
          name: "list_open_escalations",
          description:
            "التصعيدات المفتوحة التي تنتظر رد الفريق (من المحادثات التي يمكن للمستخدم رؤيتها)، الأحدث أولاً.",
          schema: z.object({ page: pageField }),
        },
        async ({ page }) => {
          const numbers = await actorInboxScope(clinicId, staff);
          const where: Prisma.EscalationWhereInput = {
            clinicId,
            resolvedAt: null,
            conversation: { AND: [customerConversations(clinicId), conversationScopeWhere(numbers)] },
          };
          const req = pageRequest(page ?? 1, PAGE_SIZE);
          const [total, rows] = await Promise.all([
            prisma.escalation.count({ where }),
            prisma.escalation.findMany({
              where,
              orderBy: { createdAt: "desc" },
              skip: (req.page - 1) * req.pageSize,
              take: req.pageSize,
              select: {
                id: true,
                reason: true,
                createdAt: true,
                conversationId: true,
                conversation: {
                  select: {
                    whatsappName: true,
                    whatsappPhone: true,
                    user: { select: { fullName: true } },
                  },
                },
              },
            }),
          ]);
          return {
            ...pageInfo({ total, page: req.page, hasMore: req.page * req.pageSize < total }),
            escalations: rows.map((e) => ({
              escalationId: e.id,
              conversationId: e.conversationId,
              contact: contactName(e.conversation),
              reason: escalationReasonLabel(e.reason),
              at: e.createdAt.toISOString(),
            })),
          };
        }
      ),
      jsonTool(
        {
          name: "find_conversations",
          description:
            "ابحث عن محادثات العملاء باسم العميل أو رقم هاتفه. يعيد معرّف المحادثة وحالة المساعد فيها ومن أُسندت إليه وهل فيها تصعيد مفتوح.",
          schema: z.object({ query: z.string() }),
        },
        async ({ query }) => {
          const q = query.trim();
          if (!q) return { error: "اكتب اسماً أو رقماً للبحث" };
          const numbers = await actorInboxScope(clinicId, staff);
          const phone = phoneDigits(q);
          const person = personSearch(q);
          const rows = await prisma.conversation.findMany({
            where: {
              AND: [
                customerConversations(clinicId),
                conversationScopeWhere(numbers),
                {
                  OR: [
                    { whatsappName: { contains: q, mode: "insensitive" } },
                    ...(phone ? [{ whatsappPhone: { contains: phone } }] : []),
                    ...(person ? [{ user: person }] : []),
                  ],
                },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: 8,
            select: {
              id: true,
              channel: true,
              updatedAt: true,
              whatsappName: true,
              whatsappPhone: true,
              user: { select: { fullName: true } },
              assignedTo: { select: { fullName: true } },
              escalations: { where: { resolvedAt: null }, select: { id: true }, take: 1 },
              sessions: {
                orderBy: { startedAt: "desc" },
                take: 1,
                select: { aiEnabled: true },
              },
            },
          });
          return {
            conversations: rows.map((c) => ({
              conversationId: c.id,
              contact: contactName(c),
              phone: c.whatsappPhone,
              channel: c.channel,
              lastActivity: c.updatedAt.toISOString(),
              assignedTo: c.assignedTo?.fullName ?? null,
              openEscalation: c.escalations.length > 0,
              aiEnabled: c.sessions[0]?.aiEnabled ?? true,
            })),
          };
        }
      ),
      jsonTool(
        {
          name: "get_conversation_messages",
          description:
            "آخر رسائل محادثة عميل (ماذا قال العميل وبماذا ردّ المساعد أو الفريق). استخدمه للإجابة عن «ماذا طلب العميل فلان؟».",
          schema: z.object({
            conversationId: z.string(),
            limit: z.number().int().nullable().describe("عدد الرسائل (افتراضياً 20، بحد أقصى 50)"),
          }),
        },
        async ({ conversationId, limit }) => {
          const numbers = await actorInboxScope(clinicId, staff);
          const conv = await prisma.conversation.findFirst({
            where: {
              id: conversationId,
              AND: [customerConversations(clinicId), conversationScopeWhere(numbers)],
            },
            select: {
              whatsappName: true,
              whatsappPhone: true,
              user: { select: { fullName: true } },
            },
          });
          if (!conv) return { error: "المحادثة غير موجودة" };
          const take = Math.min(Math.max(limit ?? 20, 1), 50);
          const rows = await prisma.message.findMany({
            where: { conversationId, ...messageScopeWhere(numbers) },
            orderBy: { createdAt: "desc" },
            take,
            select: {
              content: true,
              senderType: true,
              createdAt: true,
              sender: { select: { fullName: true } },
            },
          });
          return {
            contact: contactName(conv),
            messages: rows.reverse().map((m) => ({
              from:
                m.senderType === SenderType.USER
                  ? "العميل"
                  : m.senderType === SenderType.AGENT
                    ? "المساعد الذكي"
                    : `الفريق (${m.sender?.fullName ?? ""})`,
              text: m.content.slice(0, 1000),
              at: m.createdAt.toISOString(),
            })),
          };
        }
      ),
      jsonTool(
        {
          name: "list_inbox_team",
          description: "أعضاء الفريق الذين يمكن إسناد المحادثات إليهم (المعرّف userId والاسم).",
          schema: z.object({}),
        },
        async () => ({
          members: (await listInboxTeammates(clinicId)).map((m) => ({
            userId: m.id,
            name: m.fullName,
          })),
        })
      )
    );
  }

  return tools;
}

/** A patient's medical history in this clinic, trimmed for the model. */
export async function medicalFile(clinicId: string, patientId: string) {
  const [patient, records] = await Promise.all([
    prisma.profile.findUnique({ where: { id: patientId }, select: { fullName: true } }),
    listPatientRecords({ clinicId, patientId }),
  ]);
  return {
    patient: patient?.fullName ?? "",
    records: records.slice(0, 15).map((r) => ({
      visitDate: r.visitDate.toISOString().slice(0, 10),
      doctor: r.doctorName,
      chiefComplaint: r.chiefComplaint,
      diagnosis: r.diagnosis,
      notes: r.clinicalNotes,
      followUpDate: r.followUpDate?.toISOString().slice(0, 10) ?? null,
      procedures: r.procedures.map((p) => p.name),
      prescriptions: r.prescriptions.map((p) =>
        [p.drugName, p.dose, p.frequency].filter(Boolean).join(" ")
      ),
    })),
    totalRecords: records.length,
  };
}

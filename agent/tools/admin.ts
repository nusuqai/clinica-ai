import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/evolution";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as UserService from "@/server/services/users";
import { getDashboardStats } from "@/server/services/reports";
import type { AgentContext } from "@/agent/types";
import { jsonTool, dateStr, timeStr } from "./shared";

export function adminTools(ctx: AgentContext): DynamicStructuredTool[] {
  return [
    jsonTool(
      {
        name: "list_all_doctors",
        description: "اعرض كل الأطباء (نشطين وغير نشطين).",
        schema: z.object({}),
      },
      async () => {
        const doctors = await DoctorService.listDoctors();
        return {
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.profile.fullName,
            specialty: d.specialty,
            isActive: d.isActive,
            appointments: d._count.appointments,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "create_doctor_account",
        description: "أنشئ حساب طبيب جديد بالكامل (مصادقة + ملف + سجل طبيب).",
        schema: z.object({
          email: z.string(),
          password: z.string(),
          fullName: z.string(),
          phone: z.string().nullable(),
          specialty: z.string(),
          bio: z.string().nullable(),
          consultationFee: z.number().nullable(),
        }),
      },
      async (input) => {
        const res = await DoctorService.createDoctorAccount({
          ...input,
          phone: input.phone ?? undefined,
          bio: input.bio ?? undefined,
          consultationFee: input.consultationFee ?? undefined,
        });
        if (!res.ok) return { error: res.error };
        return { doctorId: res.data.id, fullName: res.data.fullName };
      },
    ),
    jsonTool(
      {
        name: "update_doctor",
        description: "حدّث بيانات طبيب.",
        schema: z.object({
          doctorId: z.string(),
          specialty: z.string().nullable(),
          bio: z.string().nullable(),
          consultationFee: z.number().nullable(),
          fullName: z.string().nullable(),
          phone: z.string().nullable(),
        }),
      },
      async (input) => {
        const res = await DoctorService.updateDoctor({
          ...input,
          specialty: input.specialty ?? undefined,
          bio: input.bio ?? undefined,
          consultationFee: input.consultationFee ?? undefined,
          fullName: input.fullName ?? undefined,
          phone: input.phone ?? undefined,
        });
        return res.ok
          ? { updated: true, doctorId: input.doctorId }
          : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "set_doctor_active",
        description: "فعّل أو عطّل طبيباً.",
        schema: z.object({ doctorId: z.string(), isActive: z.boolean() }),
      },
      async ({ doctorId, isActive }) => {
        const res = await DoctorService.setDoctorActive(doctorId, isActive);
        return res.ok ? { doctorId, isActive } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "list_users",
        description: "اعرض كل المستخدمين مع أدوارهم وبريدهم.",
        schema: z.object({}),
      },
      async () => {
        const users = await UserService.listUsers();
        return {
          users: users.map((u) => ({
            id: u.id,
            name: u.fullName,
            email: u.email,
            role: u.role,
            phone: u.phone,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "update_user_role",
        description: "غيّر دور مستخدم (PATIENT/DOCTOR/ADMIN).",
        schema: z.object({
          userId: z.string(),
          role: z.enum(["PATIENT", "DOCTOR", "ADMIN"]),
        }),
      },
      async ({ userId, role }) => {
        const res = await UserService.updateUserRole(userId, role);
        return res.ok ? { userId, role } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "list_all_appointments",
        description:
          "اعرض كل المواعيد مع إمكانية التصفية بالحالة أو الطبيب أو المريض.",
        schema: z.object({
          status: z
            .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
            .nullable(),
          doctorId: z.string().nullable(),
          patientId: z.string().nullable(),
        }),
      },
      async (filters) => {
        const appts = await AppointmentService.listAppointments({
          status: filters.status ?? undefined,
          doctorId: filters.doctorId ?? undefined,
          patientId: filters.patientId ?? undefined,
        });
        return {
          appointments: appts.slice(0, 50).map((a) => ({
            id: a.id,
            status: a.status,
            patientName: a.patient.fullName,
            doctorName: a.doctor.profile.fullName,
            date: dateStr(a.slot.date),
            time: timeStr(a.slot.startTime),
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_dashboard_stats",
        description: "اعرض إحصائيات لوحة تحكم العيادة.",
        schema: z.object({}),
      },
      async () => getDashboardStats(),
    ),
    jsonTool(
      {
        name: "list_doctor_rules",
        description: "اعرض قواعد التوفر الأسبوعية لطبيب معيّن.",
        schema: z.object({ doctorId: z.string() }),
      },
      async ({ doctorId }) => {
        const rules = await DoctorService.listDoctorRules(doctorId);
        return {
          rules: rules.map((r) => ({
            id: r.id,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            slotDurationMin: r.slotDurationMin,
            isActive: r.isActive,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "create_availability_rule",
        description:
          "أنشئ قاعدة توفر أسبوعية لطبيب معيّن وولّد الفترات لها تلقائياً.",
        schema: z.object({
          doctorId: z.string(),
          dayOfWeek: z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]),
          startTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          endTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          slotDurationMin: z.number().nullable(),
        }),
      },
      async ({ doctorId, dayOfWeek, startTime, endTime, slotDurationMin }) => {
        const res = await DoctorService.createRule({
          doctorId,
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMin: slotDurationMin ?? undefined,
        });
        if (!res.ok) return { error: res.error };
        return { ruleId: res.data.id, doctorId, dayOfWeek, startTime, endTime };
      },
    ),
    jsonTool(
      {
        name: "delete_availability_rule",
        description:
          "احذف قاعدة توفر (يحذف أيضاً فتراتها المستقبلية غير المحجوزة).",
        schema: z.object({ ruleId: z.string() }),
      },
      async ({ ruleId }) => {
        const res = await DoctorService.deleteRule(ruleId);
        return res.ok ? { deleted: true, ruleId } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "toggle_rule_active",
        description: "فعّل أو عطّل قاعدة توفر.",
        schema: z.object({ ruleId: z.string(), isActive: z.boolean() }),
      },
      async ({ ruleId, isActive }) => {
        const res = await DoctorService.toggleRuleActive(ruleId, isActive);
        return res.ok ? { ruleId, isActive } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "generate_slots",
        description: "ولّد فترات زمنية إضافية لقاعدة توفر معيّنة.",
        schema: z.object({
          ruleId: z.string(),
          daysAhead: z.number().nullable(),
        }),
      },
      async ({ ruleId, daysAhead }) => {
        const res = await DoctorService.generateSlotsForRule(
          ruleId,
          daysAhead ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { ruleId, generated: res.data.count };
      },
    ),
    jsonTool(
      {
        name: "list_doctor_slots",
        description:
          "اعرض فترات طبيب معيّن ضمن نطاق تاريخ (YYYY-MM-DD)، اختياري.",
        schema: z.object({
          doctorId: z.string(),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
            .nullable(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
            .nullable(),
        }),
      },
      async ({ doctorId, from, to }) => {
        const slots = await DoctorService.listDoctorSlots(doctorId, {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        });
        return {
          slots: slots.map((s) => ({
            id: s.id,
            date: dateStr(s.date),
            time: timeStr(s.startTime),
            isBlocked: s.isBlocked,
            booked: !!s.appointment,
            patientName: s.appointment?.patient.fullName ?? null,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "toggle_slot_blocked",
        description: "عطّل أو أعد تفعيل فترة زمنية غير محجوزة.",
        schema: z.object({ slotId: z.string() }),
      },
      async ({ slotId }) => {
        const res = await DoctorService.toggleSlotBlocked(slotId);
        return res.ok ? { slotId, toggled: true } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "send_message_to_conversation",
        description:
          "أرسل رسالة إلى محادثة موجودة (تصل عبر واتساب إن كانت القناة واتساب).",
        schema: z.object({ conversationId: z.string(), content: z.string() }),
      },
      async ({ conversationId, content }) => {
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });
        if (!conv) return { error: "المحادثة غير موجودة" };
        await prisma.message.create({
          data: {
            conversationId,
            senderType: "ADMIN",
            senderId: ctx.actorId,
            content,
            isRead: true,
          },
        });
        if (conv.channel === "WHATSAPP" && conv.whatsappPhone) {
          await sendTextMessage(conv.whatsappPhone, content);
        }
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        return { sent: true, conversationId };
      },
    ),
  ];
}

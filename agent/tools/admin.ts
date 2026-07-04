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

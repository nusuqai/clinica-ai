import "server-only";
import { z } from "zod";
import { AppointmentStatus, Channel, DayOfWeek, SenderType } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/meta/whatsapp";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as UserService from "@/server/services/users";
import * as BranchService from "@/server/services/branches";
import * as SpecialtyService from "@/server/services/specialties";
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
        const doctors = await DoctorService.listDoctors(ctx.clinicId);
        return {
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.profile.fullName,
            title: d.title,
            specialty: d.specialty,
            qualifications: d.qualifications,
            expertiseAreas: d.expertiseAreas,
            isActive: d.isActive,
            examinationFee: d.examinationFee ? Number(d.examinationFee) : null,
            consultationFee: d.consultationFee ? Number(d.consultationFee) : null,
            yearsOfExperience: d.yearsOfExperience,
            acceptsChildren: d.acceptsChildren,
            requiresAdvanceBooking: d.requiresAdvanceBooking,
            appointments: d._count.appointments,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "create_doctor_account",
        description:
          "أنشئ حساب طبيب جديد بالكامل (مصادقة + ملف + سجل طبيب). حدّد التخصص إمّا بـ specialtyId من list_specialties أو باسم تخصص جديد في specialtyName (سيُنشأ تلقائياً).",
        schema: z.object({
          email: z.string(),
          password: z.string(),
          fullName: z.string(),
          phone: z.string().nullable(),
          title: z
            .enum(["SPECIALIST", "CONSULTANT"])
            .nullable()
            .describe("درجة الطبيب: SPECIALIST=أخصائي، CONSULTANT=استشاري"),
          specialtyId: z.string().nullable().describe("معرّف تخصص موجود"),
          specialtyName: z.string().nullable().describe("اسم تخصص جديد (يُنشأ إن لم يوجد)"),
          qualifications: z.string().nullable().describe("المؤهلات العلمية"),
          expertiseAreas: z.string().nullable().describe("مجالات الخبرة الدقيقة"),
          bio: z.string().nullable(),
          yearsOfExperience: z.number().nullable(),
          examinationFee: z.number().nullable().describe("سعر الكشف"),
          consultationFee: z.number().nullable().describe("سعر الاستشارة"),
          requiresAdvanceBooking: z.boolean().nullable(),
          acceptsChildren: z.boolean().nullable(),
          branchIds: z.array(z.string()).nullable().describe("معرّفات فروع عمل الطبيب"),
        }),
      },
      async (input) => {
        const spec = await SpecialtyService.resolveSpecialtyId(ctx.clinicId, {
          specialtyId: input.specialtyId,
          newSpecialtyName: input.specialtyName,
        });
        if (!spec.ok) return { error: spec.error };
        const res = await DoctorService.createDoctorAccount({
          email: input.email,
          password: input.password,
          fullName: input.fullName,
          clinicId: ctx.clinicId,
          phone: input.phone ?? undefined,
          title: input.title ?? undefined,
          specialtyId: spec.data,
          qualifications: input.qualifications ?? undefined,
          expertiseAreas: input.expertiseAreas ?? undefined,
          bio: input.bio ?? undefined,
          yearsOfExperience: input.yearsOfExperience ?? undefined,
          examinationFee: input.examinationFee ?? undefined,
          consultationFee: input.consultationFee ?? undefined,
          requiresAdvanceBooking: input.requiresAdvanceBooking ?? undefined,
          acceptsChildren: input.acceptsChildren ?? undefined,
          branchIds: input.branchIds ?? undefined,
        });
        if (!res.ok) return { error: res.error };
        return { doctorId: res.data.id, fullName: res.data.fullName };
      },
    ),
    jsonTool(
      {
        name: "update_doctor",
        description:
          "حدّث بيانات طبيب. لتغيير التخصص استخدم specialtyId من list_specialties أو specialtyName لتخصص جديد.",
        schema: z.object({
          doctorId: z.string(),
          title: z
            .enum(["SPECIALIST", "CONSULTANT"])
            .nullable()
            .describe("درجة الطبيب: SPECIALIST=أخصائي، CONSULTANT=استشاري"),
          specialtyId: z.string().nullable(),
          specialtyName: z.string().nullable(),
          qualifications: z.string().nullable().describe("المؤهلات العلمية"),
          expertiseAreas: z.string().nullable().describe("مجالات الخبرة الدقيقة"),
          bio: z.string().nullable(),
          yearsOfExperience: z.number().nullable(),
          examinationFee: z.number().nullable().describe("سعر الكشف"),
          consultationFee: z.number().nullable().describe("سعر الاستشارة"),
          requiresAdvanceBooking: z.boolean().nullable(),
          acceptsChildren: z.boolean().nullable(),
          fullName: z.string().nullable(),
          phone: z.string().nullable(),
        }),
      },
      async (input) => {
        // Only touch specialty when the caller supplied one.
        let specialtyId: string | undefined;
        if (input.specialtyId || input.specialtyName) {
          const spec = await SpecialtyService.resolveSpecialtyId(ctx.clinicId, {
            specialtyId: input.specialtyId,
            newSpecialtyName: input.specialtyName,
          });
          if (!spec.ok) return { error: spec.error };
          specialtyId = spec.data ?? undefined;
        }
        const res = await DoctorService.updateDoctor({
          doctorId: input.doctorId,
          title: input.title ?? undefined,
          specialtyId,
          qualifications: input.qualifications ?? undefined,
          expertiseAreas: input.expertiseAreas ?? undefined,
          bio: input.bio ?? undefined,
          yearsOfExperience: input.yearsOfExperience ?? undefined,
          examinationFee: input.examinationFee ?? undefined,
          consultationFee: input.consultationFee ?? undefined,
          requiresAdvanceBooking: input.requiresAdvanceBooking ?? undefined,
          acceptsChildren: input.acceptsChildren ?? undefined,
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
        const users = await UserService.listUsers(ctx.clinicId);
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
        const res = await UserService.updateUserRole(userId, ctx.clinicId, role);
        return res.ok ? { userId, role } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "list_all_appointments",
        description:
          "اعرض كل المواعيد مع إمكانية التصفية بالحالة أو الطبيب أو المريض.",
        schema: z.object({
          status: z.nativeEnum(AppointmentStatus).nullable(),
          doctorId: z.string().nullable(),
          patientId: z.string().nullable(),
        }),
      },
      async (filters) => {
        const appts = await AppointmentService.listAppointments(ctx.clinicId, {
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
      async () => getDashboardStats(ctx.clinicId),
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
            branchId: r.branchId,
            branchName: r.branch?.name ?? null,
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
          "أنشئ قاعدة توفر أسبوعية لطبيب معيّن في فرع محدّد وولّد الفترات لها. يجب أن تقع الساعات ضمن ساعات عمل الفرع في ذلك اليوم، وأن يكون الطبيب يعمل في هذا الفرع.",
        schema: z.object({
          doctorId: z.string(),
          branchId: z.string(),
          dayOfWeek: z.nativeEnum(DayOfWeek),
          startTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          endTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          slotDurationMin: z.number().nullable(),
        }),
      },
      async ({ doctorId, branchId, dayOfWeek, startTime, endTime, slotDurationMin }) => {
        const res = await DoctorService.createRule({
          doctorId,
          branchId,
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMin: slotDurationMin ?? undefined,
        });
        if (!res.ok) return { error: res.error };
        return { ruleId: res.data.id, doctorId, branchId, dayOfWeek, startTime, endTime };
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
        name: "list_all_branches",
        description: "اعرض كل فروع العيادة (بما فيها غير النشطة) مع معرّفاتها.",
        schema: z.object({}),
      },
      async () => {
        const branches = await BranchService.listBranches(ctx.clinicId);
        return {
          branches: branches.map((b) => ({
            id: b.id,
            name: b.name,
            isMain: b.isMain,
            isActive: b.isActive,
            address: b.address,
            doctors: b._count.doctors,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "create_branch",
        description:
          "أنشئ فرعاً جديداً للعيادة. ساعات العمل والهواتف تُدار من لوحة التحكم.",
        schema: z.object({
          name: z.string(),
          address: z.string().nullable(),
          mapsUrl: z.string().nullable(),
          hasParking: z.boolean().nullable(),
          parkingInfo: z.string().nullable(),
          nearestLandmark: z.string().nullable(),
          directions: z.string().nullable(),
        }),
      },
      async (input) => {
        const res = await BranchService.createBranch({
          clinicId: ctx.clinicId,
          name: input.name,
          address: input.address ?? undefined,
          mapsUrl: input.mapsUrl ?? undefined,
          hasParking: input.hasParking ?? undefined,
          parkingInfo: input.parkingInfo ?? undefined,
          nearestLandmark: input.nearestLandmark ?? undefined,
          directions: input.directions ?? undefined,
        });
        return res.ok ? { branchId: res.data.id, name: input.name } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "create_specialty",
        description: "أنشئ تخصصاً جديداً في العيادة (الاسم فريد لكل عيادة).",
        schema: z.object({ name: z.string() }),
      },
      async ({ name }) => {
        const res = await SpecialtyService.createSpecialty(ctx.clinicId, name);
        return res.ok ? { specialtyId: res.data.id, name } : { error: res.error };
      },
    ),
    jsonTool(
      {
        name: "assign_doctor_branches",
        description:
          "عيّن الفروع التي يعمل بها طبيب (يستبدل التعيين الحالي بالكامل).",
        schema: z.object({
          doctorId: z.string(),
          branchIds: z.array(z.string()),
        }),
      },
      async ({ doctorId, branchIds }) => {
        const res = await BranchService.setDoctorBranches(doctorId, branchIds);
        return res.ok ? { doctorId, branchIds } : { error: res.error };
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
            senderType: SenderType.ADMIN,
            senderId: ctx.actorId,
            content,
            isRead: true,
          },
        });
        if (
          conv.channel === Channel.WHATSAPP &&
          (conv.whatsappPhone || conv.whatsappUserId)
        ) {
          // Per-clinic credentials; a delivery failure (unconfigured clinic,
          // closed 24-hour window) must not fail the whole tool — the message
          // is already persisted in the conversation. Reach a hidden-phone
          // (username) contact by their BSUID, everyone else by phone.
          const creds = await getClinicWhatsappCredentials(conv.clinicId);
          if (creds) {
            try {
              await sendTextMessage(
                { phone: conv.whatsappPhone, userId: conv.whatsappUserId },
                content,
                creds,
              );
            } catch (err) {
              console.error("[agent] failed to deliver WhatsApp message:", err);
            }
          }
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

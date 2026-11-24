import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pageRequest } from "@/lib/pagination";
import * as AppointmentService from "@/server/services/appointments";
import * as DoctorService from "@/server/services/doctors";
import { jsonTool, pageField, pageInfo } from "../shared";
import type { StaffToolContext, WriteAction } from "./pending";
import { appointmentBrief, appointmentBriefs, briefLine, dateField, statusLabel } from "./helpers";
import { checkInAction } from "./writes";
import { medicalFile } from "./reads";

/**
 * A DOCTOR member's assistant: their OWN appointments and the files of patients
 * they have treated here — nothing clinic-wide, and no schedule changes.
 */
export function doctorReadTools(ctx: StaffToolContext): DynamicStructuredTool[] {
  const doctorId = ctx.staff.doctorId;
  if (!doctorId) return [];
  return [
    jsonTool(
      {
        name: "list_my_appointments",
        description:
          "مواعيدي كطبيب: ليوم محدد، أو القادمة، أو حسب الحالة أو اسم/هاتف المريض. يعيد total للعدّ المباشر.",
        schema: z.object({
          date: dateField.nullable(),
          upcoming: z.boolean().nullable(),
          status: z.nativeEnum(AppointmentStatus).nullable(),
          patientQuery: z.string().nullable(),
          page: pageField,
        }),
      },
      async (input) => {
        const res = await AppointmentService.getDoctorAppointmentsPage(
          doctorId,
          {
            date: input.date ?? undefined,
            upcoming: input.upcoming ?? undefined,
            status: input.status ?? undefined,
            patientQuery: input.patientQuery ?? undefined,
          },
          pageRequest(input.page ?? 1, 15)
        );
        return {
          ...pageInfo(res),
          appointments: await appointmentBriefs(
            res.items.map((a) => a.id),
            ctx.clinicId
          ),
        };
      }
    ),
    jsonTool(
      {
        name: "list_my_patients",
        description: "المرضى الذين كشفت عليهم (بحث بالاسم أو الهاتف)، الأحدث زيارةً أولاً.",
        schema: z.object({ query: z.string().nullable(), page: pageField }),
      },
      async ({ query, page }) => {
        const res = await DoctorService.getDoctorPatients(
          doctorId,
          pageRequest(page ?? 1, 15),
          query ?? undefined
        );
        return {
          ...pageInfo(res),
          patients: res.items.map((p) => ({ patientId: p.id, name: p.fullName, phone: p.phone })),
        };
      }
    ),
    jsonTool(
      {
        name: "get_patient_medical_file",
        description:
          "السجل الطبي لمريض سبق أن كشفت عليه في العيادة: الزيارات، التشخيص، الإجراءات والروشتات.",
        schema: z.object({ patientId: z.string() }),
      },
      async ({ patientId }) => {
        // Same rule as the doctor dashboard: a patient they have an appointment with.
        const treated = await prisma.appointment.findFirst({
          where: { clinicId: ctx.clinicId, doctorId, patientId },
          select: { id: true },
        });
        if (!treated) return { error: "لا يمكنك الاطلاع إلا على ملفات مرضاك" };
        return medicalFile(ctx.clinicId, patientId);
      }
    ),
  ];
}

const DOCTOR_STATUSES = [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] as const;
const myStatusSchema = z.object({
  appointmentId: z.string(),
  status: z.enum(DOCTOR_STATUSES).describe("COMPLETED تمّت الزيارة، NO_SHOW لم يحضر"),
});

async function ownAppointment(ctx: StaffToolContext, appointmentId: string) {
  const own = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId, doctorId: ctx.staff.doctorId ?? "" },
    select: { id: true },
  });
  return own ? appointmentBrief(ctx.clinicId, appointmentId) : null;
}

const updateMyStatus: WriteAction<typeof myStatusSchema> = {
  name: "update_my_appointment_status",
  description: "علّم أحد مواعيدك كـ «تمّت الزيارة» أو «لم يحضر».",
  schema: myStatusSchema,
  allowed: (a) => a.doctorId != null,
  async prepare(ctx, { appointmentId, status }) {
    const b = await ownAppointment(ctx, appointmentId);
    if (!b) return { error: "الموعد غير موجود أو ليس من مواعيدك" };
    if (b.status !== AppointmentStatus.PENDING && b.status !== AppointmentStatus.CONFIRMED)
      return { error: `لا يمكن تغيير موعد حالته «${b.statusLabel}»` };
    return { summary: `تعليم موعد ${briefLine(b)} كـ «${statusLabel(status)}»` };
  },
  async execute(ctx, { appointmentId, status }) {
    const b = await ownAppointment(ctx, appointmentId);
    if (!b) throw new Error("الموعد غير موجود أو ليس من مواعيدك");
    const res = await AppointmentService.updateAppointmentStatus(appointmentId, status);
    if (!res.ok) throw new Error(res.error);
    return { appointmentId, status, label: statusLabel(status) };
  },
};

export const DOCTOR_WRITE_ACTIONS: WriteAction[] = [
  updateMyStatus,
  checkInAction("doctor"),
] as WriteAction[];

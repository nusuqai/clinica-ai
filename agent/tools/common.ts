import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import * as DoctorService from "@/server/services/doctors";
import { jsonTool, money, timeStr } from "./shared";

/** Tools available to every caller, including unknown WhatsApp contacts. */
export function commonTools(): DynamicStructuredTool[] {
  return [
    jsonTool(
      {
        name: "get_current_datetime",
        description:
          'احصل على التاريخ والوقت الحالي. استخدمه دائماً قبل حساب مواعيد نسبية مثل "غداً" أو "بعد أسبوع".',
        schema: z.object({}),
      },
      async () => {
        const now = new Date();
        return {
          isoDate: now.toISOString().slice(0, 10),
          isoDateTime: now.toISOString(),
          arabic: now.toLocaleString("ar-EG", {
            dateStyle: "full",
            timeStyle: "short",
          }),
          weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
        };
      },
    ),
    jsonTool(
      {
        name: "list_doctors",
        description: "اعرض قائمة الأطباء المتاحين في العيادة مع تخصصاتهم.",
        schema: z.object({}),
      },
      async () => {
        const doctors = await DoctorService.listActiveDoctors();
        return {
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.profile.fullName,
            specialty: d.specialty,
            fee: money(d.consultationFee),
            bio: d.bio,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "search_doctors_by_specialty",
        description: "ابحث عن الأطباء حسب التخصص (مثل: قلب، جلدية، أطفال).",
        schema: z.object({ specialty: z.string().describe("التخصص المطلوب") }),
      },
      async ({ specialty }) => {
        const doctors = await DoctorService.listActiveDoctors();
        const q = specialty.trim();
        return {
          specialty: q,
          doctors: doctors
            .filter((d) => d.specialty.includes(q))
            .map((d) => ({
              id: d.id,
              name: d.profile.fullName,
              specialty: d.specialty,
              fee: money(d.consultationFee),
            })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_doctor_availability",
        description:
          "اعرض المواعيد المتاحة لطبيب معيّن في تاريخ محدد (بصيغة YYYY-MM-DD).",
        schema: z.object({
          doctorId: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
        }),
      },
      async ({ doctorId, date }) => {
        const doctor = await DoctorService.getDoctor(doctorId);
        if (!doctor) return { error: "الطبيب غير موجود" };
        const slots = await DoctorService.getAvailableSlotsForBooking(
          doctorId,
          new Date(date),
        );
        return {
          doctorId,
          doctorName: doctor.profile.fullName,
          date,
          slots: slots.map((s) => ({
            id: s.id,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            label: timeStr(s.startTime),
          })),
        };
      },
    ),
  ];
}

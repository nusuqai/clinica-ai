import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import * as DoctorService from "@/server/services/doctors";
import * as BranchService from "@/server/services/branches";
import { getClinicInfo } from "@/server/services/clinicInfo";
import { listSpecialties } from "@/server/services/specialties";
import { jsonTool, money, timeStr } from "./shared";

/** Arabic label for a doctor's rank (null when unset). */
function doctorTitleAr(title: string | null): string | null {
  if (title === "CONSULTANT") return "استشاري";
  if (title === "SPECIALIST") return "أخصائي";
  return null;
}

const DAY_LABELS_AR: Record<string, string> = {
  SUN: "الأحد",
  MON: "الإثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
  SAT: "السبت",
};

/** Tools available to every caller, including unknown WhatsApp contacts. */
export function commonTools(clinicId: string): DynamicStructuredTool[] {
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
        const doctors = await DoctorService.listActiveDoctors(clinicId);
        return {
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.profile.fullName,
            title: doctorTitleAr(d.title),
            specialty: d.specialty,
            qualifications: d.qualifications,
            expertiseAreas: d.expertiseAreas,
            examinationFee: money(d.examinationFee),
            consultationFee: money(d.consultationFee),
            yearsOfExperience: d.yearsOfExperience,
            acceptsChildren: d.acceptsChildren,
            requiresAdvanceBooking: d.requiresAdvanceBooking,
            bio: d.bio,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "list_specialties",
        description:
          "اعرض قائمة تخصصات العيادة المتاحة مع معرّف كل تخصص وعدد الأطباء فيه. استخدمها لمعرفة التخصصات الموجودة قبل البحث عن طبيب.",
        schema: z.object({}),
      },
      async () => {
        const specialties = await listSpecialties(clinicId);
        return {
          specialties: specialties.map((s) => ({
            id: s.id,
            name: s.name,
            doctors: s._count.doctors,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "search_doctors_by_specialty",
        description:
          "ابحث عن الأطباء حسب التخصص، إمّا بمعرّف التخصص (specialtyId من list_specialties، وهو الأدق) أو بنص التخصص (مثل: قلب، جلدية، أطفال). البحث النصي غير حسّاس لحالة الأحرف.",
        schema: z.object({
          specialtyId: z
            .string()
            .nullable()
            .describe("معرّف التخصص من list_specialties (الأدق إن توفّر)"),
          specialty: z
            .string()
            .nullable()
            .describe("نص التخصص المطلوب إن لم يتوفّر المعرّف"),
        }),
      },
      async ({ specialtyId, specialty }) => {
        const doctors = await DoctorService.listActiveDoctors(clinicId);
        const q = (specialty ?? "").trim().toLowerCase();
        const matched = doctors.filter((d) =>
          specialtyId
            ? d.specialtyId === specialtyId
            : q
              ? d.specialty.toLowerCase().includes(q)
              : true,
        );
        return {
          specialtyId: specialtyId ?? null,
          specialty: specialty ?? null,
          doctors: matched.map((d) => ({
            id: d.id,
            name: d.profile.fullName,
            title: doctorTitleAr(d.title),
            specialty: d.specialty,
            specialtyId: d.specialtyId,
            qualifications: d.qualifications,
            expertiseAreas: d.expertiseAreas,
            examinationFee: money(d.examinationFee),
            consultationFee: money(d.consultationFee),
            yearsOfExperience: d.yearsOfExperience,
            acceptsChildren: d.acceptsChildren,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_doctor_working_hours",
        description:
          "اعرض مواعيد عمل الطبيب (أيام الأسبوع وساعات العمل الثابتة) قبل عرض الفترات المتاحة. استخدمها دائماً أولاً عندما يريد المستخدم حجز موعد، حتى يختار يوماً يعمل فيه الطبيب فعلاً، ثم استخدم get_doctor_availability لعرض الفترات المتاحة في ذلك اليوم.",
        schema: z.object({ doctorId: z.string() }),
      },
      async ({ doctorId }) => {
        const doctor = await DoctorService.getDoctor(doctorId, clinicId);
        if (!doctor) return { error: "الطبيب غير موجود" };
        const rules = await DoctorService.listDoctorRules(doctorId);
        return {
          doctorId,
          doctorName: doctor.profile.fullName,
          workingHours: rules
            .filter((r) => r.isActive)
            .map((r) => ({
              day: DAY_LABELS_AR[r.dayOfWeek] ?? r.dayOfWeek,
              from: r.startTime,
              to: r.endTime,
            })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_doctor_availability",
        description:
          "اعرض الفترات (slots) المتاحة فعلياً لطبيب معيّن في تاريخ محدد (بصيغة YYYY-MM-DD). استخدمها بعد get_doctor_working_hours وبعد أن يختار المستخدم يوماً يعمل فيه الطبيب.",
        schema: z.object({
          doctorId: z.string(),
          date: z
            .string()
            .regex(
              /^\d{4}-\d{2}-\d{2}$/,
              "يجب أن يكون التاريخ بصيغة YYYY-MM-DD",
            ),
        }),
      },
      async ({ doctorId, date }) => {
        const doctor = await DoctorService.getDoctor(doctorId, clinicId);
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
    jsonTool(
      {
        name: "get_clinic_info",
        description:
          "اعرض معلومات العيادة العامة: نبذة، وأرقام الهواتف العامة، وحسابات التواصل الاجتماعي.",
        schema: z.object({}),
      },
      async () => {
        const info = await getClinicInfo(clinicId);
        if (!info) return { error: "العيادة غير موجودة" };
        return {
          name: info.name,
          description: info.description,
          phones: info.phones.map((p) => ({
            number: p.number,
            type: p.type,
            label: p.label,
            isPrimary: p.isPrimary,
          })),
          socials: info.socials.map((s) => ({ platform: s.platform, url: s.url })),
        };
      },
    ),
    jsonTool(
      {
        name: "list_branches",
        description:
          "اعرض فروع العيادة مع العنوان ورقم الهاتف الأساسي وتوفّر موقف السيارات.",
        schema: z.object({}),
      },
      async () => {
        const branches = await BranchService.listBranches(clinicId, {
          activeOnly: true,
        });
        return {
          branches: branches.map((b) => ({
            id: b.id,
            name: b.name,
            isMain: b.isMain,
            address: b.address,
            primaryPhone:
              b.phones.find((p) => p.isPrimary)?.number ??
              b.phones[0]?.number ??
              null,
            hasParking: b.hasParking,
            nearestLandmark: b.nearestLandmark,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_branch_info",
        description:
          "اعرض تفاصيل فرع محدّد: العنوان ورابط الخريطة والهواتف وساعات العمل وأيام العطلة والموقف وأقرب معلم وكيفية الوصول.",
        schema: z.object({ branchId: z.string() }),
      },
      async ({ branchId }) => {
        const b = await BranchService.getBranch(branchId, clinicId);
        if (!b) return { error: "الفرع غير موجود" };
        return {
          id: b.id,
          name: b.name,
          isMain: b.isMain,
          address: b.address,
          mapsUrl: b.mapsUrl,
          phones: b.phones.map((p) => ({
            number: p.number,
            type: p.type,
            label: p.label,
            isPrimary: p.isPrimary,
          })),
          workingHours: b.hours.map((h) => ({
            day: DAY_LABELS_AR[h.dayOfWeek] ?? h.dayOfWeek,
            isClosed: h.isClosed,
            from: h.openTime,
            to: h.closeTime,
          })),
          hasParking: b.hasParking,
          parkingInfo: b.parkingInfo,
          nearestLandmark: b.nearestLandmark,
          directions: b.directions,
        };
      },
    ),
  ];
}

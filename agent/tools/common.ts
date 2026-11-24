import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import * as DoctorService from "@/server/services/doctors";
import * as BranchService from "@/server/services/branches";
import * as QueueService from "@/server/services/queue";
import { getClinicInfo } from "@/server/services/clinicInfo";
import { listSpecialties } from "@/server/services/specialties";
import { expectedTimeAfter } from "@/lib/availability/queue-time";
import { DAY_ONLY_PATIENT_NOTE_AR, modeTag } from "@/lib/availability/modes";
import { pageRequest } from "@/lib/pagination";
import { doctorSexLabel, doctorTitleLabel } from "@/lib/doctor-title";
import { serviceNamesByDoctor } from "@/server/services/catalog";
import { lengthWith, serviceFit, visitMinutes } from "@/server/services/booking";
import {
  jsonTool,
  timeStr,
  LIST_HINT,
  pageField,
  pageInfo,
  showAllField,
  shouldAskForFilter,
  askForFilter,
  type FilterChoice,
} from "./shared";


const DAY_LABELS_AR: Record<string, string> = {
  SUN: "الأحد",
  MON: "الإثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
  SAT: "السبت",
};

const DOCTORS_PAGE_SIZE = 20;

/** Tools available to every caller, including unknown WhatsApp contacts. */
export function commonTools(clinicId: string): DynamicStructuredTool[] {
  /** One page of the clinic's active doctors, filtered in the database. */
  async function findDoctors(
    filters: DoctorService.DoctorFilters,
    page: number | null,
  ) {
    const [doctors, branches] = await Promise.all([
      DoctorService.listDoctorsPage(
        clinicId,
        { ...filters, status: "active" },
        pageRequest(page ?? 1, DOCTORS_PAGE_SIZE),
      ),
      BranchService.listBranches(clinicId, { activeOnly: true }),
    ]);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const servicesOf = await serviceNamesByDoctor(doctors.items.map((d) => d.id));
    return {
      ...pageInfo(doctors),
      doctors: doctors.items.map((d) => ({
        id: d.id,
        name: d.profile.fullName,
        title: doctorTitleLabel(d.title, d.sex),
        // Authoritative gender — the name alone can mislead.
        sex: doctorSexLabel(d.sex),
        specialty: d.specialty,
        specialtyId: d.specialtyId,
        branches: d.branchIds
          .map((id) => branchName.get(id))
          .filter((n): n is string => !!n),
        qualifications: d.qualifications,
        expertiseAreas: d.expertiseAreas,
        // What they provide — prices are per service (search_services / get_service).
        services: servicesOf.get(d.id) ?? [],
        yearsOfExperience: d.yearsOfExperience,
        acceptsChildren: d.acceptsChildren,
        requiresAdvanceBooking: d.requiresAdvanceBooking,
        bio: d.bio,
      })),
    };
  }

  /** The clinic's specialties that have doctors, as choices to narrow a doctor list. */
  async function specialtyChoices(): Promise<FilterChoice[]> {
    const specialties = await listSpecialties(clinicId);
    return specialties
      .filter((s) => s._count.doctors > 0)
      .map((s) => ({ label: s.name, args: { specialtyId: s.id }, count: s._count.doctors }));
  }

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
        description: `اعرض أطباء العيادة المتاحين مع تخصصاتهم (٢٠ في الصفحة). ابحث باسم الطبيب عبر query، أو صفِّ بالتخصص (specialtyId) أو بالفرع (branchId) أو بمن يكشف على الأطفال (acceptsChildren). عند طلب «الأطباء» دون تحديد تُعيد الأداة التخصصات كخيارات ليختار المستخدم. ${LIST_HINT}`,
        schema: z.object({
          query: z.string().nullable().describe("اسم الطبيب أو جزء منه (اختياري)"),
          specialtyId: z.string().nullable().describe("معرّف التخصص من list_specialties (اختياري)"),
          branchId: z.string().nullable().describe("معرّف الفرع من list_branches (اختياري)"),
          acceptsChildren: z.boolean().nullable().describe("true لمن يكشف على الأطفال فقط (اختياري)"),
          showAll: showAllField,
          page: pageField,
        }),
      },
      async (input) => {
        const { query, specialtyId, branchId, acceptsChildren } = input;
        const result = await findDoctors(
          {
            query: query ?? undefined,
            specialtyId: specialtyId ?? undefined,
            branchId: branchId ?? undefined,
            acceptsChildren: acceptsChildren ?? undefined,
          },
          input.page,
        );
        const filtered = !!(query || specialtyId || branchId || acceptsChildren != null);
        if (shouldAskForFilter(filtered, input, result.total)) {
          return askForFilter(result.total, "ما التخصص الذي تحتاجه؟", await specialtyChoices());
        }
        return result;
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
          `ابحث عن الأطباء حسب التخصص، إمّا بمعرّف التخصص (specialtyId من list_specialties، وهو الأدق) أو بنص التخصص (مثل: قلب، جلدية، أطفال). البحث النصي غير حسّاس لحالة الأحرف. ${LIST_HINT}`,
        schema: z.object({
          specialtyId: z
            .string()
            .nullable()
            .describe("معرّف التخصص من list_specialties (الأدق إن توفّر)"),
          specialty: z
            .string()
            .nullable()
            .describe("نص التخصص المطلوب إن لم يتوفّر المعرّف"),
          showAll: showAllField,
          page: pageField,
        }),
      },
      async (input) => {
        const { specialtyId, specialty } = input;
        const result = await findDoctors(
          specialtyId
            ? { specialtyId }
            : { specialtyName: specialty ?? undefined },
          input.page,
        );
        if (shouldAskForFilter(!!(specialtyId || specialty?.trim()), input, result.total)) {
          return askForFilter(result.total, "ما التخصص الذي تحتاجه؟", await specialtyChoices());
        }
        return {
          specialtyId: specialtyId ?? null,
          specialty: specialty ?? null,
          ...result,
        };
      },
    ),
    jsonTool(
      {
        name: "get_doctor_working_hours",
        description:
          "اعرض مواعيد عمل الطبيب (أيام الأسبوع وساعات العمل الثابتة والفرع الذي يعمل فيه في كل يوم) قبل عرض الفترات المتاحة. كل مدخل يوضّح الفرع (branch) الذي يداوم فيه الطبيب في ذلك اليوم — استعملها للإجابة عن أسئلة مثل «هل يعمل الطبيب في فرع كذا؟» أو «في أي فرع يداوم يوم كذا؟». استخدمها دائماً أولاً عندما يريد المستخدم حجز موعد، حتى يختار يوماً يعمل فيه الطبيب فعلاً، ثم استخدم get_doctor_availability لعرض الفترات المتاحة في ذلك اليوم.",
        schema: z.object({
          doctorId: z.string(),
          serviceIds: z
            .array(z.string())
            .nullable()
            .describe("الخدمات المطلوبة: تُعاد فقط الأيام/الفروع التي تُقدَّم فيها كلها (اختياري)"),
        }),
      },
      async ({ doctorId, serviceIds }) => {
        const doctor = await DoctorService.getDoctor(doctorId, clinicId);
        if (!doctor) return { error: "الطبيب غير موجود" };
        const [rules, fit] = await Promise.all([
          DoctorService.listDoctorRules(doctorId, clinicId), // #38
          serviceFit(doctorId, serviceIds),
        ]);
        return {
          doctorId,
          doctorName: doctor.profile.fullName,
          workingHours: rules
            // Referral-only windows aren't publicly bookable, so hide them here.
            .filter((r) => r.isActive && !r.referralOnly)
            .filter((r) => !fit || fit(r.id, r.branchId))
            .map((r) => ({
              day: DAY_LABELS_AR[r.dayOfWeek] ?? r.dayOfWeek,
              from: r.startTime,
              to: r.endTime,
              branchId: r.branchId,
              branch: r.branch?.name ?? null,
              mode: modeTag(r.mode), // "slot" | "order" | "arrival" | "day"
            })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_doctor_availability",
        description:
          "اعرض الفترات (slots) المتاحة فعلياً لطبيب معيّن في تاريخ محدد (بصيغة YYYY-MM-DD) للخدمات المطلوبة. مرّر serviceIds دائماً عند الحجز: تُعاد فقط أوقات البدء التي تتسع لمدة كل الخدمات. استخدمها بعد get_doctor_working_hours وبعد أن يختار المستخدم يوماً يعمل فيه الطبيب.",
        schema: z.object({
          doctorId: z.string(),
          serviceIds: z.array(z.string()).nullable().describe("الخدمات المطلوبة في الموعد"),
          date: z
            .string()
            .regex(
              /^\d{4}-\d{2}-\d{2}$/,
              "يجب أن يكون التاريخ بصيغة YYYY-MM-DD",
            ),
        }),
      },
      async ({ doctorId, date, serviceIds }) => {
        const doctor = await DoctorService.getDoctor(doctorId, clinicId);
        if (!doctor) return { error: "الطبيب غير موجود" };
        const visitLength = await visitMinutes(doctorId, serviceIds);

        // Queue day (order / arrival): report remaining capacity + live position
        // instead of fixed slots. Book via book_order_appointment (no slotId).
        const orderInfo = await QueueService.getOrderBookingInfo(
          doctorId,
          new Date(date),
        );
        if (orderInfo) {
          const tag = modeTag(orderInfo.mode);
          // Arrival-priority and day-only promise no number / expected time.
          const arrival = tag !== "order";
          const fit = await serviceFit(doctorId, serviceIds);
          const need = lengthWith(visitLength, orderInfo.estimatedDurationMin ?? 15);
          const fitsServices = !fit || fit(orderInfo.ruleId, orderInfo.branchId);
          const fitsTime =
            orderInfo.remainingMinutes == null || need == null || orderInfo.remainingMinutes >= need;
          return {
            doctorId,
            doctorName: doctor.profile.fullName,
            date,
            // "arrival" (أسبقية الحضور): the patient reserves and gets a number on
            // arrival, so there's no next number / expected time to promise here.
            // "day" (حجز يوم فقط): the patient books the day; the team calls to set
            // the exact time.
            mode: tag,
            ...(tag === "day" && { note: DAY_ONLY_PATIENT_NOTE_AR }),
            branchId: orderInfo.branchId,
            available: orderInfo.available && fitsServices && fitsTime,
            ...(!fitsServices && { reason: "الخدمات المطلوبة غير متاحة مع الطبيب في هذا اليوم" }),
            ...(fitsServices && !fitsTime && { reason: "لا يتسع وقت هذا اليوم لمدة الخدمات المطلوبة" }),
            visitMinutes: need,
            dailyCap: orderInfo.dailyCap,
            booked: orderInfo.booked,
            remaining: orderInfo.remaining,
            currentOrder:
              !arrival && orderInfo.trackCurrentOrder ? orderInfo.currentOrder : null,
            estimatedDurationMin: orderInfo.estimatedDurationMin,
            nextOrderNumber: arrival ? null : orderInfo.booked + 1,
            remainingMinutes: orderInfo.remainingMinutes,
            expectedTime: arrival
              ? null
              : expectedTimeAfter(orderInfo.sessionStart, orderInfo.bookedMinutes),
          };
        }

        const slots = await DoctorService.getAvailableSlotsForBooking(
          doctorId,
          new Date(date),
          undefined,
          { serviceIds },
        );
        return {
          doctorId,
          doctorName: doctor.profile.fullName,
          date,
          mode: "slot",
          slots: slots.map((s) => ({
            id: s.id,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            label: timeStr(s.startTime),
            branchId: s.branchId,
            branch: s.branch?.name ?? null,
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

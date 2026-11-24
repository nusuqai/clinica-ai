import "server-only";
import { z } from "zod";
import { AppointmentStatus, Channel } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import { exportFiltersSchema, exportQuery, localDay, MAX_EXPORT_DAYS } from "@/lib/exports/filters";
import { collectExport } from "@/server/services/exports/data";
import { accessFor, exportCaption, sendExportToMemberNow } from "@/server/services/exports/delivery";
import { jsonTool } from "../shared";
import type { StaffToolContext } from "./pending";
import { can, dateField } from "./helpers";

/**
 * The patient-data Excel (docs/data-export.md) for the team assistant. A read:
 * no confirmation. On WhatsApp the file is sent to the member right away (they
 * just wrote in, so the window is open); in the dashboard bubble the tool
 * returns a download link. Needs `reports`; scope + medical follow the member.
 */
export function exportTools(ctx: StaffToolContext): DynamicStructuredTool[] {
  const { clinicId, staff } = ctx;
  if (staff.role === "DOCTOR" || !can(staff, "reports")) return [];

  return [
    jsonTool(
      {
        name: "export_patient_data",
        description:
          `أرسل ملف Excel ببيانات المرضى لفترة: المرضى الجدد، الحجوزات الجديدة، الإلغاءات، سجل التغييرات (تأكيد/وصول/اكتمال/عدم حضور/تذكيرات)، مواعيد الفترة بكل تفاصيلها (الفرع، الطبيب، الخدمات، الأسعار…)، الباقات المباعة، التقييمات${can(staff, "medical_records") ? "، والسجلات الطبية وملفات المرضى" : ""}. ` +
          `استخدمها عندما يطلب المستخدم شيت/ملف/تقرير/إكسيل. حوّل كلامه إلى تواريخ بتوقيت العيادة (اليوم، أمس، هذا الأسبوع…) باستخدام get_current_datetime عند الحاجة. أقصى فترة ${MAX_EXPORT_DAYS} يوماً. ` +
          "مرّر فقط الفلاتر التي ذكرها (الفرع/الطبيب/التخصص/الخدمة/المريض/الحالة) بمعرّفاتها من الأدوات الأخرى. بعد الإرسال لخّص الأرقام في سطرين ولا تُعد كتابة الملف.",
        schema: z.object({
          from: dateField.describe("أول يوم YYYY-MM-DD"),
          to: dateField.describe("آخر يوم YYYY-MM-DD (نفس from ليوم واحد)"),
          branchId: z.string().nullable(),
          doctorId: z.string().nullable(),
          specialtyId: z.string().nullable(),
          serviceId: z.string().nullable(),
          patientId: z.string().nullable().describe("معرّف المريض من search_patients"),
          status: z.nativeEnum(AppointmentStatus).nullable(),
        }),
      },
      async (input) => {
        const parsed = exportFiltersSchema.safeParse(input);
        if (!parsed.success) {
          return { error: parsed.error.issues[0]?.message ?? "فلاتر غير صحيحة" };
        }
        const filters = parsed.data;
        if (filters.branchId && staff.branchIds && !staff.branchIds.includes(filters.branchId)) {
          return { error: "هذا الفرع خارج نطاق صلاحياتك" };
        }

        if (ctx.channel === Channel.WHATSAPP) {
          const res = await sendExportToMemberNow(clinicId, staff.memberId, filters);
          if (res.status === "sent") {
            return { sent: true, note: "تم إرسال الملف للمستخدم في هذه المحادثة", summary: res.caption };
          }
          if (res.status === "failed") return { error: `تعذّر إرسال الملف: ${res.error}` };
          return { error: "تعذّر إرسال الملف الآن، سيصل تلقائياً عند توفر الإرسال" };
        }

        // Dashboard bubble: a link the browser downloads with the member's session.
        const data = await collectExport(clinicId, filters, accessFor(staff));
        const clinic = await prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { timezone: true },
        });
        return {
          downloadUrl: `/api/exports?${exportQuery(filters)}`,
          note: "اعرض الرابط للمستخدم كرابط Markdown بعنوان «تحميل الملف»",
          summary: exportCaption(data),
          generatedOn: localDay(new Date(), clinic?.timezone ?? "Africa/Cairo"),
        };
      }
    ),
  ];
}

import { z } from "zod";
import { ProcedureKind } from "@prisma/client";

// The clinical record form (doctor's and admin's record modals).

const optionalNumber = (message: string, pattern: RegExp) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || pattern.test(v), message);

export const recordFormSchema = z
  .object({
    visitDate: z.string().min(1, "حدّد تاريخ الزيارة."),
    followUpDate: z.string(),
    chiefComplaint: z.string().trim(),
    diagnosis: z.string().trim(),
    clinicalNotes: z.string().trim(),
    // Rows left without a name / drug are dropped by the server.
    procedures: z.array(
      z.object({
        kind: z.enum(ProcedureKind),
        name: z.string().trim(),
        cost: optionalNumber("أدخل رقماً، مثال: 150 أو 99.5", /^\d+(\.\d+)?$/),
        note: z.string().trim(),
      })
    ),
    prescriptions: z.array(
      z.object({
        drugName: z.string().trim(),
        dose: z.string().trim(),
        frequency: z.string().trim(),
        durationDays: optionalNumber("أدخل عدد الأيام.", /^\d+$/),
        instructions: z.string().trim(),
      })
    ),
  })
  .refine((v) => !v.followUpDate || v.followUpDate >= v.visitDate, {
    message: "موعد المتابعة يجب ألا يسبق تاريخ الزيارة.",
    path: ["followUpDate"],
  });
export type RecordFormValues = z.infer<typeof recordFormSchema>;

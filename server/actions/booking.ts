"use server";

import { z } from "zod";
import { Role } from "@prisma/client";
import { can, getClinicContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/offers";
import * as Catalog from "@/server/services/catalog";
import * as Booking from "@/server/services/booking";
import * as Packages from "@/server/services/packages";
import * as Users from "@/server/services/users";
import { getOrderRuleForDate } from "@/server/services/queue";

// Service-aware booking helpers shared by the patient's web booking modal and
// the admin "book for a patient" dialog: which services a practitioner can be
// booked for, and an exact price preview for the chosen slot / day (branch
// price, the offer live on the visit day, package usage). The clinic always
// comes from the request host; a staff caller is held to their branches.

const uuid = z.uuid();

export interface BookableService {
  id: string;
  name: string;
  categoryName: string;
  pricingType: string;
  unitLabel: string | null;
  durationMin: number | null;
  /** The practitioner's price (their override, else the service price). */
  price: number | null;
  offerLabel: string | null;
  description: string | null;
  prepInstructions: string | null;
}

/** What `doctorId` can be booked for at this clinic (active, bookable services). */
export async function getBookableServicesAction(doctorId: string): Promise<BookableService[]> {
  const ctx = await getClinicContext();
  if (!ctx || !uuid.safeParse(doctorId).success) return [];
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId: ctx.clinic.id, isActive: true },
    select: { services: { select: { serviceId: true, price: true, durationMin: true } } },
  });
  if (!doctor || doctor.services.length === 0) return [];
  const own = new Map(doctor.services.map((s) => [s.serviceId, s]));
  const services = await Catalog.listPublicServices(ctx.clinic.id, {
    ids: doctor.services.map((s) => s.serviceId),
  });
  return services
    .filter((s) => s.bookable)
    .map((s) => ({
      id: s.id,
      name: s.name,
      categoryName: s.categoryName,
      pricingType: s.pricingType,
      unitLabel: s.unitLabel,
      durationMin: own.get(s.id)?.durationMin ?? s.durationMin,
      price: own.get(s.id)?.price != null ? Number(own.get(s.id)!.price) : s.price,
      offerLabel: s.offer?.label ?? null,
      description: s.description,
      prepInstructions: s.prepInstructions,
    }));
}

const previewSchema = z.object({
  doctorId: uuid,
  slotId: uuid.nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  items: z
    .array(
      z.object({
        serviceId: uuid,
        quantity: z.number().int().min(1).nullable().optional(),
        patientPackageId: uuid.nullable().optional(),
      })
    )
    .min(1)
    .max(20),
  /** Staff booking for an existing patient (ignored for a patient caller). */
  patientId: uuid.nullable().optional(),
});

export interface PreviewLine {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitLabel: string | null;
  basePrice: number | null;
  unitPrice: number | null;
  total: number | null;
  offerLabel: string | null;
  discount: number | null;
  durationMin: number;
  patientPackageId: string | null;
  /** The patient's packages that could pay this line on this visit. */
  packages: {
    patientPackageId: string;
    name: string;
    available: number;
    creditType: string;
    expiresOn: string;
  }[];
}

/**
 * Price the chosen services for a slot (slot day) or a date (queue day) with
 * this practitioner — exactly what the booking will snapshot.
 */
export async function previewBookingAction(
  input: unknown
): Promise<
  | { ok: true; lines: PreviewLine[]; estimatedTotal: number | null; totalDurationMin: number }
  | { ok: false; error: string }
> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const v = parsed.data;
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };

  // Whose packages: the patient themself, or the patient staff is booking for.
  let patientId: string | null = null;
  if (ctx.role === Role.PATIENT) patientId = ctx.user.id;
  else if (
    v.patientId &&
    can(ctx, "appointments") &&
    (await Users.isClinicPatient(v.patientId, ctx.clinic.id))
  )
    patientId = v.patientId;
  const scope = ctx.role === Role.PATIENT ? null : ctx.branchIds;

  // The rule + branch + day the visit falls on.
  let rule: Parameters<typeof Booking.resolveBookingItems>[0];
  let visitDay: string;
  if (v.slotId) {
    const slot = await prisma.slot.findFirst({
      where: { id: v.slotId, doctorId: v.doctorId, clinicId: ctx.clinic.id },
      include: { rule: { include: { services: { select: { serviceId: true } } } } },
    });
    if (!slot) return { ok: false, error: "الموعد غير موجود" };
    if (scope && (!slot.branchId || !scope.includes(slot.branchId)))
      return { ok: false, error: "الموعد غير موجود" };
    rule = {
      id: slot.ruleId ?? "",
      doctorId: v.doctorId,
      clinicId: ctx.clinic.id,
      branchId: slot.branchId,
      slotDurationMin: Math.round((slot.endTime.getTime() - slot.startTime.getTime()) / 60_000),
      estimatedDurationMin: null,
      services: slot.rule?.services ?? [],
    };
    visitDay = dayKey(slot.date);
  } else if (v.date) {
    const r = await getOrderRuleForDate(v.doctorId, new Date(v.date), null, scope);
    if (!r || r.clinicId !== ctx.clinic.id)
      return { ok: false, error: "لا يوجد دوام في هذا اليوم" };
    const services = await prisma.ruleService.findMany({
      where: { ruleId: r.id },
      select: { serviceId: true },
    });
    rule = { ...r, services };
    visitDay = v.date;
  } else return { ok: false, error: "اختر الموعد أولاً" };

  const res = await Booking.resolveBookingItems(rule, visitDay, v.items, {
    patientId: patientId ?? undefined,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const lines: PreviewLine[] = [];
  for (const l of res.data.lines) {
    const usable =
      patientId && rule.branchId
        ? await Packages.usablePackagesFor(ctx.clinic.id, patientId, {
            branchId: rule.branchId,
            serviceId: l.serviceId,
            categoryId: l.categoryId,
            visitDay,
          })
        : [];
    lines.push({
      serviceId: l.serviceId,
      serviceName: l.serviceName,
      quantity: l.quantity,
      unitLabel: l.unitLabel,
      basePrice: l.basePrice,
      unitPrice: l.unitPrice,
      total: l.total,
      offerLabel: l.offerLabel,
      discount: l.discount,
      durationMin: l.durationMin,
      patientPackageId: l.patientPackageId,
      packages: usable.map((p) => ({
        patientPackageId: p.patientPackageId,
        name: p.name,
        available: p.balance.available,
        creditType: p.balance.creditType,
        expiresOn: p.expiresOn,
      })),
    });
  }
  return {
    ok: true,
    lines,
    estimatedTotal: res.data.estimatedTotal,
    totalDurationMin: res.data.totalDurationMin,
  };
}

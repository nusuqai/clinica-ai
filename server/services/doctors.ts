import "server-only";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, err, type Result } from "./_result";
import type { Doctor, Profile, DayOfWeek, AppointmentStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DoctorWithProfile = Doctor & {
  profile: Pick<Profile, "fullName" | "phone" | "avatarUrl" | "createdAt">;
  _count: { appointments: number };
};

export interface CreateDoctorInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  specialty: string;
  bio?: string;
  consultationFee?: number;
}

export interface UpdateDoctorInput {
  doctorId: string;
  specialty?: string;
  bio?: string;
  consultationFee?: number;
  fullName?: string;
  phone?: string | null;
}

export interface CreateRuleInput {
  doctorId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMin?: number;
}

export type DoctorSlot = {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  isBlocked: boolean;
  ruleId: string | null;
  appointment: {
    id: string;
    status: AppointmentStatus;
    patient: { fullName: string };
  } | null;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listActiveDoctors(): Promise<DoctorWithProfile[]> {
  return prisma.doctor.findMany({
    where: { isActive: true },
    include: {
      profile: {
        select: {
          fullName: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      _count: { select: { appointments: true } },
    },
    orderBy: { profile: { fullName: "asc" } },
  });
}

export async function getAvailableSlotsForBooking(
  doctorId: string,
  date: Date,
): Promise<{ id: string; startTime: Date; endTime: Date }[]> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const now = new Date();

  return prisma.slot.findMany({
    where: {
      doctorId,
      isBlocked: false,
      appointment: null,
      date: { gte: dayStart, lte: dayEnd },
      startTime: { gt: now },
    },
    select: { id: true, startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });
}

export async function listDoctors(): Promise<DoctorWithProfile[]> {
  return prisma.doctor.findMany({
    include: {
      profile: {
        select: {
          fullName: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      _count: { select: { appointments: true } },
    },
    orderBy: { profile: { fullName: "asc" } },
  });
}

export async function getDoctor(
  doctorId: string,
): Promise<DoctorWithProfile | null> {
  return prisma.doctor.findUnique({
    where: { id: doctorId },
    include: {
      profile: {
        select: {
          fullName: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
      _count: { select: { appointments: true } },
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Creates a full doctor account from scratch:
 * 1. Creates auth user via service-role (email confirmed immediately)
 * 2. DB trigger auto-creates profiles row as PATIENT
 * 3. Prisma transaction: promotes role → DOCTOR + inserts doctors row
 * 4. On any failure after step 1: deletes the auth user to prevent orphans
 *
 * AI agent tools can import and call this function directly.
 */
export async function createDoctorAccount(
  input: CreateDoctorInput,
): Promise<Result<{ id: string; fullName: string }>> {
  const admin = createAdminClient();

  // Step 1 — create auth user (confirmed, no email verification needed)
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        phone: input.phone || null,
      },
    });

  if (authError) {
    if (
      authError.message.toLowerCase().includes("already registered") ||
      authError.message.toLowerCase().includes("already been registered") ||
      authError.message.toLowerCase().includes("email address") ||
      authError.code === "email_exists"
    ) {
      return err("هذا البريد الإلكتروني مسجل بالفعل.");
    }
    return err(authError.message);
  }

  const userId = authData.user.id;

  try {
    // Step 2 — the DB trigger will have fired and created profiles row as PATIENT.
    // Give it a moment in case of slight async; retry once if not found.
    let profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await prisma.profile.findUnique({ where: { id: userId } });
    }

    if (!profile) {
      // Trigger didn't fire — create profile manually
      await prisma.profile.create({
        data: {
          id: userId,
          role: "DOCTOR",
          fullName: input.fullName,
          phone: input.phone || null,
        },
      });
    }

    // Step 3 — transaction: promote role + create Doctor record
    await prisma.$transaction([
      prisma.profile.update({
        where: { id: userId },
        data: {
          role: "DOCTOR",
          fullName: input.fullName,
          phone: input.phone || null,
        },
      }),
      prisma.doctor.create({
        data: {
          id: userId,
          specialty: input.specialty,
          bio: input.bio ?? null,
          consultationFee: input.consultationFee ?? null,
          isActive: true,
        },
      }),
    ]);

    return ok({ id: userId, fullName: input.fullName });
  } catch (e) {
    // Rollback: delete the auth user so no orphan is left
    await admin.auth.admin.deleteUser(userId);
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    if (msg.includes("phone")) return err("رقم الهاتف مستخدم بالفعل.");
    return err(`فشل إنشاء حساب الطبيب: ${msg}`);
  }
}

export async function updateDoctor(
  input: UpdateDoctorInput,
): Promise<Result<void>> {
  try {
    await prisma.$transaction([
      ...(input.fullName !== undefined || input.phone !== undefined
        ? [
            prisma.profile.update({
              where: { id: input.doctorId },
              data: {
                ...(input.fullName !== undefined && {
                  fullName: input.fullName,
                }),
                ...(input.phone !== undefined && { phone: input.phone }),
              },
            }),
          ]
        : []),
      prisma.doctor.update({
        where: { id: input.doctorId },
        data: {
          ...(input.specialty !== undefined && { specialty: input.specialty }),
          ...(input.bio !== undefined && { bio: input.bio }),
          ...(input.consultationFee !== undefined && {
            consultationFee: input.consultationFee,
          }),
        },
      }),
    ]);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث بيانات الطبيب");
  }
}

export async function setDoctorActive(
  doctorId: string,
  isActive: boolean,
): Promise<Result<void>> {
  try {
    await prisma.doctor.update({ where: { id: doctorId }, data: { isActive } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة الطبيب");
  }
}

export async function deleteDoctor(doctorId: string): Promise<Result<void>> {
  try {
    const admin = createAdminClient();
    // Cascade in DB handles profile + doctor rows
    const { error } = await admin.auth.admin.deleteUser(doctorId);
    if (error) return err(error.message);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف الطبيب");
  }
}

// ─── Availability Rules ───────────────────────────────────────────────────────

export async function listDoctorRules(doctorId: string) {
  return prisma.availabilityRule.findMany({
    where: { doctorId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function createRule(
  input: CreateRuleInput,
): Promise<Result<{ id: string }>> {
  try {
    const rule = await prisma.availabilityRule.create({
      data: {
        doctorId: input.doctorId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        slotDurationMin: input.slotDurationMin ?? 30,
      },
    });
    await generateSlotsForRule(rule.id, 30);
    return ok({ id: rule.id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل إنشاء قاعدة التوفر");
  }
}

export async function deleteRule(ruleId: string): Promise<Result<void>> {
  try {
    await prisma.slot.deleteMany({
      where: { ruleId, date: { gte: new Date() }, appointment: null },
    });
    await prisma.availabilityRule.delete({ where: { id: ruleId } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف قاعدة التوفر");
  }
}

export async function toggleRuleActive(
  ruleId: string,
  isActive: boolean,
): Promise<Result<void>> {
  try {
    await prisma.availabilityRule.update({ where: { id: ruleId }, data: { isActive } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة القاعدة");
  }
}

// ─── Slot Generation ──────────────────────────────────────────────────────────

const DAY_MAP: Record<DayOfWeek, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

export async function generateSlotsForRule(
  ruleId: string,
  daysAhead = 30,
): Promise<Result<{ count: number }>> {
  try {
    const rule = await prisma.availabilityRule.findUnique({ where: { id: ruleId } });
    if (!rule) return err("القاعدة غير موجودة");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const from = rule.generatedUntil
      ? new Date(Math.max(rule.generatedUntil.getTime() + 86_400_000, today.getTime()))
      : today;

    const until = new Date(today);
    until.setUTCDate(until.getUTCDate() + daysAhead);

    if (from >= until) return ok({ count: 0 });

    const targetDay = DAY_MAP[rule.dayOfWeek];
    const [startH, startM] = rule.startTime.split(":").map(Number);
    const [endH, endM] = rule.endTime.split(":").map(Number);
    const durationMs = rule.slotDurationMin * 60_000;

    const slotsToCreate: {
      doctorId: string;
      ruleId: string;
      date: Date;
      startTime: Date;
      endTime: Date;
    }[] = [];

    const cur = new Date(from);
    while (cur < until) {
      if (cur.getUTCDay() === targetDay) {
        const slotDate = new Date(cur);
        const dayStartMs = new Date(cur).setUTCHours(startH, startM, 0, 0);
        const dayEndMs = new Date(cur).setUTCHours(endH, endM, 0, 0);

        let t = dayStartMs;
        while (t + durationMs <= dayEndMs) {
          slotsToCreate.push({
            doctorId: rule.doctorId,
            ruleId: rule.id,
            date: slotDate,
            startTime: new Date(t),
            endTime: new Date(t + durationMs),
          });
          t += durationMs;
        }
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    if (slotsToCreate.length > 0) {
      await prisma.slot.createMany({ data: slotsToCreate, skipDuplicates: true });
    }
    await prisma.availabilityRule.update({
      where: { id: ruleId },
      data: { generatedUntil: until },
    });

    return ok({ count: slotsToCreate.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل توليد المواعيد");
  }
}

// ─── Slots ────────────────────────────────────────────────────────────────────

export async function listDoctorSlots(
  doctorId: string,
  options?: { from?: Date; to?: Date },
): Promise<DoctorSlot[]> {
  const from = options?.from ?? (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; })();
  const to = options?.to ?? (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 30); return d; })();

  return prisma.slot.findMany({
    where: { doctorId, date: { gte: from, lte: to } },
    include: {
      appointment: {
        select: {
          id: true,
          status: true,
          patient: { select: { fullName: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  }) as Promise<DoctorSlot[]>;
}

// ─── Doctor Dashboard Queries ─────────────────────────────────────────────────

export async function getDoctorStats(doctorId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const [todayCount, pendingCount, completedCount, totalCount, uniquePatients] =
    await Promise.all([
      prisma.appointment.count({
        where: { doctorId, slot: { date: { gte: today, lte: todayEnd } } },
      }),
      prisma.appointment.count({
        where: { doctorId, status: { in: ["PENDING", "CONFIRMED"] } },
      }),
      prisma.appointment.count({ where: { doctorId, status: "COMPLETED" } }),
      prisma.appointment.count({ where: { doctorId } }),
      prisma.appointment.findMany({
        where: { doctorId },
        select: { patientId: true },
        distinct: ["patientId"],
      }),
    ]);

  return {
    todayCount,
    pendingCount,
    completedCount,
    totalCount,
    uniquePatientsCount: uniquePatients.length,
  };
}

export type DoctorPatient = {
  patientId: string;
  fullName: string;
  phone: string | null;
  lastAppointmentDate: Date;
  lastStatus: AppointmentStatus;
  totalAppointments: number;
};

export async function getDoctorPatients(doctorId: string): Promise<DoctorPatient[]> {
  const appointments = await prisma.appointment.findMany({
    where: { doctorId },
    include: {
      patient: { select: { fullName: true, phone: true } },
      slot: { select: { date: true } },
    },
    orderBy: { slot: { date: "desc" } },
  });

  const patientMap = new Map<string, DoctorPatient>();
  for (const appt of appointments) {
    if (!patientMap.has(appt.patientId)) {
      patientMap.set(appt.patientId, {
        patientId: appt.patientId,
        fullName: appt.patient.fullName,
        phone: appt.patient.phone,
        lastAppointmentDate: appt.slot.date,
        lastStatus: appt.status,
        totalAppointments: 1,
      });
    } else {
      patientMap.get(appt.patientId)!.totalAppointments++;
    }
  }

  return Array.from(patientMap.values());
}

// ─── Slots ────────────────────────────────────────────────────────────────────

export async function toggleSlotBlocked(slotId: string): Promise<Result<void>> {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: { appointment: { select: { id: true } } },
    });
    if (!slot) return err("الموعد غير موجود");
    if (slot.appointment) return err("لا يمكن تعطيل موعد محجوز");
    await prisma.slot.update({
      where: { id: slotId },
      data: { isBlocked: !slot.isBlocked },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تغيير حالة الموعد");
  }
}

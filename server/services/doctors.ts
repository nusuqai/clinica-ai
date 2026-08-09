import "server-only";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, Role, type Doctor, type DayOfWeek } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

// A doctor is now a standalone record with its own name/contact. We keep a
// `profile`-shaped view (synthesized from the doctor's own fields, plus the
// linked account when there is one) so existing UI keeps working unchanged.
export type DoctorWithProfile = Doctor & {
  profile: {
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    createdAt: Date;
  };
  email?: string;
  _count: { appointments: number };
};

type DoctorRow = Doctor & {
  profile: { avatarUrl: string | null; createdAt: Date } | null;
  _count: { appointments: number };
};

function toView(d: DoctorRow, email?: string): DoctorWithProfile {
  return {
    ...d,
    profile: {
      fullName: d.fullName,
      phone: d.phone,
      avatarUrl: d.profile?.avatarUrl ?? null,
      createdAt: d.profile?.createdAt ?? new Date(0),
    },
    ...(email !== undefined ? { email } : {}),
  };
}

const linkedProfileSelect = {
  profile: { select: { avatarUrl: true, createdAt: true } },
  _count: { select: { appointments: true } },
} as const;

export interface CreateDoctorInput {
  clinicId: string;
  fullName: string;
  phone?: string;
  specialty: string;
  bio?: string;
  consultationFee?: number;
}

export interface CreateDoctorAccountInput extends CreateDoctorInput {
  email: string;
  password: string;
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

export async function listActiveDoctors(
  clinicId: string,
): Promise<DoctorWithProfile[]> {
  const doctors = await prisma.doctor.findMany({
    where: { clinicId, isActive: true },
    include: linkedProfileSelect,
    orderBy: { fullName: "asc" },
  });
  return doctors.map((d) => toView(d));
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

export async function getAvailableDaysForBooking(
  doctorId: string,
  daysAhead = 60,
): Promise<string[]> {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + daysAhead);

  const slots = await prisma.slot.findMany({
    where: {
      doctorId,
      isBlocked: false,
      appointment: null,
      startTime: { gt: now },
      date: { lte: until },
    },
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "asc" },
  });

  return slots.map((s) => s.date.toISOString().split("T")[0]);
}

export async function listDoctors(
  clinicId: string,
): Promise<DoctorWithProfile[]> {
  const [doctors, { data: authList }] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId },
      include: linkedProfileSelect,
      orderBy: { fullName: "asc" },
    }),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailMap = new Map<string, string>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return doctors.map((d) =>
    toView(d, d.profileId ? (emailMap.get(d.profileId) ?? "") : ""),
  );
}

export async function getDoctor(
  doctorId: string,
  clinicId?: string,
): Promise<DoctorWithProfile | null> {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, ...(clinicId ? { clinicId } : {}) },
    include: linkedProfileSelect,
  });
  if (!doctor) return null;

  let email = "";
  if (doctor.profileId) {
    const { data: authUser } =
      await createAdminClient().auth.admin.getUserById(doctor.profileId);
    email = authUser?.user?.email ?? "";
  }
  return toView(doctor, email);
}

/** Resolve the Doctor record for a logged-in user (via their linked account). */
export async function getDoctorByProfileId(
  profileId: string,
  clinicId?: string,
): Promise<DoctorWithProfile | null> {
  const doctor = await prisma.doctor.findFirst({
    where: { profileId, ...(clinicId ? { clinicId } : {}) },
    include: linkedProfileSelect,
  });
  if (!doctor) return null;
  return toView(doctor);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Create a standalone doctor with NO login account (profileId stays null). */
export async function createDoctor(
  input: CreateDoctorInput,
): Promise<Result<{ id: string; fullName: string }>> {
  try {
    const doctor = await prisma.doctor.create({
      data: {
        clinicId: input.clinicId,
        fullName: input.fullName,
        phone: input.phone || null,
        specialty: input.specialty,
        bio: input.bio ?? null,
        consultationFee: input.consultationFee ?? null,
        isActive: true,
      },
    });
    return ok({ id: doctor.id, fullName: doctor.fullName });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل إنشاء الطبيب");
  }
}

/**
 * Create a doctor together with a login account:
 * 1. Create auth user (confirmed).
 * 2. Add a DOCTOR membership in the clinic.
 * 3. Create the Doctor row linked to that account (profileId).
 * On failure after step 1, the auth user is deleted to avoid orphans.
 */
export async function createDoctorAccount(
  input: CreateDoctorAccountInput,
): Promise<Result<{ id: string; fullName: string }>> {
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser(
    {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName, phone: input.phone || null },
    },
  );

  if (authError) {
    const m = authError.message.toLowerCase();
    if (
      m.includes("already registered") ||
      m.includes("already been registered") ||
      m.includes("email address") ||
      authError.code === "email_exists"
    ) {
      return err("هذا البريد الإلكتروني مسجل بالفعل.");
    }
    return err(authError.message);
  }

  const userId = authData.user.id;

  try {
    // The DB trigger creates the identity profile; ensure it exists.
    let profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await prisma.profile.findUnique({ where: { id: userId } });
    }
    if (!profile) {
      await prisma.profile.create({
        data: { id: userId, fullName: input.fullName, phone: input.phone || null },
      });
    }

    const doctor = await prisma.$transaction(async (tx) => {
      await tx.clinicMember.upsert({
        where: { userId_clinicId: { userId, clinicId: input.clinicId } },
        update: { role: Role.DOCTOR },
        create: { userId, clinicId: input.clinicId, role: Role.DOCTOR },
      });
      return tx.doctor.create({
        data: {
          clinicId: input.clinicId,
          profileId: userId,
          fullName: input.fullName,
          phone: input.phone || null,
          specialty: input.specialty,
          bio: input.bio ?? null,
          consultationFee: input.consultationFee ?? null,
          isActive: true,
        },
      });
    });

    return ok({ id: doctor.id, fullName: doctor.fullName });
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    return err(`فشل إنشاء حساب الطبيب: ${msg}`);
  }
}

/** Attach a NEW login account to an existing account-less doctor. */
export async function linkDoctorAccount(
  doctorId: string,
  input: { email: string; password: string },
): Promise<Result<void>> {
  const admin = createAdminClient();

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return err("الطبيب غير موجود");
  if (doctor.profileId) return err("هذا الطبيب لديه حساب بالفعل.");

  const { data: authData, error: authError } = await admin.auth.admin.createUser(
    {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: doctor.fullName, phone: doctor.phone },
    },
  );
  if (authError) return err(authError.message);

  const userId = authData.user.id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.clinicMember.upsert({
        where: { userId_clinicId: { userId, clinicId: doctor.clinicId } },
        update: { role: Role.DOCTOR },
        create: { userId, clinicId: doctor.clinicId, role: Role.DOCTOR },
      });
      await tx.doctor.update({
        where: { id: doctorId },
        data: { profileId: userId },
      });
    });
    return ok(undefined);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    return err(e instanceof Error ? e.message : "فشل ربط الحساب بالطبيب");
  }
}

export async function updateDoctor(
  input: UpdateDoctorInput,
): Promise<Result<void>> {
  try {
    await prisma.doctor.update({
      where: { id: input.doctorId },
      data: {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.specialty !== undefined && { specialty: input.specialty }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.consultationFee !== undefined && {
          consultationFee: input.consultationFee,
        }),
      },
    });
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

/** Delete a doctor. If a login account is linked, also remove it. */
export async function deleteDoctor(doctorId: string): Promise<Result<void>> {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return err("الطبيب غير موجود");

    await prisma.doctor.delete({ where: { id: doctorId } });

    if (doctor.profileId) {
      const admin = createAdminClient();
      // Removes the auth user (profile + memberships cascade in DB).
      await admin.auth.admin.deleteUser(doctor.profileId);
    }
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
    await prisma.availabilityRule.update({
      where: { id: ruleId },
      data: { isActive },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة القاعدة");
  }
}

// ─── Slot Generation ──────────────────────────────────────────────────────────

const DAY_MAP: Record<DayOfWeek, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export async function generateSlotsForRule(
  ruleId: string,
  daysAhead = 30,
): Promise<Result<{ count: number }>> {
  try {
    const rule = await prisma.availabilityRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule) return err("القاعدة غير موجودة");

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const from = rule.generatedUntil
      ? new Date(
          Math.max(rule.generatedUntil.getTime() + 86_400_000, today.getTime()),
        )
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
      await prisma.slot.createMany({
        data: slotsToCreate,
        skipDuplicates: true,
      });
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
  const from =
    options?.from ??
    (() => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return d;
    })();
  const to =
    options?.to ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 30);
      return d;
    })();

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
        where: { doctorId, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] } },
      }),
      prisma.appointment.count({ where: { doctorId, status: AppointmentStatus.COMPLETED } }),
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

export async function getDoctorPatients(
  doctorId: string,
): Promise<DoctorPatient[]> {
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

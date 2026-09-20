"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  setClinicMarkup,
  topUpClinicUnits,
  adjustClinicUnits,
  setClinicLowUnitsThreshold,
} from "@/server/services/aiCredit";

const CREDITS_PATH = "/platform/credits";

type ActionError = { ok: false; reason: "error"; message: string };

/** Parses a user-entered decimal (the pricing markup) — never through a JS
 *  float. Rejects empty / non-numeric input so bad values never reach the
 *  cost calculation. */
function parseDecimal(raw: string): Prisma.Decimal | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const d = new Prisma.Decimal(trimmed);
    if (!d.isFinite()) return null;
    return d;
  } catch {
    return null;
  }
}

/** Parses a unit count. Units are indivisible, so anything fractional or
 *  non-numeric is rejected outright rather than rounded into the ledger. */
function parseUnits(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Grant units to a clinic — the clinic-facing meter, one unit per agent reply.
 * This is how a clinic is "charged 1000 units": the platform grants them here,
 * and every answer the agent sends takes one back.
 */
export async function topUpClinicUnitsAction(input: {
  clinicId: string;
  units: string;
  note?: string;
}): Promise<{ ok: true; unitBalance: number } | ActionError> {
  const admin = await requirePlatformAdmin();
  const units = parseUnits(input.units);
  if (units === null || units <= 0) {
    return { ok: false, reason: "error", message: "عدد الوحدات يجب أن يكون رقماً صحيحاً موجباً." };
  }
  try {
    const unitBalance = await topUpClinicUnits(
      input.clinicId,
      units,
      admin.id,
      input.note?.trim() || undefined
    );
    revalidatePath(CREDITS_PATH);
    return { ok: true, unitBalance };
  } catch (err) {
    console.error("Failed to top up clinic units:", err);
    return { ok: false, reason: "error", message: "تعذر تنفيذ العملية." };
  }
}

/** Signed unit correction (may be negative) — e.g. refunding a broken run. */
export async function adjustClinicUnitsAction(input: {
  clinicId: string;
  units: string;
  note?: string;
}): Promise<{ ok: true; unitBalance: number } | ActionError> {
  const admin = await requirePlatformAdmin();
  const units = parseUnits(input.units);
  if (units === null || units === 0) {
    return { ok: false, reason: "error", message: "أدخل عدداً صحيحاً موجباً أو سالباً غير صفري." };
  }
  try {
    const unitBalance = await adjustClinicUnits(
      input.clinicId,
      units,
      admin.id,
      input.note?.trim() || undefined
    );
    revalidatePath(CREDITS_PATH);
    return { ok: true, unitBalance };
  } catch (err) {
    console.error("Failed to adjust clinic units:", err);
    return { ok: false, reason: "error", message: "تعذر تنفيذ العملية." };
  }
}

/** The unit count below which the clinic admin sees a low-balance warning. */
export async function setClinicLowUnitsThresholdAction(input: {
  clinicId: string;
  threshold: string;
}): Promise<{ ok: true; threshold: number } | ActionError> {
  await requirePlatformAdmin();
  const threshold = parseUnits(input.threshold);
  if (threshold === null || threshold < 0) {
    return { ok: false, reason: "error", message: "حد التنبيه يجب أن يكون رقماً صحيحاً غير سالب." };
  }
  try {
    await setClinicLowUnitsThreshold(input.clinicId, threshold);
    revalidatePath(CREDITS_PATH);
    return { ok: true, threshold };
  } catch (err) {
    console.error("Failed to set clinic low-units threshold:", err);
    return { ok: false, reason: "error", message: "تعذر تنفيذ العملية." };
  }
}

export async function setClinicMarkupAction(input: {
  clinicId: string;
  markup: string;
}): Promise<{ ok: true; markup: string } | ActionError> {
  await requirePlatformAdmin();
  const markup = parseDecimal(input.markup);
  if (!markup || markup.lt(1)) {
    return { ok: false, reason: "error", message: "المضاعف يجب ألا يقل عن 1." };
  }
  try {
    await setClinicMarkup(input.clinicId, markup);
    revalidatePath(CREDITS_PATH);
    return { ok: true, markup: markup.toFixed(4) };
  } catch (err) {
    console.error("Failed to set clinic markup:", err);
    return { ok: false, reason: "error", message: "تعذر تنفيذ العملية." };
  }
}

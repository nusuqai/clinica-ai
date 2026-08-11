"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  topUpClinicCredit,
  adjustClinicCredit,
  setClinicMarkup,
} from "@/server/services/aiCredit";

const CREDITS_PATH = "/platform/credits";

type ActionError = { ok: false; reason: "error"; message: string };

/** Parses a user-entered amount straight to Decimal — never through a JS float.
 *  Rejects empty / non-numeric input so bad money never reaches the ledger. */
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

export async function topUpClinicAction(input: {
  clinicId: string;
  amount: string;
  note?: string;
}): Promise<{ ok: true; balance: string } | ActionError> {
  const admin = await requirePlatformAdmin();
  const amount = parseDecimal(input.amount);
  if (!amount || amount.lte(0)) {
    return { ok: false, reason: "error", message: "المبلغ يجب أن يكون رقماً موجباً." };
  }
  try {
    const balance = await topUpClinicCredit(
      input.clinicId,
      amount,
      admin.id,
      input.note?.trim() || undefined,
    );
    revalidatePath(CREDITS_PATH);
    return { ok: true, balance: balance.toFixed(4) };
  } catch (err) {
    console.error("Failed to top up clinic credit:", err);
    return { ok: false, reason: "error", message: "تعذر تنفيذ العملية." };
  }
}

export async function adjustClinicBalanceAction(input: {
  clinicId: string;
  amount: string;
  note?: string;
}): Promise<{ ok: true; balance: string } | ActionError> {
  const admin = await requirePlatformAdmin();
  const amount = parseDecimal(input.amount);
  if (!amount || amount.isZero()) {
    return { ok: false, reason: "error", message: "أدخل مبلغاً موجباً أو سالباً غير صفري." };
  }
  try {
    const balance = await adjustClinicCredit(
      input.clinicId,
      amount,
      admin.id,
      input.note?.trim() || undefined,
    );
    revalidatePath(CREDITS_PATH);
    return { ok: true, balance: balance.toFixed(4) };
  } catch (err) {
    console.error("Failed to adjust clinic credit:", err);
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

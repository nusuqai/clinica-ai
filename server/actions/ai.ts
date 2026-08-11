"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import { setClinicAiEnabled } from "@/server/services/aiCredit";

const AI_PATH = "/clinic/[slug]/admin/ai";

type ActionError = {
  ok: false;
  reason: "unauthorized" | "forbidden" | "error";
  message?: string;
};

async function requireAdminClinic() {
  const ctx = await getActiveClinicContext();
  if (!ctx) return { ok: false as const, reason: "unauthorized" as const };
  if (ctx.role !== Role.ADMIN)
    return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, ctx };
}

/** Clinic admin: turn the clinic's AI agent on/off globally (all conversations). */
export async function toggleClinicAiAction(
  enabled: boolean,
): Promise<{ ok: true; enabled: boolean } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  try {
    await setClinicAiEnabled(auth.ctx.clinic.id, enabled);
    revalidatePath(AI_PATH, "page");
    return { ok: true, enabled };
  } catch (err) {
    console.error("Failed to toggle clinic AI:", err);
    return { ok: false, reason: "error" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getClinicContext } from "@/lib/auth";
import { setClinicAiEnabled, setClinicVoiceReplyEnabled } from "@/server/services/aiCredit";

const AI_PATH = "/admin/ai";

type ActionError = {
  ok: false;
  reason: "unauthorized" | "forbidden" | "error";
  message?: string;
};

async function requireAdminClinic() {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false as const, reason: "unauthorized" as const };
  if (ctx.role !== Role.ADMIN) return { ok: false as const, reason: "forbidden" as const };
  return { ok: true as const, ctx };
}

/** Clinic admin: turn the clinic's AI agent on/off globally (all conversations). */
export async function toggleClinicAiAction(
  enabled: boolean
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

/** Clinic admin: turn voice (spoken) replies on/off. When on, the agent answers
 *  a patient's voice note with synthesized speech (issue #49). */
export async function toggleClinicVoiceReplyAction(
  enabled: boolean
): Promise<{ ok: true; enabled: boolean } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  try {
    await setClinicVoiceReplyEnabled(auth.ctx.clinic.id, enabled);
    revalidatePath(AI_PATH, "page");
    return { ok: true, enabled };
  } catch (err) {
    console.error("Failed to toggle clinic voice reply:", err);
    return { ok: false, reason: "error" };
  }
}

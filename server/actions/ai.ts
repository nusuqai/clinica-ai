"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { can, getClinicContext } from "@/lib/auth";
import {
  setClinicAiEnabled,
  setClinicVoiceReplyEnabled,
  setClinicImageAnalysisEnabled,
  setClinicImageAutoReplyEnabled,
  setClinicDebounceSeconds,
  DEBOUNCE_SECONDS_MIN,
  DEBOUNCE_SECONDS_MAX,
} from "@/server/services/aiCredit";

const AI_PATH = "/admin/ai";

type ActionError = {
  ok: false;
  reason: "unauthorized" | "forbidden" | "error";
  message?: string;
};

async function requireAdminClinic() {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false as const, reason: "unauthorized" as const };
  if (!can(ctx, "agent")) return { ok: false as const, reason: "forbidden" as const };
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

/** Clinic admin: turn image analysis (vision) on/off. When on, the agent reads a
 *  patient's photo and answers based on it; when off, images are still archived
 *  but a human reviews them (issue #52). */
export async function toggleClinicImageAnalysisAction(
  enabled: boolean
): Promise<{ ok: true; enabled: boolean } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  try {
    await setClinicImageAnalysisEnabled(auth.ctx.clinic.id, enabled);
    revalidatePath(AI_PATH, "page");
    return { ok: true, enabled };
  } catch (err) {
    console.error("Failed to toggle clinic image analysis:", err);
    return { ok: false, reason: "error" };
  }
}

/** Clinic admin: when image analysis is on, choose whether the agent answers the
 *  image (extract-and-respond) or only stores the extraction for the call-centre
 *  team and escalates for a human (extract-only). */
export async function toggleClinicImageAutoReplyAction(
  enabled: boolean
): Promise<{ ok: true; enabled: boolean } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  try {
    await setClinicImageAutoReplyEnabled(auth.ctx.clinic.id, enabled);
    revalidatePath(AI_PATH, "page");
    return { ok: true, enabled };
  } catch (err) {
    console.error("Failed to toggle clinic image auto-reply:", err);
    return { ok: false, reason: "error" };
  }
}

/** Clinic admin: set the message-debounce window (seconds of silence before the
 *  agent answers a burst). Rejects non-numbers; the service clamps to [MIN,MAX]
 *  and returns the value actually stored. */
export async function setClinicDebounceSecondsAction(
  seconds: number
): Promise<{ ok: true; seconds: number } | ActionError> {
  const auth = await requireAdminClinic();
  if (!auth.ok) return auth;
  if (!Number.isFinite(seconds)) {
    return {
      ok: false,
      reason: "error",
      message: `أدخل رقماً بين ${DEBOUNCE_SECONDS_MIN} و ${DEBOUNCE_SECONDS_MAX} ثانية.`,
    };
  }
  try {
    const stored = await setClinicDebounceSeconds(auth.ctx.clinic.id, seconds);
    revalidatePath(AI_PATH, "page");
    return { ok: true, seconds: stored };
  } catch (err) {
    console.error("Failed to set clinic debounce seconds:", err);
    return { ok: false, reason: "error" };
  }
}

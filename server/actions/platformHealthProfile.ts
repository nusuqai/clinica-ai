"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import * as HealthProfileService from "@/server/services/health-profile";
import type { Result } from "@/server/services/_result";

/**
 * Health-profile builder — platform-admin work for now. Every action names its
 * `clinicId` explicitly (the console runs on the root domain, with no tenant
 * host) and the service scopes every lookup to it, so a mistyped id can't
 * touch another clinic's form.
 */

const builderPath = (clinicId: string) => `/platform/health-profiles/${clinicId}`;

async function run<T>(
  clinicId: string,
  fn: () => Promise<Result<T>>
): Promise<{ error: string } | { success: true; data: T }> {
  await requirePlatformAdmin();
  const res = await fn();
  if (!res.ok) return { error: res.error };
  revalidatePath(builderPath(clinicId));
  revalidatePath("/platform/health-profiles");
  return { success: true as const, data: res.data };
}

export async function createHealthSectionAction(clinicId: string, input: unknown) {
  return run(clinicId, () => HealthProfileService.createSection(clinicId, input));
}

export async function updateHealthSectionAction(clinicId: string, id: string, input: unknown) {
  return run(clinicId, () => HealthProfileService.updateSection(clinicId, id, input));
}

export async function removeHealthSectionAction(clinicId: string, id: string) {
  return run(clinicId, () => HealthProfileService.removeSection(clinicId, id));
}

export async function restoreHealthSectionAction(clinicId: string, id: string) {
  return run(clinicId, () => HealthProfileService.restoreSection(clinicId, id));
}

export async function moveHealthSectionAction(clinicId: string, id: string, dir: "up" | "down") {
  return run(clinicId, () => HealthProfileService.moveSection(clinicId, id, dir));
}

export async function createHealthQuestionAction(clinicId: string, input: unknown) {
  return run(clinicId, () => HealthProfileService.createQuestion(clinicId, input));
}

export async function updateHealthQuestionAction(clinicId: string, id: string, input: unknown) {
  return run(clinicId, () => HealthProfileService.updateQuestion(clinicId, id, input));
}

export async function removeHealthQuestionAction(clinicId: string, id: string) {
  return run(clinicId, () => HealthProfileService.removeQuestion(clinicId, id));
}

export async function restoreHealthQuestionAction(clinicId: string, id: string) {
  return run(clinicId, () => HealthProfileService.restoreQuestion(clinicId, id));
}

export async function moveHealthQuestionAction(clinicId: string, id: string, dir: "up" | "down") {
  return run(clinicId, () => HealthProfileService.moveQuestion(clinicId, id, dir));
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import * as AiAgentService from "@/server/services/aiAgents";
import type { AiAgentInput } from "@/server/services/aiAgents";

/**
 * Setting up a clinic's AI employees is platform-admin work: an agent's persona
 * is prompt text that shapes every reply, so — like the knowledge base — it is
 * written by the platform team, not by the clinic.
 *
 * Mirrors server/actions/platformKnowledge.ts: `requirePlatformAdmin` plus an
 * explicit `clinicId`, since the console runs on the root domain where there is
 * no tenant to infer from the host. Every service call is scoped by that
 * clinicId, so a mistyped agent id can't touch another clinic's agent.
 */

const AGENTS_PATH = "/platform/agents";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createClinicAiAgentAction(
  clinicId: string,
  input: AiAgentInput
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const res = await AiAgentService.createAiAgent(clinicId, input);
  if (!res.ok) return res;
  revalidatePath(AGENTS_PATH);
  return { ok: true };
}

export async function updateClinicAiAgentAction(
  clinicId: string,
  agentId: string,
  input: AiAgentInput
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const res = await AiAgentService.updateAiAgent(clinicId, agentId, input);
  if (!res.ok) return res;
  revalidatePath(AGENTS_PATH);
  return { ok: true };
}

export async function deleteClinicAiAgentAction(
  clinicId: string,
  agentId: string
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const res = await AiAgentService.deleteAiAgent(clinicId, agentId);
  if (!res.ok) return res;
  revalidatePath(AGENTS_PATH);
  return { ok: true };
}

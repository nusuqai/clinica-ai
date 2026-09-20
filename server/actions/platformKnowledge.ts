"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import * as KnowledgeService from "@/server/services/knowledge";

/**
 * Knowledge-base authoring is platform-admin work.
 *
 * The documents themselves are clinic content, but two of their fields are
 * really retrieval tuning rather than writing: `slug` is the handle the agent
 * passes to `get_knowledge`, and `summary` is what the model reads to decide
 * whether to open a document at all. Get the summary wrong and the assistant
 * silently never retrieves the doc — a failure that surfaces only as a bad
 * answer to a patient. So the platform team owns this, and a clinic admin sees
 * a read-only view at /admin/knowledge.
 *
 * Mirrors server/actions/platformWhatsapp.ts: `requirePlatformAdmin` plus an
 * explicit `clinicId`, since the console runs on the root domain where there is
 * no tenant to infer from the host.
 */

const KNOWLEDGE_PATH = "/platform/knowledge";

export async function createClinicKnowledgeDocAction(input: {
  clinicId: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive?: boolean;
}) {
  await requirePlatformAdmin();
  const result = await KnowledgeService.createKnowledgeDoc(input);
  if (!result.ok) return { error: result.error };
  revalidatePath(KNOWLEDGE_PATH);
  return { success: true as const, id: result.data.id };
}

export async function updateClinicKnowledgeDocAction(input: {
  clinicId: string;
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
}) {
  await requirePlatformAdmin();
  // Ownership check: the doc must belong to the clinic named in the input, so a
  // mistyped id can't edit another clinic's document.
  const doc = await KnowledgeService.getKnowledgeDocById(input.clinicId, input.id);
  if (!doc) return { error: "المستند غير موجود" };

  const result = await KnowledgeService.updateKnowledgeDoc(input);
  if (!result.ok) return { error: result.error };
  revalidatePath(KNOWLEDGE_PATH);
  return { success: true as const };
}

export async function toggleClinicKnowledgeDocActiveAction(input: {
  clinicId: string;
  id: string;
  isActive: boolean;
}) {
  await requirePlatformAdmin();
  const doc = await KnowledgeService.getKnowledgeDocById(input.clinicId, input.id);
  if (!doc) return { error: "المستند غير موجود" };

  const result = await KnowledgeService.setKnowledgeDocActive(input.id, input.isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath(KNOWLEDGE_PATH);
  return { success: true as const };
}

export async function deleteClinicKnowledgeDocAction(input: { clinicId: string; id: string }) {
  await requirePlatformAdmin();
  const doc = await KnowledgeService.getKnowledgeDocById(input.clinicId, input.id);
  if (!doc) return { error: "المستند غير موجود" };

  const result = await KnowledgeService.deleteKnowledgeDoc(input.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(KNOWLEDGE_PATH);
  return { success: true as const };
}

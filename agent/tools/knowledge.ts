import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  listKnowledgeDocs,
  getKnowledgeDoc,
} from "@/server/services/knowledge";
import { jsonTool } from "./shared";

/**
 * Knowledge-base lookup tools, available to every caller. `list_knowledge`
 * returns a small catalog (title + summary per doc) so the model knows what
 * clinic-specific documents exist; `get_knowledge` returns the full markdown
 * of one doc on demand. Keeps tokens low: only the catalog is cheap-and-always,
 * full content is fetched only when a doc is actually relevant.
 */
export function knowledgeTools(clinicId: string): DynamicStructuredTool[] {
  return [
    jsonTool(
      {
        name: "list_knowledge",
        description:
          "اعرض قائمة مستندات المعرفة الخاصة بالعيادة (سياسات، تعليمات، قوائم مرجعية) مع عنوان ووصف مختصر لكل مستند ومعرّفه (slug). استخدمها أولاً لمعرفة ما هو متاح، ثم استخدم get_knowledge لجلب محتوى المستند المناسب عند الحاجة للإجابة عن سؤال يتعلق بمحتواه.",
        schema: z.object({}),
      },
      async () => {
        const docs = await listKnowledgeDocs(clinicId);
        return { docs };
      },
    ),
    jsonTool(
      {
        name: "get_knowledge",
        description:
          "اجلب المحتوى الكامل لمستند معرفة واحد باستخدام معرّفه (slug) الذي حصلت عليه من list_knowledge. يعيد نص المستند بصيغة ماركداون. استخدمه عندما يسأل المستخدم عن معلومة قد تكون موجودة في أحد مستندات العيادة (مثل شروط التعامل مع جهة/شركة، أو الاسم القياسي لفحص معيّن). اعتمد على النص المُعاد ولا تختلق معلومات.",
        schema: z.object({
          slug: z
            .string()
            .describe("معرّف المستند (slug) من list_knowledge"),
        }),
      },
      async ({ slug }) => {
        const doc = await getKnowledgeDoc(clinicId, slug);
        if (!doc) {
          return {
            error: "المستند غير موجود. استخدم list_knowledge لعرض المستندات المتاحة.",
          };
        }
        return doc;
      },
    ),
  ];
}

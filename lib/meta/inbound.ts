/**
 * Vocabulary for WhatsApp's inbound parser — the set of message types the agent
 * can't read and the Arabic notice each one earns, so a patient sending a photo
 * always gets the same answer.
 */

export interface UnsupportedMediaType {
  /** Shown in the admin inbox in place of the content we can't store. */
  placeholder: string;
  /** Reads as the object of "لا يمكننا استقبال …" in the auto-reply. */
  noun: string;
}

/** Keyed by what the attachment *is*, not by any one product's type string. */
export const MEDIA_NOTICES = {
  image: { placeholder: "[صورة]", noun: "الصور" },
  video: { placeholder: "[فيديو]", noun: "مقاطع الفيديو" },
  audio: { placeholder: "[رسالة صوتية]", noun: "الرسائل الصوتية" },
  file: { placeholder: "[ملف]", noun: "الملفات" },
  sticker: { placeholder: "[ملصق]", noun: "الملصقات" },
  location: { placeholder: "[موقع]", noun: "مواقع الخريطة" },
  contact: { placeholder: "[جهة اتصال]", noun: "جهات الاتصال" },
  order: { placeholder: "[طلب]", noun: "الطلبات" },
  unknown: { placeholder: "[رسالة غير مدعومة]", noun: "هذا النوع من الرسائل" },
} as const satisfies Record<string, UnsupportedMediaType>;

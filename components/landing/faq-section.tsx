"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    question: "كيف أحجز موعداً مع طبيب؟",
    answer:
      'اختر الطبيب المناسب من قائمة الأطباء، ثم اضغط "احجز موعد"، واختر اليوم المتاح والوقت الذي يناسبك، وأكّد الحجز.',
  },
  {
    question: "هل يمكنني إلغاء أو تعديل موعدي؟",
    answer:
      "نعم، يمكنك إلغاء موعدك من لوحة التحكم الخاصة بك في أي وقت قبل موعد الحجز.",
  },
  {
    question: "هل الحجز مجاني؟",
    answer:
      "الحجز عبر المنصة مجاني بالكامل، وتُدفع رسوم الكشف مباشرة في العيادة حسب سعر كل طبيب.",
  },
  {
    question: "ماذا لو لم تظهر مواعيد متاحة لطبيب معين؟",
    answer:
      "يعني ذلك أن الطبيب ليس لديه أوقات متاحة حالياً ضمن الفترة القادمة، حاول التحقق لاحقاً أو اختر طبيباً آخر بنفس التخصص.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-white px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            الأسئلة الشائعة
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            إجابات على أكثر الأسئلة تكراراً حول الحجز
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-2xl border border-border bg-background"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right"
                >
                  <span className="font-sans text-sm font-semibold text-text">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-accent transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4">
                    <p className="font-sans text-sm leading-relaxed text-text/60">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

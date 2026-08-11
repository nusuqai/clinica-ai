"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    question: "ما هي منصة ClinicaAI؟",
    answer:
      "ClinicaAI منصة متكاملة لإدارة العيادات: حجز المواعيد، إدارة الأطباء والمرضى، موظف استقبال ذكي يعمل بالذكاء الاصطناعي، وحجز عبر واتساب — كل ذلك من لوحة تحكم واحدة.",
  },
  {
    question: "كيف أبدأ باستخدام المنصة لعيادتي؟",
    answer:
      'اضغط على "أنشئ عيادتك" واملأ نموذج الطلب. سيراجع فريقنا طلبك ويجهّز عيادتك ثم يرسل لك بيانات الدخول كمسؤول عن العيادة.',
  },
  {
    question: "هل يحصل كل مريض على صفحة خاصة بالعيادة؟",
    answer:
      "نعم، كل عيادة تحصل على صفحة عامة خاصة بها يستطيع المرضى من خلالها تصفح الأطباء وحجز المواعيد وإنشاء حساباتهم في تلك العيادة تحديداً.",
  },
  {
    question: "هل يمكن للمستخدم أن يكون في أكثر من عيادة؟",
    answer:
      "نعم. الحساب الواحد يمكن أن ينتمي إلى عدة عيادات، ولكل عيادة تسجيل دخول ودور خاص به (مريض، طبيب، أو مسؤول).",
  },
  {
    question: "هل بيانات العيادة والمرضى آمنة؟",
    answer:
      "نعم، بيانات كل عيادة معزولة عن غيرها، ونتعامل مع البيانات الطبية والشخصية بأعلى معايير الخصوصية والأمان.",
  },
];

export function SaasFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20 bg-white px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            الأسئلة الشائعة
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            كل ما تريد معرفته عن المنصة
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

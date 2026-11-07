"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  return (
    <section id="faq" className="scroll-mt-20 bg-white px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            الأسئلة الشائعة
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">كل ما تريد معرفته عن المنصة</p>
        </div>

        <Accordion type="single" collapsible defaultValue="0" className="flex flex-col gap-3">
          {FAQS.map((faq, i) => (
            <AccordionItem
              key={faq.question}
              value={String(i)}
              className="overflow-hidden rounded-2xl border border-border bg-background"
            >
              <AccordionTrigger className="px-5 font-semibold text-text [&>svg]:text-accent">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="px-5">
                <p className="font-sans text-sm leading-relaxed text-text/60">{faq.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

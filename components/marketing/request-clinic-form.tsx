"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle } from "lucide-react";
import { submitClinicRequest } from "@/server/actions/clinics";
import { toFormData } from "@/lib/form-data";
import { clinicRequestSchema, type ClinicRequestValues } from "@/lib/validations/public";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

/** Translucent control on the dark marketing section. */
const darkControl =
  "h-12 rounded-xl border-white/15 bg-white/5 px-4 text-white placeholder:text-white/40 focus-visible:border-accent focus-visible:ring-accent/30";
/** Field errors in a lighter red that reads on the dark section. */
const darkError = "text-red-300";

export function RequestClinicForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<ClinicRequestValues>({
    resolver: zodResolver(clinicRequestSchema),
    defaultValues: {
      requesterName: "",
      requesterEmail: "",
      requestedClinicName: "",
      requesterPhone: "",
      requestedSlug: "",
      note: "",
    },
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    start(async () => {
      setError(null);
      const res = await submitClinicRequest(toFormData(values));
      if (res && "error" in res && res.error) setError(res.error);
      else setDone(true);
    });
  });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/5 px-8 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle className="h-8 w-8 text-emerald-400" />
        </div>
        <p className="font-heading text-xl font-bold text-white">تم استلام طلبك!</p>
        <p className="max-w-sm font-sans text-sm text-white/60">
          سيتواصل معك فريق ClinicaAI قريباً لإعداد عيادتك على المنصة.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-1 gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-2"
    >
      <FormField
        control={form.control}
        name="requesterName"
        placeholder="اسمك"
        required
        controlClassName={darkControl}
        errorClassName={darkError}
      />
      <FormField
        type="email"
        control={form.control}
        name="requesterEmail"
        errorClassName={darkError}
        placeholder="بريدك الإلكتروني"
        required
        controlClassName={darkControl}
      />
      <FormField
        control={form.control}
        name="requestedClinicName"
        errorClassName={darkError}
        placeholder="اسم العيادة"
        required
        className="sm:col-span-2"
        controlClassName={darkControl}
      />
      <FormField
        type="tel"
        control={form.control}
        name="requesterPhone"
        errorClassName={darkError}
        placeholder="رقم الهاتف (اختياري)"
        controlClassName={darkControl}
      />
      <FormField
        control={form.control}
        name="requestedSlug"
        errorClassName={darkError}
        placeholder="المعرّف المفضّل (اختياري)"
        dir="ltr"
        controlClassName={darkControl}
      />
      <FormField
        type="textarea"
        control={form.control}
        name="note"
        errorClassName={darkError}
        rows={3}
        placeholder="أخبرنا المزيد عن عيادتك (اختياري)"
        className="sm:col-span-2"
        controlClassName={`${darkControl} h-auto py-3`}
      />
      <div className="flex flex-col items-center gap-3 sm:col-span-2">
        <Button
          type="submit"
          variant="accent"
          loading={pending}
          className="h-auto w-full px-7 py-3.5 text-base shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5 hover:bg-accent sm:w-auto"
        >
          {pending ? "جارٍ الإرسال..." : "اطلب إنشاء عيادتك"}
        </Button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

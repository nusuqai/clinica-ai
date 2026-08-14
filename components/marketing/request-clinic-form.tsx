"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { submitClinicRequest } from "@/server/actions/clinics";

const inputCls =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-sans text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all";

export function RequestClinicForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const res = await submitClinicRequest(fd);
      if (res && "error" in res && res.error) setError(res.error);
      else setDone(true);
    });
  }

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
      className="grid grid-cols-1 gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-2"
    >
      <input name="requesterName" placeholder="اسمك" required className={inputCls} />
      <input
        name="requesterEmail"
        type="email"
        placeholder="بريدك الإلكتروني"
        required
        className={inputCls}
        dir="ltr"
      />
      <input
        name="requestedClinicName"
        placeholder="اسم العيادة"
        required
        className={`${inputCls} sm:col-span-2`}
      />
      <input
        name="requesterPhone"
        placeholder="رقم الهاتف (اختياري)"
        className={inputCls}
        dir="ltr"
      />
      <input
        name="requestedSlug"
        placeholder="المعرّف المفضّل (اختياري)"
        className={inputCls}
        dir="ltr"
      />
      <textarea
        name="note"
        rows={3}
        placeholder="أخبرنا المزيد عن عيادتك (اختياري)"
        className={`${inputCls} sm:col-span-2 resize-none`}
      />
      <div className="sm:col-span-2 flex flex-col items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "جارٍ الإرسال..." : "اطلب إنشاء عيادتك"}
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}

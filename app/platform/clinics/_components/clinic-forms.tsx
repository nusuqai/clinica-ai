"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClinic, updateClinic } from "@/server/actions/clinics";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

export function CreateClinicForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await createClinic(fd);
          if (res && "error" in res && res.error) setError(res.error);
          else {
            (e.target as HTMLFormElement).reset();
            router.refresh();
          }
        });
      }}
    >
      <input name="name" placeholder="اسم العيادة" required className={inputCls} />
      <input name="slug" placeholder="المعرّف (اختياري)" className={inputCls} dir="ltr" />
      <input name="logoUrl" placeholder="رابط الشعار (اختياري)" className={inputCls} dir="ltr" />
      <div className="flex gap-3">
        <input name="primaryColor" placeholder="#0B1F3A" className={inputCls} dir="ltr" />
        <input name="accentColor" placeholder="#00C2CB" className={inputCls} dir="ltr" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          إنشاء
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}

interface ClinicCardProps {
  clinic: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    isActive: boolean;
    _count: { members: number; doctors: number };
  };
}

export function ClinicCard({ clinic }: ClinicCardProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (fd: FormData) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await updateClinic(clinic.id, fd);
      if (res && "error" in res && res.error) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-heading font-semibold text-foreground">{clinic.name}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            /clinic/{clinic.slug}
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("isActive", clinic.isActive ? "false" : "true");
            save(fd);
          }}
          className={[
            "rounded-full px-3 py-1 text-xs font-medium",
            clinic.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500",
          ].join(" ")}
        >
          {clinic.isActive ? "نشطة" : "معطّلة"}
        </button>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {clinic._count.members} عضو · {clinic._count.doctors} طبيب
      </p>

      <form
        className="grid grid-cols-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget));
        }}
      >
        <input
          name="name"
          defaultValue={clinic.name}
          className={inputCls}
          placeholder="اسم العيادة"
        />
        <input
          name="logoUrl"
          defaultValue={clinic.logoUrl ?? ""}
          className={inputCls}
          dir="ltr"
          placeholder="رابط الشعار"
        />
        <div className="flex gap-2">
          <input
            name="primaryColor"
            defaultValue={clinic.primaryColor ?? ""}
            className={inputCls}
            dir="ltr"
            placeholder="اللون الأساسي"
          />
          <input
            name="accentColor"
            defaultValue={clinic.accentColor ?? ""}
            className={inputCls}
            dir="ltr"
            placeholder="لون التمييز"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            حفظ
          </button>
          {saved && <span className="text-xs text-emerald-600">تم الحفظ</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
    </div>
  );
}

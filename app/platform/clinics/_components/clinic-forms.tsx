"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClinic, updateClinic } from "@/server/actions/clinics";
import { clinicHost, clinicOrigin } from "@/lib/clinic-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";

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
      <FormField name="name" placeholder="اسم العيادة" required />
      <FormField name="slug" placeholder="المعرّف (اختياري)" dir="ltr" />

      {/* Managing admin — the account set up as this clinic's ADMIN */}
      <FormField name="adminName" placeholder="اسم مدير العيادة" required />
      <FormField type="email" name="adminEmail" placeholder="بريد مدير العيادة" required />
      <FormField name="adminPhone" placeholder="هاتف المدير (اختياري)" dir="ltr" />

      <FormField name="logoUrl" placeholder="رابط الشعار (اختياري)" dir="ltr" />
      <div className="flex gap-3">
        <FormField name="primaryColor" placeholder="#0B1F3A" dir="ltr" className="flex-1" />
        <FormField name="accentColor" placeholder="#00C2CB" dir="ltr" className="flex-1" />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        سيتم إنشاء حساب لمدير العيادة (أو استخدام حسابه الحالي) وتعيينه مسؤولاً عن هذه العيادة.
      </p>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>
          إنشاء
        </Button>
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
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-heading font-semibold text-foreground">{clinic.name}</p>
          <a
            href={clinicOrigin(clinic.slug)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
            dir="ltr"
          >
            {clinicHost(clinic.slug)}
          </a>
        </div>
        <Badge asChild variant={clinic.isActive ? "success" : "neutral"} className="px-3 py-1">
          <button
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("isActive", clinic.isActive ? "false" : "true");
              save(fd);
            }}
          >
            {clinic.isActive ? "نشطة" : "معطّلة"}
          </button>
        </Badge>
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
        <FormField name="name" defaultValue={clinic.name} placeholder="اسم العيادة" />
        <FormField
          name="logoUrl"
          defaultValue={clinic.logoUrl ?? ""}
          dir="ltr"
          placeholder="رابط الشعار"
        />
        <div className="flex gap-2">
          <FormField
            name="primaryColor"
            defaultValue={clinic.primaryColor ?? ""}
            dir="ltr"
            placeholder="اللون الأساسي"
            className="flex-1"
          />
          <FormField
            name="accentColor"
            defaultValue={clinic.accentColor ?? ""}
            dir="ltr"
            placeholder="لون التمييز"
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" size="sm" loading={pending}>
            حفظ
          </Button>
          {saved && <span className="text-xs text-emerald-600">تم الحفظ</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </form>
    </Card>
  );
}

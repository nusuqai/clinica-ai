"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClinic, setClinicKindAction, updateClinic } from "@/server/actions/clinics";
import { clinicHost, clinicOrigin } from "@/lib/clinic-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toFormData } from "@/lib/form-data";
import {
  createClinicSchema,
  updateClinicSchema,
  type CreateClinicValues,
  type UpdateClinicValues,
} from "@/lib/validations/platform";

const EMPTY_CLINIC: CreateClinicValues = {
  name: "",
  slug: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  logoUrl: "",
  primaryColor: "",
  accentColor: "",
  kind: "CENTER",
};

type Kind = CreateClinicValues["kind"];

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "CENTER", label: "مركز طبي" },
  { value: "SOLO_DOCTOR", label: "عيادة طبيب واحد" },
];

/** CENTER / SOLO_DOCTOR picker. Radix single toggle can be cleared — ignore that. */
function KindPicker({
  value,
  onChange,
  disabled,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && v !== value && onChange(v as Kind)}
      className="justify-start"
    >
      {KIND_OPTIONS.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="px-3">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function CreateClinicForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateClinicValues>({
    resolver: zodResolver(createClinicSchema),
    defaultValues: EMPTY_CLINIC,
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    start(async () => {
      setError(null);
      const res = await createClinic(toFormData(values));
      if (res && "error" in res && res.error) setError(res.error);
      else {
        form.reset(EMPTY_CLINIC);
        router.refresh();
      }
    });
  });

  const { control } = form;
  const kind = form.watch("kind");
  return (
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
      <FormField control={control} name="name" placeholder="اسم العيادة" required />
      <FormField control={control} name="slug" placeholder="المعرّف (اختياري)" dir="ltr" />

      {/* Kind — a solo clinic serves exactly one doctor (added later by the clinic admin) */}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-xs font-medium text-muted-foreground">نوع العيادة</span>
        <KindPicker value={kind} onChange={(k) => form.setValue("kind", k)} />
        {kind === "SOLO_DOCTOR" && (
          <p className="text-xs text-muted-foreground">
            عيادة لطبيب واحد فقط: يضيف مدير العيادة بيانات الطبيب، وتعرض الصفحة الرئيسية والمساعد
            الذكي هذا الطبيب وحده.
          </p>
        )}
      </div>

      {/* Managing admin — the account set up as this clinic's ADMIN */}
      <FormField control={control} name="adminName" placeholder="اسم مدير العيادة" required />
      <FormField
        control={control}
        type="email"
        name="adminEmail"
        placeholder="بريد مدير العيادة"
        required
      />
      <FormField
        control={control}
        name="adminPhone"
        placeholder="هاتف المدير (اختياري)"
        dir="ltr"
      />

      <FormField control={control} name="logoUrl" placeholder="رابط الشعار (اختياري)" dir="ltr" />
      <div className="flex items-start gap-3">
        <FormField
          control={control}
          name="primaryColor"
          placeholder="#0B1F3A"
          dir="ltr"
          className="flex-1"
        />
        <FormField
          control={control}
          name="accentColor"
          placeholder="#00C2CB"
          dir="ltr"
          className="flex-1"
        />
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
    kind: Kind;
    _count: { members: number; doctors: number };
  };
}

export function ClinicCard({ clinic }: ClinicCardProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [kindError, setKindError] = useState<string | null>(null);
  const [kindNotice, setKindNotice] = useState(false);

  const changeKind = (kind: Kind) =>
    start(async () => {
      setKindError(null);
      setKindNotice(false);
      const res = await setClinicKindAction(clinic.id, kind);
      if (res && "error" in res && res.error) setKindError(res.error);
      else {
        setKindNotice(true);
        router.refresh();
      }
    });

  const form = useForm<UpdateClinicValues>({
    resolver: zodResolver(updateClinicSchema),
    defaultValues: {
      name: clinic.name,
      logoUrl: clinic.logoUrl ?? "",
      primaryColor: clinic.primaryColor ?? "",
      accentColor: clinic.accentColor ?? "",
    },
    mode: "onTouched",
  });
  const { control } = form;

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

      <div className="mb-3 flex flex-col gap-1.5">
        <KindPicker value={clinic.kind} onChange={changeKind} disabled={pending} />
        {kindError && <span className="text-xs text-red-600">{kindError}</span>}
        {kindNotice && (
          <span className="text-xs text-amber-700">
            تم تغيير نوع العيادة. راجع وصف العيادة ومستندات المعرفة وقوالب واتساب، فقد تذكر صيغة
            النوع السابق.
          </span>
        )}
      </div>

      <form
        className="grid grid-cols-1 gap-2"
        onSubmit={form.handleSubmit((values) => save(toFormData(values)))}
        noValidate
      >
        <FormField control={control} name="name" placeholder="اسم العيادة" />
        <FormField control={control} name="logoUrl" dir="ltr" placeholder="رابط الشعار" />
        <div className="flex items-start gap-2">
          <FormField
            control={control}
            name="primaryColor"
            dir="ltr"
            placeholder="اللون الأساسي"
            className="flex-1"
          />
          <FormField
            control={control}
            name="accentColor"
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

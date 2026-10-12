"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { updateClinicInfoAction } from "@/server/actions/admin";
import { PhoneType, SocialPlatform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PhoneRows, phonesForSave } from "@/components/admin/phone-rows";
import { clinicInfoSchema, type ClinicInfoValues } from "@/lib/validations/admin";

export interface ClinicPhoneView {
  type: PhoneType;
  number: string;
  label: string | null;
  isPrimary: boolean;
}
export interface ClinicSocialView {
  platform: SocialPlatform;
  url: string;
}
export interface ClinicInfoView {
  name: string;
  description: string | null;
  phones: ClinicPhoneView[];
  socials: ClinicSocialView[];
}

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: SocialPlatform.FACEBOOK, label: "فيسبوك" },
  { value: SocialPlatform.INSTAGRAM, label: "إنستجرام" },
  { value: SocialPlatform.X, label: "إكس (تويتر)" },
  { value: SocialPlatform.TIKTOK, label: "تيك توك" },
  { value: SocialPlatform.YOUTUBE, label: "يوتيوب" },
  { value: SocialPlatform.WEBSITE, label: "الموقع الإلكتروني" },
  { value: SocialPlatform.OTHER, label: "أخرى" },
];

const sectionLabel = "font-sans text-sm font-medium text-foreground";

function formFromInfo(info: ClinicInfoView): ClinicInfoValues {
  return {
    name: info.name,
    description: info.description ?? "",
    phones: info.phones.map((p) => ({ ...p, label: p.label ?? "" })),
    socials: info.socials.map((s) => ({ ...s })),
  };
}

export default function ClinicInfoForm({ info }: { info: ClinicInfoView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<ClinicInfoValues>({
    resolver: zodResolver(clinicInfoSchema),
    defaultValues: formFromInfo(info),
    mode: "onTouched",
  });
  const socials = useFieldArray({ control: form.control, name: "socials" });

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateClinicInfoAction({
        name: values.name,
        description: values.description || null,
        phones: phonesForSave(values.phones),
        socials: values.socials.filter((s) => s.url),
      });
      if (res?.error) setError(res.error);
      else {
        setSaved(true);
        form.reset(values);
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      }
    });
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-3xl space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {saved && <Alert variant="success">تم حفظ التغييرات</Alert>}

      <Card className="space-y-4 p-5">
        <FormField control={form.control} name="name" label="اسم العيادة" />
        <FormField
          control={form.control}
          name="description"
          type="textarea"
          label="نبذة عن العيادة"
          rows={4}
        />
      </Card>

      {/* Phones */}
      <Card className="space-y-3 p-5">
        <PhoneRows
          control={form.control}
          setValue={form.setValue}
          title="أرقام الهواتف العامة"
          description="الرقم المعلّم كـ«أساسي» هو الرقم الرئيسي للعيادة."
        />
      </Card>

      {/* Socials */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <Label className={sectionLabel}>حسابات التواصل الاجتماعي</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => socials.append({ platform: SocialPlatform.FACEBOOK, url: "" })}
            className="h-auto px-0 text-sm [&_svg]:size-3.5"
          >
            <Plus /> إضافة حساب
          </Button>
        </div>
        {socials.fields.length === 0 && (
          <p className="font-sans text-xs text-muted-foreground">لا توجد حسابات مضافة.</p>
        )}
        {socials.fields.map((field, i) => (
          <div key={field.id} className="flex flex-wrap items-start gap-2">
            <FormField
              control={form.control}
              name={`socials.${i}.platform`}
              type="select"
              options={PLATFORMS}
              className="w-36"
            />
            <FormField
              control={form.control}
              name={`socials.${i}.url`}
              type="url"
              placeholder="https://…"
              className="min-w-[160px] flex-1"
            />
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              onClick={() => socials.remove(i)}
              aria-label="حذف الحساب"
            >
              <X />
            </Button>
          </div>
        ))}
      </Card>

      <Button type="submit" loading={isPending} className="px-6">
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </Button>
    </form>
  );
}

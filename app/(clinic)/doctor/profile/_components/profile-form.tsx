"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateMyProfileAction } from "@/server/actions/doctor";
import {
  doctorProfileSchema,
  doctorProfileToFormData,
  type DoctorProfileValues,
} from "@/lib/validations/doctor";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import SpecialtySelect, {
  type SpecialtyOption,
} from "@/app/(clinic)/admin/doctors/_components/specialty-select";
import { Alert } from "@/components/ui/alert";

interface ProfileFormProps {
  fullName: string;
  phone: string | null;
  specialtyId: string | null;
  specialties: SpecialtyOption[];
  bio: string | null;
  consultationFee: string | null;
}

export default function ProfileForm({
  fullName,
  phone,
  specialtyId,
  specialties,
  bio,
  consultationFee,
}: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<DoctorProfileValues>({
    resolver: zodResolver(doctorProfileSchema),
    defaultValues: {
      fullName,
      phone: phone ?? "",
      specialtyId: specialtyId ?? "",
      newSpecialtyName: "",
      consultationFee: consultationFee ?? "",
      bio: bio ?? "",
    },
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await updateMyProfileAction(doctorProfileToFormData(values));
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      // The saved values are the new baseline (no longer "dirty").
      form.reset(values);
      setTimeout(() => setSuccess(false), 4000);
    });
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <Alert variant="success">تم تحديث الملف الشخصي بنجاح</Alert>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="fullName"
          label="الاسم الكامل *"
          required
          placeholder="د. محمد أحمد"
        />

        <FormField
          type="tel"
          control={form.control}
          name="phone"
          label="رقم الهاتف"
          placeholder="+966 5XXXXXXXX"
        />

        <div>
          <SpecialtySelect control={form.control} specialties={specialties} />
        </div>

        <FormField
          type="number"
          control={form.control}
          name="consultationFee"
          label="رسوم الاستشارة (ر.س)"
          min="0"
          step="0.01"
          placeholder="150"
        />

        <FormField
          type="textarea"
          control={form.control}
          name="bio"
          label="نبذة عنك"
          rows={4}
          placeholder="اكتب نبذة مختصرة عن خبرتك وتخصصك..."
          className="sm:col-span-2"
        />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Button type="submit" loading={isPending} className="px-6">
          {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>
    </form>
  );
}

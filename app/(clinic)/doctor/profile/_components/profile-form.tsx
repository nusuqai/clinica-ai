"use client";

import { useState, useTransition } from "react";
import { updateMyProfileAction } from "@/server/actions/doctor";
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateMyProfileAction(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <Alert variant="success">تم تحديث الملف الشخصي بنجاح</Alert>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField
          name="fullName"
          label="الاسم الكامل *"
          required
          defaultValue={fullName}
          placeholder="د. محمد أحمد"
        />

        <FormField
          type="tel"
          name="phone"
          label="رقم الهاتف"
          defaultValue={phone ?? ""}
          placeholder="+966 5XXXXXXXX"
        />

        <div>
          <SpecialtySelect specialties={specialties} defaultSpecialtyId={specialtyId} />
        </div>

        <FormField
          type="number"
          name="consultationFee"
          label="رسوم الاستشارة (ر.س)"
          min="0"
          step="0.01"
          defaultValue={consultationFee ?? ""}
          placeholder="150"
        />

        <FormField
          type="textarea"
          name="bio"
          label="نبذة عنك"
          rows={4}
          defaultValue={bio ?? ""}
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

"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { updateDoctorAction } from "@/server/actions/admin";
import type { DoctorWithProfile } from "@/server/services/doctors";
import { type BranchOption } from "./add-doctor-modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Hint } from "@/components/ui/tooltip";
import {
  doctorToFormData,
  editDoctorSchema,
  EMPTY_DOCTOR_FORM,
  type DoctorFormValues,
} from "@/lib/validations/doctor";
import { type SpecialtyOption } from "./specialty-select";
import AvailabilityRulesEditor from "./availability-rules-editor";
import { DoctorFormFields } from "./doctor-form-fields";

interface EditDoctorModalProps {
  doctor: DoctorWithProfile;
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}

function formFromDoctor(doctor: DoctorWithProfile): DoctorFormValues {
  return {
    ...EMPTY_DOCTOR_FORM,
    fullName: doctor.profile.fullName,
    title: doctor.title ?? "",
    specialtyId: doctor.specialtyId ?? "",
    yearsOfExperience: doctor.yearsOfExperience?.toString() ?? "",
    examinationFee: doctor.examinationFee?.toString() ?? "",
    consultationFee: doctor.consultationFee?.toString() ?? "",
    requiresAdvanceBooking: doctor.requiresAdvanceBooking,
    acceptsChildren: doctor.acceptsChildren,
    branchIds: doctor.branchIds,
    qualifications: doctor.qualifications ?? "",
    expertiseAreas: doctor.expertiseAreas ?? "",
    bio: doctor.bio ?? "",
  };
}

export default function EditDoctorModal({ doctor, branches, specialties }: EditDoctorModalProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<DoctorFormValues>({
    resolver: zodResolver(editDoctorSchema),
    defaultValues: formFromDoctor(doctor),
    mode: "onTouched",
  });

  function openModal() {
    // Start from the doctor's current data (it may have changed since mount).
    form.reset(formFromDoctor(doctor));
    setError(null);
    setOpen(true);
  }

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    const formData = doctorToFormData(values);
    formData.set("doctorId", doctor.id);
    startTransition(async () => {
      const res = await updateDoctorAction(formData);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  });

  return (
    <>
      <Hint label="تعديل">
        <Button
          variant="ghost"
          size="icon"
          onClick={openModal}
          aria-label="تعديل"
          className="hover:bg-primary/10 hover:text-primary"
        >
          <Pencil />
        </Button>
      </Hint>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="تعديل بيانات الطبيب"
        width="max-w-2xl"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <DoctorFormFields control={form.control} branches={branches} specialties={specialties} />

          {/* Availability rules — live add/remove for the doctor's branches */}
          {open && (
            <AvailabilityRulesEditor
              mode="live"
              doctorId={doctor.id}
              branches={branches.filter((b) => doctor.branchIds.includes(b.id))}
              clinicId={doctor.clinicId}
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

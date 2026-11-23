"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import HealthProfileEditor from "@/components/health-profile/health-profile-editor";
import type { AnswersMap, HealthSectionView } from "@/lib/health-profile";

/** Staff (admin / staff with medical_records / treating doctor): edit a patient's file. */
export default function EditHealthProfileModal({
  patientId,
  sections,
  answers,
}: {
  patientId: string;
  sections: HealthSectionView[];
  answers: AnswersMap;
}) {
  const [open, setOpen] = useState(false);
  // Remount the editor on each open so it starts from the latest answers.
  const [key, setKey] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Pencil />
        تعديل الملف
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="ملف المريض" width="max-w-2xl">
        <p className="mb-4 font-sans text-xs text-muted-foreground">
          يمكن ترك أي سؤال فارغاً إن لم تكن المعلومة متاحة. كل تعديل يُسجَّل باسمك في سجل التعديلات.
        </p>
        <HealthProfileEditor
          key={key}
          mode={{ patientId }}
          sections={sections}
          answers={answers}
          onSaved={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { applyCatalogTemplateAction } from "@/server/actions/catalog";
import { CATALOG_TEMPLATES } from "@/lib/catalog-templates";
import { PRICING_TYPE_LABEL, durationText } from "@/lib/catalog";

/** Starter catalogs per clinic type: preview one, then add it (no prices, inactive). */
export default function TemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [key, setKey] = useState(CATALOG_TEMPLATES[0].key);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const template = CATALOG_TEMPLATES.find((t) => t.key === key)!;
  const count = template.categories.reduce((n, c) => n + c.services.length, 0);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await applyCatalogTemplateAction(key);
      if (!("success" in res)) setError(res.error);
      else {
        toast.success(
          `أُضيف ${res.services} خدمة في ${res.categories} تصنيف جديد${res.skipped ? ` (تخطّي ${res.skipped} موجودة بالفعل)` : ""}`
        );
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="قوالب جاهزة حسب نوع العيادة"
      description="تُضاف الخدمات معطّلة وبدون أسعار؛ حدّد السعر ومن يقدّمها ثم فعّلها. لا يُكرَّر ما هو موجود بالاسم نفسه."
      width="max-w-2xl"
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          {CATALOG_TEMPLATES.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant={t.key === key ? "default" : "outline"}
              onClick={() => setKey(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <p className="font-sans text-sm text-muted-foreground">{template.description}</p>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-border p-3">
          {template.categories.map((c) => (
            <div key={c.name}>
              <p className="mb-1.5 font-sans text-sm font-semibold text-foreground">{c.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.services.map((s) => (
                  <Badge key={s.name} variant="muted" className="font-normal">
                    {s.name} · {PRICING_TYPE_LABEL[s.pricingType]}
                    {s.unitLabel ? ` (${s.unitLabel})` : ""} · {durationText(s.durationMin)}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button onClick={apply} loading={isPending} className="w-full">
          إضافة {count} خدمة من قالب «{template.label}»
        </Button>
      </div>
    </Modal>
  );
}

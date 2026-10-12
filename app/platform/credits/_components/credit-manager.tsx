"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  topUpClinicUnitsAction,
  adjustClinicUnitsAction,
  setClinicLowUnitsThresholdAction,
} from "@/server/actions/platformCredits";
import { Button, type ButtonProps } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { unitsSchema, type UnitsValues } from "@/lib/validations/platform";

interface Props {
  clinicId: string;
  currentMarkup: number;
  currentLowUnitsThreshold: number;
}

type RunFn = (
  fn: () => Promise<{ ok: boolean; message?: string }>,
  okText: string
) => Promise<boolean>;

/**
 * Platform-admin controls for one clinic's AI allowance.
 *
 * UNITS are the only thing granted here — 1000 units buys the clinic 1000 agent
 * replies. There is deliberately no dollar top-up: the USD figures elsewhere on
 * this page are cost telemetry, not a balance anyone funds.
 *
 * Unit counts are sent as strings and parsed to integers server-side.
 */
export default function CreditManager({ clinicId, currentLowUnitsThreshold }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run: RunFn = (fn, okText) =>
    new Promise((resolve) =>
      start(async () => {
        setMsg(null);
        const res = await fn();
        if (res.ok) {
          setMsg({ ok: true, text: okText });
          router.refresh();
        } else {
          setMsg({ ok: false, text: res.message ?? "تعذّر تنفيذ العملية." });
        }
        resolve(res.ok);
      })
    );

  return (
    <div className="space-y-3">
      {/* Units — the clinic's meter. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <UnitsForm
          kind="positive"
          placeholder="إضافة وحدات"
          submitLabel="إضافة"
          variant="success"
          pending={pending}
          resetOnSuccess
          onSubmit={(units) =>
            run(() => topUpClinicUnitsAction({ clinicId, units }), "تمت إضافة الوحدات.")
          }
        />

        <UnitsForm
          kind="signed"
          placeholder="تعديل وحدات ±"
          submitLabel="تعديل"
          variant="outline"
          pending={pending}
          resetOnSuccess
          onSubmit={(units) =>
            run(() => adjustClinicUnitsAction({ clinicId, units }), "تم تعديل الوحدات.")
          }
        />

        <UnitsForm
          kind="nonNegative"
          placeholder="حد التنبيه (وحدات)"
          submitLabel="حفظ"
          defaultValue={String(currentLowUnitsThreshold)}
          pending={pending}
          onSubmit={(units) =>
            run(
              () => setClinicLowUnitsThresholdAction({ clinicId, threshold: units }),
              "تم تحديث حد التنبيه."
            )
          }
        />
      </div>

      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}

/** One number + button row; its own small form, so Enter submits it too. */
function UnitsForm({
  kind,
  placeholder,
  submitLabel,
  variant,
  defaultValue = "",
  pending,
  resetOnSuccess = false,
  onSubmit,
}: {
  kind: Parameters<typeof unitsSchema>[0];
  placeholder: string;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  defaultValue?: string;
  pending: boolean;
  resetOnSuccess?: boolean;
  onSubmit: (units: string) => Promise<boolean>;
}) {
  const form = useForm<UnitsValues>({
    resolver: zodResolver(unitsSchema(kind)),
    defaultValues: { units: defaultValue },
  });

  const handleSubmit = form.handleSubmit(async ({ units }) => {
    const ok = await onSubmit(units);
    if (ok && resetOnSuccess) form.reset({ units: "" });
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="flex items-start gap-2">
      <FormField
        control={form.control}
        name="units"
        placeholder={placeholder}
        dir="ltr"
        inputMode="numeric"
        className="flex-1"
      />
      <Button type="submit" variant={variant} disabled={pending} className="shrink-0">
        {submitLabel}
      </Button>
    </form>
  );
}

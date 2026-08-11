"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  topUpClinicAction,
  adjustClinicBalanceAction,
  setClinicMarkupAction,
} from "@/server/actions/platformCredits";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

interface Props {
  clinicId: string;
  currentMarkup: number;
}

/** Platform-admin controls for one clinic's AI credit: top up, adjust, set markup.
 *  Amounts are sent as strings and parsed to Decimal server-side — never floats. */
export default function CreditManager({ clinicId, currentMarkup }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [topUp, setTopUp] = useState("");
  const [adjust, setAdjust] = useState("");
  const [markup, setMarkup] = useState(String(currentMarkup));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text: okText });
        setTopUp("");
        setAdjust("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.message ?? "تعذّر تنفيذ العملية." });
      }
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Top up */}
        <div className="flex gap-2">
          <input
            value={topUp}
            onChange={(e) => setTopUp(e.target.value)}
            placeholder="إضافة رصيد $"
            className={inputCls}
            dir="ltr"
            inputMode="decimal"
          />
          <button
            disabled={pending || !topUp.trim()}
            onClick={() =>
              run(
                () => topUpClinicAction({ clinicId, amount: topUp }),
                "تمت إضافة الرصيد.",
              )
            }
            className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            إضافة
          </button>
        </div>

        {/* Adjust (signed) */}
        <div className="flex gap-2">
          <input
            value={adjust}
            onChange={(e) => setAdjust(e.target.value)}
            placeholder="تعديل ± $"
            className={inputCls}
            dir="ltr"
            inputMode="decimal"
          />
          <button
            disabled={pending || !adjust.trim()}
            onClick={() =>
              run(
                () => adjustClinicBalanceAction({ clinicId, amount: adjust }),
                "تم تعديل الرصيد.",
              )
            }
            className="flex-shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            تعديل
          </button>
        </div>

        {/* Markup */}
        <div className="flex gap-2">
          <input
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            placeholder="مضاعف التسعير"
            className={inputCls}
            dir="ltr"
            inputMode="decimal"
          />
          <button
            disabled={pending || !markup.trim()}
            onClick={() =>
              run(
                () => setClinicMarkupAction({ clinicId, markup }),
                "تم تحديث المضاعف.",
              )
            }
            className="flex-shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

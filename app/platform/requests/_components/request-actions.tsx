"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveClinicRequest, rejectClinicRequest } from "@/server/actions/clinics";

export default function RequestActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && typeof res === "object" && "error" in res) {
        const e = (res as { error?: string }).error;
        if (e) {
          setError(e);
          return;
        }
      }
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => run(() => approveClinicRequest(requestId))}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        موافقة
      </button>
      <button
        disabled={pending}
        onClick={() => run(() => rejectClinicRequest(requestId))}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        رفض
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

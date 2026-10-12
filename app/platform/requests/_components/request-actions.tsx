"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveClinicRequest, rejectClinicRequest } from "@/server/actions/clinics";
import { Button } from "@/components/ui/button";

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
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => approveClinicRequest(requestId))}
      >
        موافقة
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rejectClinicRequest(requestId))}
      >
        رفض
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

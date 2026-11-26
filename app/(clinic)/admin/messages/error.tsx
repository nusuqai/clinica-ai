"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * If the inbox crashes on the client, React unmounts it, and without this
 * boundary the list and thread just vanished. Show a way back instead.
 */
export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[inbox] crashed:", error);
  }, [error]);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
      dir="rtl"
    >
      <p className="text-sm text-muted-foreground">تعذّر عرض الرسائل. حاول مرة أخرى.</p>
      <Button onClick={() => reset()}>إعادة المحاولة</Button>
    </div>
  );
}

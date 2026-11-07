"use client";

import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** A row in a popover menu (we have no dropdown primitive — Popover + these). */
export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  destructive = false,
  active = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start font-sans text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive
          ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          : "text-foreground hover:bg-muted",
        active && "bg-primary/10 text-primary"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}

export type Visibility = "PRIVATE" | "CLINIC";

/** "Only me" / "The whole team" segmented switch for reminders and notes. */
export function VisibilityToggle({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  const option = (v: Visibility, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors [&_svg]:size-3.5",
        value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-xl bg-muted p-1">
      {option("PRIVATE", <Lock />, "لي فقط")}
      {option("CLINIC", <Users />, "لكل الفريق")}
    </div>
  );
}

/** Short Arabic date-time for reminders/notes. */
export function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("ar-EG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formats an audio length as m:ss. */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

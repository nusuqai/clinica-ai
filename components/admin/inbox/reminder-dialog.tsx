"use client";

import { useEffect, useState, useTransition } from "react";
import { AlarmClock, Check, Loader2, Lock, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { completeReminder, createReminder, deleteReminder } from "@/server/actions/inbox";
import type { ReminderItem } from "@/server/services/inbox";
import { VisibilityToggle, formatDateTime, type Visibility } from "./shared";

/** `yyyy-MM-ddTHH:mm` in the browser's local time, for datetime-local inputs. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function presets(): { label: string; at: Date }[] {
  const now = new Date();
  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(now.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const nextWeek = new Date(tomorrow9);
  nextWeek.setDate(tomorrow9.getDate() + 6);
  return [
    { label: "بعد ساعة", at: inHours(1) },
    { label: "بعد 3 ساعات", at: inHours(3) },
    { label: "غدًا 9 ص", at: tomorrow9 },
    { label: "بعد أسبوع", at: nextWeek },
  ];
}

/**
 * "Remind me to check back on this conversation" — a time, an optional note
 * ("why"), and who sees it: only me, or the whole team. Lists the open reminders
 * on the conversation with done / delete.
 */
export function ReminderDialog({
  open,
  onOpenChange,
  conversationId,
  reminders,
  currentUserId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  reminders: ReminderItem[];
  currentUserId: string;
  /** Something changed — reload the conversation + re-arm timers. */
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");

  useEffect(() => {
    if (open) {
      setDueAt(toLocalInput(presets()[2].at));
      setNote("");
      setVisibility("PRIVATE");
    }
  }, [open]);

  const handleCreate = () => {
    const at = new Date(dueAt);
    if (Number.isNaN(at.getTime())) return;
    startTransition(async () => {
      const res = await createReminder({
        conversationId,
        dueAt: at.toISOString(),
        note,
        visibility,
      });
      if (!res.ok) {
        toast.error(res.error === "forbidden" ? "غير مسموح" : res.error);
        return;
      }
      toast.success(`سيتم تذكيرك ${formatDateTime(at)}`);
      onChanged();
      onOpenChange(false);
    });
  };

  const act = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error("تعذّر تنفيذ الإجراء");
      onChanged();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <AlarmClock className="h-4 w-4" />
            تذكير بمراجعة المحادثة
          </DialogTitle>
          <DialogDescription>
            عند حلول الموعد ستظهر المحادثة أعلى القائمة مع تنبيه.
          </DialogDescription>
        </DialogHeader>

        {reminders.length > 0 && (
          <ul className="space-y-1.5">
            {reminders.map((r) => {
              const due = new Date(r.dueAt).getTime() <= Date.now();
              const mine = r.createdById === currentUserId;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-3 py-2",
                    due ? "border-amber-300 bg-amber-50 dark:bg-amber-950/40" : "border-border"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-sans text-xs font-medium text-foreground">
                      {r.visibility === "CLINIC" ? (
                        <Users className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                      {formatDateTime(r.dueAt)}
                      {due && <span className="text-amber-700">· مستحق</span>}
                    </p>
                    {r.note && (
                      <p className="mt-0.5 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                        {r.note}
                      </p>
                    )}
                    {!mine && (
                      <p className="mt-0.5 font-sans text-[10px] text-muted-foreground/70">
                        بواسطة {r.createdByName}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="تمت المراجعة"
                    onClick={() => act(() => completeReminder(r.id))}
                    disabled={pending}
                    className="text-emerald-600 hover:text-emerald-700"
                  >
                    <Check />
                  </Button>
                  {mine && (
                    <Button
                      size="icon-sm"
                      variant="ghost-destructive"
                      aria-label="حذف"
                      onClick={() => act(() => deleteReminder(r.id))}
                      disabled={pending}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {presets().map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDueAt(toLocalInput(p.at))}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            dir="ltr"
          />
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="لماذا تريد التذكير؟ (اختياري) — مثال: الاتصال لتأكيد العرض"
            rows={2}
            maxLength={500}
          />
          <VisibilityToggle value={visibility} onChange={setVisibility} />
          <p className="font-sans text-[11px] text-muted-foreground">
            {visibility === "PRIVATE"
              ? "يظهر التذكير لك وحدك."
              : "يرى كل الفريق التذكير أعلى القائمة، والتنبيه يصلك أنت."}
          </p>
          <Button onClick={handleCreate} disabled={!dueAt || pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : <AlarmClock />}
            حفظ التذكير
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

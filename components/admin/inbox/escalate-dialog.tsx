"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Send, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { escalateToColleague } from "@/server/actions/inbox";
import type { InboxTeammate } from "@/server/services/inbox";

/** Picks one teammate from the list (shared by escalate + assign). */
export function TeammatePicker({
  teammates,
  value,
  onChange,
  excludeId,
}: {
  teammates: InboxTeammate[];
  value: string | null;
  onChange: (id: string) => void;
  excludeId?: string;
}) {
  const list = teammates.filter((t) => t.id !== excludeId);
  if (list.length === 0) {
    return (
      <p className="py-3 text-center font-sans text-xs text-muted-foreground">
        لا يوجد أعضاء آخرون لديهم صلاحية الرسائل.
      </p>
    );
  }
  return (
    <ul className="max-h-52 space-y-0.5 overflow-y-auto">
      {list.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start hover:bg-muted",
              value === t.id && "bg-primary/10"
            )}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 font-sans text-[11px] font-bold text-primary">
                {t.fullName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate font-sans text-sm">{t.fullName}</span>
            {value === t.id && <Check className="h-4 w-4 text-primary" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Escalate a message (or the whole conversation) to ONE colleague, with a note.
 * Only that colleague is notified (toast + sound) and sees it in their
 * "needs my response" filter until they reply / post a note / mark it done.
 */
export function EscalateDialog({
  open,
  onOpenChange,
  conversationId,
  message,
  teammates,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** The specific message being escalated, if any. */
  message: { id: string; snippet: string } | null;
  teammates: InboxTeammate[];
  currentUserId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setRecipientId(null);
      setNote("");
    }
  }, [open]);

  const handleSend = () => {
    if (!recipientId) return;
    startTransition(async () => {
      const res = await escalateToColleague({
        conversationId,
        messageId: message?.id ?? null,
        recipientId,
        note,
      });
      if (!res.ok) {
        toast.error(res.error === "forbidden" ? "غير مسموح" : res.error);
        return;
      }
      const name = teammates.find((t) => t.id === recipientId)?.fullName;
      toast.success(`تم التصعيد إلى ${name ?? "الزميل"}`);
      onDone();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <UserRoundPlus className="h-4 w-4" />
            تصعيد إلى زميل
          </DialogTitle>
          <DialogDescription>
            يصل التنبيه لهذا الزميل وحده، ويبقى في قائمة «بحاجة لردي» لديه حتى يتعامل معه.
          </DialogDescription>
        </DialogHeader>
        {message && (
          <div className="rounded-xl border-s-[3px] border-primary bg-muted/60 px-3 py-2 font-sans text-xs text-muted-foreground">
            <span className="line-clamp-3">{message.snippet || "رسالة"}</span>
          </div>
        )}
        <TeammatePicker
          teammates={teammates}
          value={recipientId}
          onChange={setRecipientId}
          excludeId={currentUserId}
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة للزميل — مثال: المريض يسأل عن سعر التقويم، أرجو المتابعة"
          rows={3}
          maxLength={1000}
        />
        <Button onClick={handleSend} disabled={!recipientId || pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          تصعيد
        </Button>
      </DialogContent>
    </Dialog>
  );
}

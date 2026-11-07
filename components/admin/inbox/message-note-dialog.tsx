"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addMessageNote } from "@/server/actions/inbox";
import { VisibilityToggle, type Visibility } from "./shared";

/** Adds a note to one message — private to the author, or shared with the team. */
export function MessageNoteDialog({
  open,
  onOpenChange,
  message,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: { id: string; snippet: string } | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");

  useEffect(() => {
    if (open) {
      setContent("");
      setVisibility("PRIVATE");
    }
  }, [open]);

  const handleSave = () => {
    if (!message || !content.trim()) return;
    startTransition(async () => {
      const res = await addMessageNote({ messageId: message.id, content, visibility });
      if (!res.ok) {
        toast.error(res.error === "forbidden" ? "غير مسموح" : res.error);
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <StickyNote className="h-4 w-4" />
            ملاحظة على الرسالة
          </DialogTitle>
          <DialogDescription>لا تُرسل للعميل ولا يراها المساعد الذكي.</DialogDescription>
        </DialogHeader>
        {message && (
          <div className="rounded-xl border-s-[3px] border-amber-400 bg-muted/60 px-3 py-2 font-sans text-xs text-muted-foreground">
            <span className="line-clamp-3">{message.snippet || "رسالة"}</span>
          </div>
        )}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="اكتب ملاحظتك..."
          rows={3}
          maxLength={2000}
          autoFocus
        />
        <VisibilityToggle value={visibility} onChange={setVisibility} />
        <Button onClick={handleSave} disabled={!content.trim() || pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : <StickyNote />}
          حفظ الملاحظة
        </Button>
      </DialogContent>
    </Dialog>
  );
}

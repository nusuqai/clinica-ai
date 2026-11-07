"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { LABEL_COLOR_KEYS, LABEL_DOT, labelClass, type LabelColor } from "@/lib/inbox-labels";
import {
  createLabel,
  deleteLabel,
  setConversationLabels,
  updateLabel,
} from "@/server/actions/inbox";
import type { InboxLabelItem } from "@/server/services/inbox";

/** A personal label chip. */
export function LabelChip({ label, className }: { label: InboxLabelItem; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[110px] items-center truncate rounded-full border px-1.5 py-px font-sans text-[10px] font-medium leading-4",
        labelClass(label.color),
        className
      )}
    >
      {label.name}
    </span>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: LabelColor;
  onChange: (c: LabelColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value === c}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
            LABEL_DOT[c],
            value === c && "ring-2 ring-foreground/60"
          )}
        >
          {value === c && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

/**
 * Tag a conversation with the viewer's personal labels, and manage (create,
 * rename, recolour, delete) those labels. Colleagues never see them.
 */
export function LabelsDialog({
  open,
  onOpenChange,
  conversationId,
  labels,
  selectedIds,
  onLabelsChange,
  onSelectedChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  labels: InboxLabelItem[];
  selectedIds: string[];
  /** The viewer's label set changed (created / edited / deleted). */
  onLabelsChange: (labels: InboxLabelItem[]) => void;
  /** The conversation's labels changed. */
  onSelectedChange: (ids: string[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<LabelColor>("blue");
  const [editing, setEditing] = useState<{ id: string; name: string; color: LabelColor } | null>(
    null
  );

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    const prev = selectedIds;
    onSelectedChange(next);
    startTransition(async () => {
      const res = await setConversationLabels(conversationId, next);
      if (!res.ok) {
        onSelectedChange(prev);
        toast.error("تعذّر حفظ التصنيفات");
      }
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createLabel(name, newColor);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onLabelsChange([...labels, res.data]);
      setNewName("");
      // Most people create a label in order to use it right away.
      const next = [...selectedIds, res.data.id];
      onSelectedChange(next);
      await setConversationLabels(conversationId, next);
    });
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    const { id, name, color } = editing;
    startTransition(async () => {
      const res = await updateLabel(id, name, color);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onLabelsChange(labels.map((l) => (l.id === id ? { ...l, name: name.trim(), color } : l)));
      setEditing(null);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteLabel(id);
      if (!res.ok) {
        toast.error("تعذّر حذف التصنيف");
        return;
      }
      onLabelsChange(labels.filter((l) => l.id !== id));
      onSelectedChange(selectedIds.filter((x) => x !== id));
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Tag className="h-4 w-4" />
            التصنيفات
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <DialogDescription>تصنيفاتك الخاصة — لا يراها باقي الفريق.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1">
          {labels.length === 0 && (
            <li className="py-3 text-center font-sans text-xs text-muted-foreground">
              لا توجد تصنيفات بعد — أنشئ أول تصنيف بالأسفل.
            </li>
          )}
          {labels.map((label) =>
            editing?.id === label.id ? (
              <li key={label.id} className="space-y-2 rounded-xl border border-border p-2.5">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  maxLength={40}
                  autoFocus
                />
                <ColorPicker
                  value={editing.color}
                  onChange={(color) => setEditing({ ...editing, color })}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    إلغاء
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={!editing.name.trim()}>
                    حفظ
                  </Button>
                </div>
              </li>
            ) : (
              <li key={label.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(label.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-start hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selectedIds.includes(label.id)
                        ? "border-primary bg-primary text-white"
                        : "border-border"
                    )}
                  >
                    {selectedIds.includes(label.id) && <Check className="h-3 w-3" />}
                  </span>
                  <LabelChip label={label} className="max-w-[220px] text-xs" />
                </button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="تعديل"
                  onClick={() =>
                    setEditing({
                      id: label.id,
                      name: label.name,
                      color: (LABEL_COLOR_KEYS as string[]).includes(label.color)
                        ? (label.color as LabelColor)
                        : "gray",
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost-destructive"
                  aria-label="حذف"
                  onClick={() => handleDelete(label.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            )
          )}
        </ul>

        <div className="space-y-2.5 rounded-xl bg-muted/50 p-3">
          <p className="font-sans text-xs font-medium text-muted-foreground">تصنيف جديد</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="مثال: متابعة عرض، حجز مؤجل..."
              maxLength={40}
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || pending}>
              <Plus />
              إضافة
            </Button>
          </div>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

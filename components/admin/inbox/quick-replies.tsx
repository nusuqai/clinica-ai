"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ClipboardCopy,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  createQuickReply,
  createQuickReplyMediaUpload,
  deleteQuickReply,
  fetchQuickReplies,
  updateQuickReply,
} from "@/server/actions/quick-replies";
import type { QuickReplyItem } from "@/server/services/inbox";

const mediaUrl = (id: string, version: Date | string) =>
  `/api/admin/quick-replies/${id}/media?v=${new Date(version).getTime()}`;

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Downloads a quick reply's image as a File, to stage it in the composer. */
export async function quickReplyFile(item: QuickReplyItem): Promise<File | null> {
  try {
    const res = await fetch(mediaUrl(item.id, item.updatedAt));
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (item.mediaMimeType ?? "image/jpeg").split("/")[1]?.split(";")[0] ?? "jpg";
    return new File([blob], `${item.title}.${ext}`, { type: item.mediaMimeType ?? blob.type });
  } catch {
    return null;
  }
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function QuickReplyEditor({
  open,
  onOpenChange,
  item,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  item: QuickReplyItem | null;
  categories: string[];
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setCategory(item?.category ?? "");
    setContent(item?.content ?? "");
    setFile(null);
    setRemoveMedia(false);
  }, [open, item]);

  const existingImage = item?.hasMedia && !removeMedia && !file;

  const handleSave = () => {
    startTransition(async () => {
      let media: { path: string; mimeType: string; width?: number; height?: number } | null = null;
      if (file) {
        const up = await createQuickReplyMediaUpload(file.type);
        if (!up.ok) {
          toast.error(up.error === "forbidden" ? "غير مسموح" : up.error);
          return;
        }
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(up.data.bucket)
          .uploadToSignedUrl(up.data.path, up.data.token, file, { contentType: file.type });
        if (error) {
          toast.error("تعذّر رفع الصورة");
          return;
        }
        const size = await readImageSize(file);
        media = {
          path: up.data.path,
          mimeType: file.type,
          width: size?.width,
          height: size?.height,
        };
      }
      const input = { title, content, category, media, removeMedia };
      const res = item ? await updateQuickReply(item.id, input) : await createQuickReply(input);
      if (!res.ok) {
        toast.error(res.error === "forbidden" ? "غير مسموح" : res.error);
        return;
      }
      toast.success(item ? "تم تحديث الرد" : "تمت إضافة الرد");
      onSaved();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {item ? "تعديل رد سريع" : "رد سريع جديد"}
          </DialogTitle>
          <DialogDescription>يظهر لكل الفريق داخل المحادثات.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="العنوان — مثال: عرض تنظيف الأسنان"
            maxLength={80}
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="التصنيف (اختياري) — مثال: عروض، مواعيد، عناوين"
            list="quick-reply-categories"
            maxLength={40}
          />
          <datalist id="quick-reply-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="نص الرسالة كما سيصل للعميل..."
            rows={6}
            maxLength={4000}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = "";
            }}
          />
          {preview || existingImage ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview ?? mediaUrl(item!.id, item!.updatedAt)}
                alt=""
                className="max-h-40 rounded-xl border border-border object-contain"
              />
              <Button
                size="icon-sm"
                variant="secondary"
                className="absolute end-1 top-1 rounded-full"
                aria-label="إزالة الصورة"
                onClick={() => {
                  if (file) setFile(null);
                  else setRemoveMedia(true);
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImageIcon />
              إرفاق صورة (اختياري)
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={pending || !title.trim() || (!content.trim() && !preview && !existingImage)}
            className="w-full"
          >
            {pending && <Loader2 className="animate-spin" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Panel (inside the conversation) ─────────────────────────────────────────

/**
 * The quick-replies pool, opened from the composer (button or typing "/").
 * Each reply can be COPIED into the composer (to tweak before sending) or SENT
 * straight away. Team members with `quick_replies` can add / edit / delete.
 */
export function QuickRepliesPanel({
  open,
  onOpenChange,
  initialQuery = "",
  disabled,
  onInsert,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text typed after "/" in the composer. */
  initialQuery?: string;
  /** Free-form sending is closed (WhatsApp 24h window). */
  disabled?: boolean;
  onInsert: (item: QuickReplyItem) => void;
  onSend: (item: QuickReplyItem) => void;
}) {
  const [items, setItems] = useState<QuickReplyItem[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; item: QuickReplyItem | null }>({
    open: false,
    item: null,
  });
  const [deleting, startDelete] = useTransition();

  const load = () => {
    fetchQuickReplies()
      .then((r) => {
        setItems(r.items);
        setCanManage(r.canManage);
      })
      .catch(() => setItems([]));
  };

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [initialQuery, open]);

  const categories = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category).filter((c): c is string => !!c))],
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        (!category || i.category === category) &&
        (!q || i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q))
    );
  }, [items, query, category]);

  const handleDelete = (id: string) =>
    startDelete(async () => {
      const res = await deleteQuickReply(id);
      if (!res.ok) toast.error("تعذّر الحذف");
      load();
    });

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="الردود السريعة"
            className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <Zap />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-md flex-col gap-2 rounded-2xl p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <p className="flex-1 font-heading text-sm font-semibold">الردود السريعة</p>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditor({ open: true, item: null })}
              >
                <Plus />
                إضافة
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الردود..."
              className="h-9 ps-8 text-sm"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {[null, ...categories].map((c) => (
                <button
                  key={c ?? "__all"}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 font-sans text-xs",
                    category === c
                      ? "border-primary bg-primary text-white"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {c ?? "الكل"}
                </button>
              ))}
            </div>
          )}
          <ul className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
            {items === null && (
              <li className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </li>
            )}
            {items !== null && filtered.length === 0 && (
              <li className="py-6 text-center font-sans text-xs text-muted-foreground">
                {items.length === 0
                  ? canManage
                    ? "لا توجد ردود بعد — أضف أول رد جاهز."
                    : "لا توجد ردود بعد — اطلب من المسؤول إضافتها."
                  : "لا توجد نتائج"}
              </li>
            )}
            {filtered.map((item) => (
              <li
                key={item.id}
                className="group rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex gap-2.5">
                  {item.hasMedia && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(item.id, item.updatedAt)}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-sans text-sm font-medium">
                      <span className="truncate">{item.title}</span>
                      {item.category && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 font-sans text-[10px] text-muted-foreground">
                          {item.category}
                        </span>
                      )}
                    </p>
                    <p className="line-clamp-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                      {item.content}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => {
                      onInsert(item);
                      onOpenChange(false);
                    }}
                    className="h-7 px-2.5"
                  >
                    <ClipboardCopy />
                    نسخ للتعديل
                  </Button>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      onSend(item);
                      onOpenChange(false);
                    }}
                    className="h-7 px-2.5"
                  >
                    <Send />
                    إرسال
                  </Button>
                  {canManage && (
                    <div className="ms-auto flex gap-0.5">
                      <Hint label="تعديل">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditor({ open: true, item })}
                          aria-label="تعديل"
                        >
                          <Pencil />
                        </Button>
                      </Hint>
                      <Hint label="حذف">
                        <Button
                          size="icon-sm"
                          variant="ghost-destructive"
                          disabled={deleting}
                          onClick={() => handleDelete(item.id)}
                          aria-label="حذف"
                        >
                          <Trash2 />
                        </Button>
                      </Hint>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="font-sans text-[10px] text-muted-foreground">
            اكتب «/» في خانة الرد لفتح الردود السريعة.
          </p>
        </PopoverContent>
      </Popover>
      <QuickReplyEditor
        open={editor.open}
        onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))}
        item={editor.item}
        categories={categories}
        onSaved={load}
      />
    </>
  );
}

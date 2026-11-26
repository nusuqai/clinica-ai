"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Progress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatFee } from "@/lib/currency";
import { parseChecklistText } from "@/lib/operations";
import {
  addChecklistItemsAction,
  addOperationPaymentAction,
  confirmOperationAttachmentAction,
  createOperationAttachmentUploadAction,
  deleteOperationAttachmentAction,
  removeChecklistItemAction,
  removeOperationPaymentAction,
  setChecklistItemDoneAction,
  updateOperationAction,
} from "@/server/actions/operations";
import type { OperationDetail } from "@/server/services/operations";

type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(fn: () => Promise<Result>, success?: string, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }
  return { run, isPending };
}

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export function OperationChecklist({ op, editable }: { op: OperationDetail; editable: boolean }) {
  const { run, isPending } = useRun();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const done = op.checklist.filter((c) => c.done).length;

  return (
    <SectionCard
      title="التجهيزات قبل العملية"
      action={
        editable && (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus />
            إضافة
          </Button>
        )
      }
    >
      {op.checklist.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <Progress value={(done / op.checklist.length) * 100} className="h-2 flex-1" />
          <span className="font-sans text-xs text-muted-foreground">
            {done}/{op.checklist.length}
          </span>
        </div>
      )}
      {op.checklist.length === 0 && !adding && (
        <p className="font-sans text-sm text-muted-foreground">
          لا توجد بنود — أضف التحاليل والأشعة والمطلوب من المريض قبل العملية.
        </p>
      )}
      <ul className="space-y-1">
        {op.checklist.map((c) => (
          <li
            key={c.id}
            className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/40"
          >
            <button
              type="button"
              disabled={!editable || isPending}
              onClick={() => run(() => setChecklistItemDoneAction(op.id, c.id, !c.done))}
              className="flex flex-1 items-center gap-2 text-start disabled:cursor-default"
              aria-label={c.done ? "إلغاء علامة تم" : "تعليم كتم"}
            >
              {c.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={`font-sans text-sm ${c.done ? "text-muted-foreground line-through" : "text-foreground"}`}
              >
                {c.label}
              </span>
            </button>
            {editable && (
              <Button
                variant="ghost-destructive"
                size="icon-sm"
                aria-label="حذف البند"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => run(() => removeChecklistItemAction(op.id, c.id))}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <div className="mt-3 space-y-2">
          <FormField
            type="textarea"
            rows={3}
            value={text}
            onValueChange={setText}
            placeholder={"بند في كل سطر، مثال:\nصورة دم كاملة\nرسم قلب"}
          />
          <Button
            size="sm"
            loading={isPending}
            disabled={parseChecklistText(text).length === 0}
            onClick={() =>
              run(
                () => addChecklistItemsAction(op.id, parseChecklistText(text)),
                undefined,
                () => {
                  setText("");
                  setAdding(false);
                }
              )
            }
          >
            حفظ البنود
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function OperationPayments({ op, editable }: { op: OperationDetail; editable: boolean }) {
  const { run, isPending } = useRun();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("كاش");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  return (
    <SectionCard
      title="التكلفة والدفعات"
      action={
        editable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAmount(op.remaining && op.remaining > 0 ? String(op.remaining) : "");
              setNote("");
              setOpen(true);
            }}
          >
            <Plus />
            تسجيل دفعة
          </Button>
        )
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[
          { label: "التكلفة", value: op.price != null ? formatFee(op.price) : "لم تُحدَّد" },
          { label: "المدفوع", value: formatFee(op.paid) },
          {
            label: "المتبقي",
            value: op.remaining != null ? formatFee(Math.max(0, op.remaining)) : "—",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/50 px-2 py-3">
            <p className="font-sans text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-sans text-sm font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>
      {op.payments.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">لا توجد دفعات مسجّلة.</p>
      ) : (
        <ul className="divide-y divide-border">
          {op.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="font-sans text-sm font-medium text-foreground">
                  {formatFee(p.amount)}
                  {p.method && (
                    <span className="ms-2 text-xs text-muted-foreground">{p.method}</span>
                  )}
                </p>
                <p className="font-sans text-xs text-muted-foreground">
                  {fmtDate(p.paidAt)}
                  {p.note && ` — ${p.note}`}
                </p>
              </div>
              {editable && (
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  aria-label="حذف الدفعة"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "حذف الدفعة؟",
                        description: `سيتم حذف دفعة ${formatFee(p.amount)} من سجل العملية.`,
                        confirmText: "حذف",
                        destructive: true,
                      })
                    )
                      run(() => removeOperationPaymentAction(op.id, p.id), "تم حذف الدفعة");
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="تسجيل دفعة">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              type="number"
              min={0}
              step="0.01"
              label="المبلغ *"
              value={amount}
              onValueChange={setAmount}
            />
            <FormField
              type="select"
              label="طريقة الدفع"
              options={["كاش", "فيزا", "تحويل بنكي", "محفظة إلكترونية", "تأمين"].map((m) => ({
                value: m,
                label: m,
              }))}
              value={method}
              onValueChange={setMethod}
            />
            <FormField type="date" label="التاريخ" value={paidAt} onValueChange={setPaidAt} />
            <FormField
              label="ملاحظة"
              value={note}
              onValueChange={setNote}
              placeholder="عربون، قسط…"
            />
          </div>
          <div className="flex gap-3">
            <Button
              className="flex-1"
              loading={isPending}
              disabled={!(Number(amount) > 0)}
              onClick={() =>
                run(
                  () =>
                    addOperationPaymentAction(op.id, {
                      amount: Number(amount),
                      method,
                      note,
                      paidAt: paidAt || null,
                    }),
                  "تم تسجيل الدفعة",
                  () => setOpen(false)
                )
              }
            >
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}

// ─── Instructions ─────────────────────────────────────────────────────────────

export function OperationInstructions({
  op,
  editable,
}: {
  op: OperationDetail;
  editable: boolean;
}) {
  const { run, isPending } = useRun();
  const [editing, setEditing] = useState(false);
  const [pre, setPre] = useState(op.preOpInstructions ?? "");
  const [post, setPost] = useState(op.postOpInstructions ?? "");

  return (
    <SectionCard
      title="تعليمات المريض"
      action={
        editable &&
        !editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPre(op.preOpInstructions ?? "");
              setPost(op.postOpInstructions ?? "");
              setEditing(true);
            }}
          >
            تعديل
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-3">
          <FormField
            type="textarea"
            rows={5}
            label="قبل العملية"
            value={pre}
            onValueChange={setPre}
            placeholder="الصيام، الأدوية التي تُوقف، ما يحضره معه…"
          />
          <FormField
            type="textarea"
            rows={5}
            label="بعد العملية"
            value={post}
            onValueChange={setPost}
            placeholder="العناية بالجرح، الأدوية، النشاط، موعد المتابعة…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={isPending}
              onClick={() =>
                run(
                  () =>
                    updateOperationAction(op.id, {
                      preOpInstructions: pre,
                      postOpInstructions: post,
                    }),
                  "تم حفظ التعليمات",
                  () => setEditing(false)
                )
              }
            >
              حفظ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { title: "قبل العملية", text: op.preOpInstructions },
            { title: "بعد العملية", text: op.postOpInstructions },
          ].map((s) => (
            <div key={s.title}>
              <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">{s.title}</p>
              <p className="whitespace-pre-wrap font-sans text-sm text-foreground">
                {s.text || <span className="text-muted-foreground">لا توجد</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Attachments ──────────────────────────────────────────────────────────────

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const MAX_SIZE = 25 * 1024 * 1024;

export function OperationAttachments({ op, editable }: { op: OperationDetail; editable: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_SIZE) return setError("حجم الملف يتجاوز 25 ميجابايت");
    setBusy(true);
    try {
      const mime = file.type || "application/octet-stream";
      const up = await createOperationAttachmentUploadAction(op.id, file.name, mime);
      if (!up.ok) return setError(up.error);
      const { error: upErr } = await createClient()
        .storage.from(up.bucket)
        .uploadToSignedUrl(up.path, up.token, file, { contentType: mime });
      if (upErr) return setError("تعذّر رفع الملف");
      const res = await confirmOperationAttachmentAction(op.id, {
        path: up.path,
        fileName: file.name,
        contentType: mime,
        size: file.size,
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="الملفات"
      action={
        editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onPick}
            />
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              رفع ملف
            </Button>
          </>
        )
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-3">
          {error}
        </Alert>
      )}
      {op.attachments.length === 0 ? (
        <p className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          نتائج التحاليل، الأشعة، الإقرار الموقّع…
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {op.attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <a
                href={`/api/operation-attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 font-sans text-sm text-foreground hover:text-primary"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.fileName}</span>
              </a>
              <div className="flex shrink-0 items-center gap-1">
                <span className="font-sans text-xs text-muted-foreground">
                  {a.uploadedByName} · {fmtDate(a.createdAt)}
                </span>
                <Button asChild variant="ghost" size="icon-sm" aria-label="تحميل">
                  <a href={`/api/operation-attachments/${a.id}`} target="_blank" rel="noreferrer">
                    <Download />
                  </a>
                </Button>
                {editable && (
                  <Button
                    variant="ghost-destructive"
                    size="icon-sm"
                    aria-label="حذف الملف"
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "حذف الملف؟",
                          description: a.fileName,
                          confirmText: "حذف",
                          destructive: true,
                        }))
                      )
                        return;
                      const res = await deleteOperationAttachmentAction(op.id, a.id);
                      if (!res.ok) toast.error(res.error);
                      router.refresh();
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

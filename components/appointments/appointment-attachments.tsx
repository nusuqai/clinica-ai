"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, FileText, Trash2, Upload, Download, Pencil, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAppointmentAttachmentUploadAction,
  confirmAppointmentAttachmentAction,
  deleteAppointmentAttachmentAction,
  renameAppointmentAttachmentAction,
} from "@/server/actions/attachments";
import type { AttachmentView } from "@/server/services/attachments";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

// The visit's files (lab results, x-rays, documents). Staff (doctor/admin) can
// upload and delete; a patient sees a read-only list. Bytes go DIRECTLY to the
// private bucket via a one-time signed URL (bypassing the server body limit),
// then a confirm action persists the row. Every object is read back through the
// authorized /api/attachments/<id> route (a 302 to a short-lived signed URL).

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,text/csv";

const MAX_SIZE = 25 * 1024 * 1024; // keep in sync with the server action

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ب`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** Keeps the original file's extension when the user drops it while renaming, so
 *  the download still opens in the right app. The server does this too — this is
 *  just so the input preview matches what will be saved. */
function withExtensionOf(next: string, original: string): string {
  const base = next.trim();
  if (!base) return base;
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot) : "";
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) return base + ext;
  return base;
}

interface Props {
  appointmentId: string;
  attachments: AttachmentView[];
  canManage: boolean;
}

export default function AppointmentAttachments({ appointmentId, attachments, canManage }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A picked file awaiting a name before it uploads — lets staff rename it first.
  const [pending, setPending] = useState<{ file: File; name: string } | null>(null);
  // Inline rename of an already-uploaded attachment.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setError(null);
    if (file.size > MAX_SIZE) {
      setError("حجم الملف يتجاوز الحد المسموح (25 ميجابايت)");
      return;
    }
    // Stage it with its original name; staff can edit before confirming the upload.
    setPending({ file, name: file.name });
  }

  async function doUpload() {
    if (!pending) return;
    const { file } = pending;
    const fileName = withExtensionOf(pending.name, file.name) || file.name;

    setError(null);
    setBusy(true);
    try {
      const mime = file.type || "application/octet-stream";
      const up = await createAppointmentAttachmentUploadAction(appointmentId, fileName, mime);
      if (!up.ok) {
        setError(up.error);
        return;
      }
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(up.bucket)
        .uploadToSignedUrl(up.path, up.token, file, { contentType: mime });
      if (upErr) {
        console.error("attachment upload failed:", upErr);
        setError("تعذّر رفع الملف");
        return;
      }
      const res = await confirmAppointmentAttachmentAction(appointmentId, {
        path: up.path,
        fileName,
        contentType: mime,
        size: file.size,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id: string, original: string) {
    const fileName = withExtensionOf(renameValue, original);
    if (!fileName || fileName === original) {
      setRenamingId(null);
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const res = await renameAppointmentAttachmentAction(id, fileName);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRenamingId(null);
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await deleteAppointmentAttachmentAction(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card asChild className="overflow-hidden">
      <section>
        <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
            <Paperclip className="h-4 w-4" />
            المرفقات
            <span className="font-sans text-xs font-normal text-muted-foreground">
              ({attachments.length})
            </span>
          </h2>
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={onPick}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                loading={busy}
                disabled={!!pending}
                className="text-sm"
              >
                {!busy && <Upload />}
                رفع ملف
              </Button>
            </>
          )}
        </header>

        <div className="p-5">
          {error && (
            <Alert variant="destructive" className="mb-3 block border-transparent px-3 py-2">
              {error}
            </Alert>
          )}

          {/* Rename-before-upload: name the picked file, then confirm the upload. */}
          {pending && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 font-sans text-xs font-medium text-primary">
                <Upload className="h-3.5 w-3.5" />
                اسم الملف قبل الرفع ({formatSize(pending.file.size)})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  autoFocus
                  value={pending.name}
                  onChange={(e) => setPending((p) => (p ? { ...p, name: e.target.value } : p))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doUpload();
                    if (e.key === "Escape") setPending(null);
                  }}
                  disabled={busy}
                  dir="auto"
                  className="min-w-0 flex-1"
                />
                <Button onClick={doUpload} loading={busy} disabled={!pending.name.trim()}>
                  {!busy && <Upload />}
                  رفع
                </Button>
                <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          {attachments.length === 0 ? (
            <p className="py-6 text-center font-sans text-sm text-muted-foreground">
              {canManage
                ? "لا توجد مرفقات بعد — ارفع نتائج التحاليل أو الأشعة أو المستندات"
                : "لا توجد مرفقات"}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {attachments.map((a) => {
                const href = `/api/attachments/${a.id}`;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
                      title="فتح المرفق"
                    >
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={href} alt={a.fileName} className="h-full w-full object-cover" />
                      ) : a.kind === "pdf" ? (
                        <FileText className="h-6 w-6 text-red-500" />
                      ) : (
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      {renamingId === a.id ? (
                        <Input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onRename(a.id, a.fileName);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          disabled={savingId === a.id}
                          dir="auto"
                          className="h-8 rounded-lg px-2 py-1"
                        />
                      ) : (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-sans text-sm font-medium text-foreground hover:underline"
                          title={a.fileName}
                        >
                          {a.fileName}
                        </a>
                      )}
                      <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                        {formatSize(a.size)} · {a.uploadedByName}
                      </p>
                    </div>
                    {renamingId === a.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRename(a.id, a.fileName)}
                          loading={savingId === a.id}
                          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600"
                          title="حفظ الاسم"
                        >
                          {savingId !== a.id && <Check />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRenamingId(null)}
                          disabled={savingId === a.id}
                          title="إلغاء"
                        >
                          <X />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild variant="ghost" size="icon" title="تنزيل">
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            <Download />
                          </a>
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setError(null);
                                setRenamingId(a.id);
                                setRenameValue(a.fileName);
                              }}
                              title="إعادة تسمية"
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost-destructive"
                              size="icon"
                              onClick={() => onDelete(a.id)}
                              loading={deletingId === a.id}
                              title="حذف"
                            >
                              {deletingId !== a.id && <Trash2 />}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </Card>
  );
}

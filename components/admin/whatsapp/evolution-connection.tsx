"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Building2,
  History,
  Link2,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  Star,
  Trash2,
  Unlink,
} from "lucide-react";
import type { EvolutionStatus } from "@/lib/evolution/config";
import type { HistorySyncState } from "@/server/services/evolutionHistorySync";
import type {
  DeleteNumberResult,
  EvolutionDisconnectResult,
  EvolutionStartResult,
  EvolutionStatusResult,
  EvolutionSyncResult,
  RemovalImpactResult,
  SetBranchResult,
  SetPrimaryResult,
} from "@/server/services/evolutionConnection";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** How often to refresh the QR / link state while a phone is being linked. */
const POLL_MS = 4000;

/**
 * What the number cards call, scoped to one clinic — the platform console binds
 * them to the clinic it manages, the clinic's own page passes its self-service
 * server actions (which use the caller's clinic). Every call names the number.
 */
export interface WhatsappNumberActions {
  /** `configId` null attaches a new number owned by `branchId` (null = clinic);
   *  otherwise re-links that number. */
  start: (
    configId: string | null,
    phone?: string,
    branchId?: string | null
  ) => Promise<EvolutionStartResult>;
  status: (configId: string) => Promise<EvolutionStatusResult>;
  /** Start the chat-history import: a fresh 90 days, or resume a stopped one. */
  sync: (configId: string, mode: "fresh" | "resume") => Promise<EvolutionSyncResult>;
  stopSync: (configId: string) => Promise<EvolutionSyncResult>;
  /** Log the phone out; the number's conversations stay in the inbox. */
  disconnect: (configId: string) => Promise<EvolutionDisconnectResult>;
  /** Delete the number for good, with the conversations that went through it. */
  remove: (configId: string) => Promise<DeleteNumberResult>;
  setPrimary: (configId: string) => Promise<SetPrimaryResult>;
  /** What deleting for good would delete — shown before confirming. */
  impact: (configId: string) => Promise<RemovalImpactResult>;
  /** Move a number to a branch, or make it clinic-level (null). */
  setBranch: (configId: string, branchId: string | null) => Promise<SetBranchResult>;
}

/** A possible owner of a number: a branch, or the clinic itself (id null). */
export interface NumberOwnerOption {
  id: string | null;
  name: string;
}

/** Select needs string values — the clinic-level owner travels as this. */
const CLINIC_OWNER = "__clinic__";

interface Props {
  actions: WhatsappNumberActions;
  /** The number's id, or null for a new number not linked yet. */
  configId: string | null;
  isPrimary: boolean;
  /** The number was unlinked: its conversations are kept, it can be re-linked
   *  or deleted for good. */
  unlinked: boolean;
  /** The number's phone as last recorded (shown until the live status loads). */
  knownPhone: string | null;
  /** A new number got its id (first QR generated). */
  onStarted: (configId: string) => void;
  /** The number is gone (deleted, or the card for a new one dismissed). */
  onRemoved: () => void;
  /** The number was unlinked or re-linked — reload the list. */
  onChanged: () => void;
  /** The number became the clinic's main number. */
  onPrimary: () => void;
  /** Owners this manager may give a number (clinic-level only if clinic-wide). */
  owners: NumberOwnerOption[];
  /** The number's current owner (branch id, or null = clinic-level). */
  ownerId: string | null;
  /** Clinic-wide managers only. */
  canSetPrimary: boolean;
}

/**
 * One WhatsApp Web (Evolution) number of a clinic: link its phone by scanning a
 * QR — or entering a pairing code — from WhatsApp → Linked devices, then sync
 * its chat history, make it the main number, or unlink it. An unlinked number
 * keeps its conversations and can be re-linked, or deleted for good.
 */
export default function EvolutionConnection({
  actions,
  configId,
  isPrimary,
  unlinked: unlinkedProp,
  knownPhone,
  onStarted,
  onRemoved,
  onChanged,
  onPrimary,
  owners,
  ownerId,
  canSetPrimary,
}: Props) {
  const configured = configId !== null;
  // A new number starts on the first owner offered (the clinic, when allowed).
  const [owner, setOwner] = useState<string | null>(configId ? ownerId : (owners[0]?.id ?? null));
  const ownerName = owners.find((o) => o.id === owner)?.name ?? "العيادة";
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sync, setSync] = useState<HistorySyncState | null>(null);
  // Flips immediately on unlink / re-link, before the refreshed list arrives.
  const [unlinked, setUnlinked] = useState(unlinkedProp);
  useEffect(() => setUnlinked(unlinkedProp), [unlinkedProp]);
  const shownPhone = status?.phone ?? knownPhone;

  // Parents pass inline callbacks; keep the poll from re-subscribing each render.
  const onRemovedRef = useRef(onRemoved);
  useEffect(() => {
    onRemovedRef.current = onRemoved;
  });

  const { status: readStatus } = actions;
  const refresh = useCallback(async () => {
    if (!configId) return;
    const res = await readStatus(configId);
    if (res.ok) {
      setStatus(res.status);
      setSync(res.sync);
      if (res.status.state === "open") setPairingCode(null);
    } else if (res.reason === "not_configured") {
      // Removed elsewhere (another tab, or merged into a re-link of the same phone).
      onRemovedRef.current();
    } else {
      setMessage({ ok: false, text: res.message ?? "تعذّر قراءة حالة الاتصال." });
    }
  }, [configId, readStatus]);

  // Poll while linking or while a history sync runs (its progress); otherwise
  // one read is enough.
  const syncRunning = sync?.status === "RUNNING";
  useEffect(() => {
    // An unlinked number has no live session to poll.
    if (!configured || unlinked) return;
    void refresh();
    if (status?.state === "open" && !syncRunning) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [configured, unlinked, refresh, status?.state, syncRunning]);

  const start = async () => {
    setBusy(true);
    setMessage(null);
    const res = await actions.start(configId, phone || undefined, configId ? undefined : owner);
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message ?? "تعذّر بدء الربط." });
      return;
    }
    setPairingCode(res.pairingCode);
    setStatus({ state: "connecting", qrDataUrl: res.qrDataUrl, phone: null, profileName: null });
    if (!configId) onStarted(res.configId);
    else if (unlinked) {
      // Re-linked: active again, its kept conversations are its own again.
      setUnlinked(false);
      onChanged();
    }
  };

  const [ownerBusy, setOwnerBusy] = useState(false);
  const changeOwner = async (value: string) => {
    const next = value === CLINIC_OWNER ? null : value;
    if (!configId) return setOwner(next); // applied when linking starts
    setOwnerBusy(true);
    setMessage(null);
    const res = await actions.setBranch(configId, next);
    setOwnerBusy(false);
    if (res.ok) {
      setOwner(next);
      setMessage({ ok: true, text: "تم نقل الرقم — محادثاته تتبعه." });
    } else {
      setMessage({ ok: false, text: res.error });
    }
  };

  const confirm = useConfirm();
  const label = shownPhone ? `+${shownPhone}` : "هذا الرقم";

  /** Log the phone out; its conversations stay. */
  const disconnect = async () => {
    if (!configId) return onRemoved();
    setMessage(null);
    // Set inside the dialog's confirm callback.
    const result: { outcome?: "unlinked" | "removed" } = {};
    const done = await confirm({
      title: "فصل الرقم",
      description: (
        <>
          سيتم تسجيل خروج <span dir="ltr">{label}</span> من واتساب ويب، ولن يستقبل أو يرسل رسائل بعد
          ذلك.
        </>
      ),
      warning:
        "المحادثات والرسائل التي مرّت عبره تبقى في صندوق الرسائل، مع الإشارة إلى أنها من رقم مفصول. " +
        "عند ربط نفس الرقم مرة أخرى تُزامَن الرسائل الناقصة فقط دون تكرار.",
      confirmText: "فصل الرقم",
      onConfirm: async () => {
        const res = await actions.disconnect(configId);
        if (!res.ok) return { error: res.error };
        result.outcome = res.outcome;
        return res;
      },
    });
    if (!done) return;
    if (result.outcome === "removed") return onRemoved();
    setUnlinked(true);
    setStatus(null);
    setPairingCode(null);
    setSync(null);
    onChanged();
  };

  /** Delete the number for good, with the conversations that went through it. */
  const [removing, setRemoving] = useState(false);
  const removeForGood = async () => {
    if (!configId) return onRemoved();
    setMessage(null);
    setRemoving(true);
    const impact = await actions.impact(configId);
    setRemoving(false);
    if (!impact.ok) {
      setMessage({ ok: false, text: impact.error });
      return;
    }
    const { messages, conversations, conversationsDeleted } = impact.impact;
    const done = await confirm({
      title: "حذف الرقم نهائيًا",
      description: (
        <>
          سيتم حذف <span dir="ltr">{label}</span> من العيادة مع{" "}
          <strong>كل الرسائل التي مرّت عبره</strong>.
        </>
      ),
      warning:
        messages > 0
          ? `سيُحذف نهائيًا ${messages} رسالة في ${conversations} محادثة` +
            (conversationsDeleted > 0
              ? `، وتُحذف ${conversationsDeleted} محادثة بالكامل لعدم بقاء رسائل فيها`
              : "") +
            ". رسائل المريض عبر أرقام العيادة الأخرى تبقى كما هي. لا يمكن التراجع."
          : "لا توجد رسائل عبر هذا الرقم. لا يمكن التراجع.",
      confirmText: "حذف الرقم ومحادثاته",
      confirmPhrase: messages > 0 ? "حذف" : undefined,
      onConfirm: async () => {
        const res = await actions.remove(configId);
        return res.ok ? res : { error: res.error };
      },
    });
    if (done) onRemoved();
  };

  const [primaryBusy, setPrimaryBusy] = useState(false);
  const makePrimary = async () => {
    if (!configId) return;
    setPrimaryBusy(true);
    setMessage(null);
    const res = await actions.setPrimary(configId);
    setPrimaryBusy(false);
    if (res.ok) onPrimary();
    else setMessage({ ok: false, text: res.error });
  };

  const [syncBusy, setSyncBusy] = useState(false);
  const startSync = async (mode: "fresh" | "resume") => {
    if (!configId) return;
    setSyncBusy(true);
    setMessage(null);
    const res = await actions.sync(configId, mode);
    setSyncBusy(false);
    if (res.ok) setSync(res.state);
    else setMessage({ ok: false, text: res.message ?? "تعذّر بدء المزامنة." });
  };
  const stopSync = async () => {
    if (!configId) return;
    setSyncBusy(true);
    setMessage(null);
    const res = await actions.stopSync(configId);
    setSyncBusy(false);
    if (res.ok) setSync(res.state);
    else setMessage({ ok: false, text: res.message ?? "تعذّر إيقاف المزامنة." });
  };

  const linked = !unlinked && status?.state === "open";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-sans text-sm font-semibold text-foreground" dir="ltr">
          {shownPhone ? `+${shownPhone}` : configured ? "رقم واتساب ويب" : "رقم جديد"}
        </span>
        {isPrimary && (
          <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            <Star className="h-3 w-3" />
            الرقم الرئيسي
          </span>
        )}
        {unlinked && (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Archive className="h-3 w-3" />
            مفصول — المحادثات محفوظة
          </span>
        )}
        {configured && !unlinked && status && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              linked ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
            }`}
          >
            {linked ? "مربوط" : status.state === "connecting" ? "بانتظار المسح" : "غير متصل"}
          </span>
        )}
        {linked && status?.profileName && (
          <span className="text-xs text-muted-foreground">{status.profileName}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <span>تابع لـ</span>
        {owners.length > 1 || (owners.length === 1 && owners[0].id !== owner) ? (
          <Select
            value={owner ?? CLINIC_OWNER}
            onValueChange={changeOwner}
            disabled={ownerBusy || busy}
          >
            <SelectTrigger className="h-7 w-auto min-w-36 gap-2 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem
                  key={o.id ?? CLINIC_OWNER}
                  value={o.id ?? CLINIC_OWNER}
                  className="text-xs"
                >
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-medium text-foreground">{ownerName}</span>
        )}
      </div>

      {unlinked && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          محادثات هذا الرقم ما زالت في صندوق الرسائل. أعد ربطه بنفس الهاتف لاستئناف العمل عليه
          ومزامنة الرسائل الناقصة فقط، أو احذفه نهائيًا مع محادثاته.
        </p>
      )}

      {configured && !unlinked && !linked && (status?.qrDataUrl || pairingCode) && (
        <div className="space-y-3">
          <p className="font-sans text-xs text-muted-foreground">
            على هاتف العيادة: واتساب ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز.
            {pairingCode && " أو اختر «الربط برقم الهاتف بدلًا من ذلك» وأدخل الكود."}
          </p>
          <div className="flex flex-wrap items-center gap-6">
            {status?.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.qrDataUrl}
                alt="WhatsApp QR"
                className="h-56 w-56 rounded-lg border border-border bg-white p-2"
              />
            )}
            {pairingCode && (
              <div>
                <p className="font-sans text-xs text-muted-foreground">كود الربط</p>
                <p className="font-mono text-2xl font-bold tracking-widest" dir="ltr">
                  {pairingCode.length === 8
                    ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`
                    : pairingCode}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!linked && (
        <div className="space-y-2">
          <Label className="text-xs font-normal text-muted-foreground">
            رقم الهاتف (اختياري — للحصول على كود ربط بدل رمز QR)
          </Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="مثال: 201001234567"
            dir="ltr"
            inputMode="tel"
            className="max-w-xs"
          />
        </div>
      )}

      {linked && (
        <HistorySyncPanel sync={sync} busy={syncBusy} onStart={startSync} onStop={stopSync} />
      )}

      {message && (
        <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!linked && (
          <Button type="button" onClick={start} loading={busy}>
            {!busy && (unlinked ? <Link2 /> : configured ? <RefreshCw /> : <Smartphone />)}
            {unlinked ? "إعادة الربط" : configured ? "إعادة توليد الرمز" : "ابدأ الربط"}
          </Button>
        )}
        {configured && !unlinked && !isPrimary && canSetPrimary && (
          <Button
            type="button"
            variant="outline"
            onClick={makePrimary}
            loading={primaryBusy}
            disabled={busy}
          >
            {!primaryBusy && <Star />}
            تعيين كرقم رئيسي
          </Button>
        )}
        {unlinked ? (
          <Button
            type="button"
            variant="outline"
            onClick={removeForGood}
            loading={removing}
            disabled={busy}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
          >
            {!removing && <Trash2 />}
            حذف نهائي
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={disconnect}
            disabled={busy}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
          >
            <Unlink />
            {configured ? "فصل الرقم" : "إلغاء"}
          </Button>
        )}
      </div>
    </Card>
  );
}

const dateFmt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" });

/**
 * The chat-history import: progress + stop while running; when a previous sync
 * stopped part-way, the choice to continue it or start the last 90 days over.
 */
function HistorySyncPanel({
  sync,
  busy,
  onStart,
  onStop,
}: {
  sync: HistorySyncState | null;
  busy: boolean;
  onStart: (mode: "fresh" | "resume") => void;
  onStop: () => void;
}) {
  const progress =
    sync && sync.totalChats > 0
      ? `${sync.doneChats} من ${sync.totalChats} محادثة · ${sync.messagesImported} رسالة`
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <History className="h-4 w-4 text-accent" />
        مزامنة المحادثات السابقة
      </p>

      {sync?.status === "RUNNING" ? (
        <>
          <p className="text-xs text-muted-foreground">
            {progress ? `جارٍ المزامنة: ${progress}` : "جارٍ تجهيز قائمة المحادثات من الهاتف…"}
          </p>
          {sync.totalChats > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round((sync.doneChats / sync.totalChats) * 100)}%` }}
              />
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onStop} loading={busy}>
            {!busy && <Pause />}
            إيقاف المزامنة
          </Button>
        </>
      ) : sync?.resumable ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {sync.status === "FAILED" ? "تعثّرت" : "توقفت"} المزامنة السابقة (بدأت{" "}
            {dateFmt.format(new Date(sync.startedAt))})
            {progress ? ` بعد ${progress}` : " قبل بدء نقل المحادثات"}. هل تريد متابعتها من حيث
            توقفت، أم بدء مزامنة جديدة لآخر 90 يوماً؟
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onStart("resume")} loading={busy}>
              {!busy && <Play />}
              متابعة المزامنة السابقة
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStart("fresh")}
              disabled={busy}
            >
              <RefreshCw />
              بدء مزامنة جديدة (آخر 90 يوماً)
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {sync?.status === "COMPLETED" && sync.finishedAt
              ? `اكتملت آخر مزامنة في ${dateFmt.format(new Date(sync.finishedAt))}${progress ? ` (${progress})` : ""}. `
              : ""}
            تنقل محادثات آخر 90 يوماً من هاتف العيادة إلى صندوق الرسائل، في الخلفية، ويمكنك إيقافها
            في أي وقت.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStart("fresh")}
            loading={busy}
          >
            {!busy && <History />}
            مزامنة المحادثات (آخر 90 يوماً)
          </Button>
        </>
      )}
    </div>
  );
}

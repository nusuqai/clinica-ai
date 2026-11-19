"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, QrCode, Star, TriangleAlert } from "lucide-react";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import EvolutionConnection, {
  type NumberOwnerOption,
  type WhatsappNumberActions,
} from "@/components/admin/whatsapp/evolution-connection";
import { Button } from "@/components/ui/button";

interface Entry {
  /** Stable React key — survives a new number getting its id. */
  key: string;
  configId: string | null;
}

interface Props {
  actions: WhatsappNumberActions;
  /** The numbers this manager may see (the official one is rendered elsewhere,
   *  but its `isPrimary` matters here). */
  numbers: WhatsappConfigStatus[];
  /** Owners this manager may give a number: the clinic itself (id null) only for
   *  clinic-wide managers, plus the branches they manage. */
  owners: NumberOwnerOption[];
  /** Clinic-wide managers only. */
  canSetPrimary: boolean;
}

/**
 * A clinic's WhatsApp Web numbers: one card per number plus "add a number". A
 * clinic can link several; a patient who writes to more than one of them still
 * has ONE conversation in the inbox, with each message tagged by its number.
 */
export default function WhatsappNumbers({ actions, numbers, owners, canSetPrimary }: Props) {
  const router = useRouter();
  const webNumbers = numbers.filter((n) => n.provider === "EVOLUTION");

  const [entries, setEntries] = useState<Entry[]>(() =>
    webNumbers.map((n) => ({ key: n.id, configId: n.id }))
  );
  // Keep the cards in step with the server: numbers that appeared (another tab,
  // a split-off old phone) join; numbers that are gone (deleted elsewhere, or
  // merged into a re-link of the same phone) leave. Unsaved new cards stay.
  useEffect(() => {
    setEntries((prev) => {
      const server = new Set(webNumbers.map((n) => n.id));
      const kept = prev.filter((e) => e.configId === null || server.has(e.configId));
      const known = new Set(kept.map((e) => e.configId));
      const added = webNumbers
        .filter((n) => !known.has(n.id))
        .map((n) => ({ key: n.id, configId: n.id }));
      return added.length || kept.length !== prev.length ? [...kept, ...added] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbers]);

  const serverPrimary = numbers.find((n) => n.isPrimary)?.id ?? null;
  const [primaryId, setPrimaryId] = useState(serverPrimary);
  useEffect(() => setPrimaryId(serverPrimary), [serverPrimary]);

  const addNumber = () =>
    setEntries((prev) => [...prev, { key: crypto.randomUUID(), configId: null }]);

  const started = useCallback(
    (key: string, configId: string) => {
      setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, configId } : e)));
      router.refresh();
    },
    [router]
  );
  const removed = useCallback(
    (key: string) => {
      setEntries((prev) => prev.filter((e) => e.key !== key));
      router.refresh();
    },
    [router]
  );
  const changed = useCallback(() => router.refresh(), [router]);
  const madePrimary = useCallback(
    (configId: string) => {
      setPrimaryId(configId);
      router.refresh();
    },
    [router]
  );

  const pendingNew = entries.some((e) => e.configId === null);

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <QrCode className="h-4 w-4 text-accent" />
        أرقام واتساب ويب (ربط غير رسمي)
      </h2>
      <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        اتصال غير رسمي عبر واتساب ويب: لا يحتاج حساب ميتا ولا قوالب، ويمكن المراسلة في أي وقت، لكن
        واتساب قد يحظر الرقم عند الإرسال الآلي الكثيف. استخدم أرقامًا مخصصة للعيادة.
      </p>

      {entries.map((e) => {
        const known = e.configId ? numbers.find((n) => n.id === e.configId) : undefined;
        return (
          <EvolutionConnection
            key={e.key}
            actions={actions}
            configId={e.configId}
            isPrimary={!!e.configId && e.configId === primaryId}
            unlinked={!!known?.unlinkedAt}
            knownPhone={known?.phone ?? null}
            owners={owners}
            ownerId={known?.branchId ?? null}
            canSetPrimary={canSetPrimary}
            onStarted={(id) => started(e.key, id)}
            onRemoved={() => removed(e.key)}
            onChanged={changed}
            onPrimary={() => e.configId && madePrimary(e.configId)}
          />
        );
      })}

      {!pendingNew && (
        <div className="space-y-1">
          <Button type="button" variant="outline" onClick={addNumber}>
            <Plus />
            {entries.length === 0 ? "ربط رقم واتساب" : "إضافة رقم آخر"}
          </Button>
          {entries.length > 0 && (
            <p className="text-xs text-muted-foreground">
              محادثات المريض عبر أكثر من رقم تُدمج في محادثة واحدة مرتبة بالوقت. فصل الرقم لا يحذف
              محادثاته.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Make main number" for a number rendered outside the list (the official one). */
export function MakePrimaryButton({
  configId,
  setPrimary,
}: {
  configId: string;
  setPrimary: WhatsappNumberActions["setPrimary"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await setPrimary(configId);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  };
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={run} loading={busy}>
        {!busy && <Star />}
        تعيين كرقم رئيسي
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

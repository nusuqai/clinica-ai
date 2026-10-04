"use client";

import { useState } from "react";
import { Loader2, Bot, AlertTriangle, Mic, Image as ImageIcon, Timer } from "lucide-react";
import {
  toggleClinicAiAction,
  toggleClinicVoiceReplyAction,
  toggleClinicImageAnalysisAction,
  toggleClinicImageAutoReplyAction,
  setClinicDebounceSecondsAction,
} from "@/server/actions/ai";

const DEBOUNCE_MIN = 5;
const DEBOUNCE_MAX = 120;

interface Props {
  initialEnabled: boolean;
  initialVoiceReplyEnabled: boolean;
  initialImageAnalysisEnabled: boolean;
  initialImageAutoReplyEnabled: boolean;
  /** Seconds of silence before the agent answers a burst of messages. */
  initialDebounceSeconds: number;
  /** Replies remaining on the clinic's meter. */
  unitBalance: number;
  lowUnits: boolean;
  /** The clinic still has units, so the agent can reply. */
  sufficient: boolean;
}

const fmtUnits = (n: number) => n.toLocaleString("ar-EG");

/**
 * Clinic-admin control for the AI agent: a global on/off switch plus a read-only
 * view of the unit meter. Units are granted by the platform, so they are shown
 * here but not editable.
 *
 * Units are the ONLY consumption figure a clinic sees — the underlying USD cost
 * of a reply is platform accounting and never surfaces here.
 */
export default function AiSettingsForm({
  initialEnabled,
  initialVoiceReplyEnabled,
  initialImageAnalysisEnabled,
  initialImageAutoReplyEnabled,
  initialDebounceSeconds,
  unitBalance,
  lowUnits,
  sufficient,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(initialVoiceReplyEnabled);
  const [voiceSaving, setVoiceSaving] = useState(false);

  const [imageEnabled, setImageEnabled] = useState(initialImageAnalysisEnabled);
  const [imageSaving, setImageSaving] = useState(false);

  const [imageAutoReply, setImageAutoReply] = useState(initialImageAutoReplyEnabled);
  const [imageAutoReplySaving, setImageAutoReplySaving] = useState(false);

  const [debounce, setDebounce] = useState(String(initialDebounceSeconds));
  const [debounceSaving, setDebounceSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setMessage(null);
    // Optimistic; revert on failure.
    setEnabled(next);
    const res = await toggleClinicAiAction(next);
    setSaving(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: next ? "تم تفعيل المساعد الذكي." : "تم إيقاف المساعد الذكي.",
      });
    } else {
      setEnabled(!next);
      setMessage({ ok: false, text: "تعذّر تحديث الإعداد." });
    }
  };

  const toggleVoice = async () => {
    const next = !voiceEnabled;
    setVoiceSaving(true);
    setMessage(null);
    setVoiceEnabled(next);
    const res = await toggleClinicVoiceReplyAction(next);
    setVoiceSaving(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: next ? "تم تفعيل الرد الصوتي." : "تم إيقاف الرد الصوتي.",
      });
    } else {
      setVoiceEnabled(!next);
      setMessage({ ok: false, text: "تعذّر تحديث الإعداد." });
    }
  };

  const toggleImage = async () => {
    const next = !imageEnabled;
    setImageSaving(true);
    setMessage(null);
    setImageEnabled(next);
    const res = await toggleClinicImageAnalysisAction(next);
    setImageSaving(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: next ? "تم تفعيل تحليل الصور." : "تم إيقاف تحليل الصور.",
      });
    } else {
      setImageEnabled(!next);
      setMessage({ ok: false, text: "تعذّر تحديث الإعداد." });
    }
  };

  const toggleImageAutoReply = async () => {
    const next = !imageAutoReply;
    setImageAutoReplySaving(true);
    setMessage(null);
    setImageAutoReply(next);
    const res = await toggleClinicImageAutoReplyAction(next);
    setImageAutoReplySaving(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: next
          ? "سيرد المساعد على الصور تلقائياً."
          : "سيتم استخراج نص الصور وتحويلها للفريق دون رد آلي.",
      });
    } else {
      setImageAutoReply(!next);
      setMessage({ ok: false, text: "تعذّر تحديث الإعداد." });
    }
  };

  const saveDebounce = async () => {
    const n = Number(debounce);
    setDebounceSaving(true);
    setMessage(null);
    const res = await setClinicDebounceSecondsAction(n);
    setDebounceSaving(false);
    if (res.ok) {
      setDebounce(String(res.seconds));
      setMessage({ ok: true, text: `تم ضبط مهلة التجميع على ${res.seconds} ثانية.` });
    } else {
      setMessage({
        ok: false,
        text: res.message ?? "تعذّر تحديث الإعداد.",
      });
    }
  };

  return (
    <div className="space-y-4">
      {!sufficient && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            نفدت وحدات المساعد الذكي — لن يرد المساعد على العملاء حتى تتم إضافة وحدات جديدة. سيتم
            تحويل رسائل العملاء إلى فريق العيادة.
          </p>
        </div>
      )}
      {sufficient && lowUnits && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            وحدات المساعد الذكي على وشك النفاد ({fmtUnits(unitBalance)} وحدة متبقية). يُنصح بالتواصل
            مع المنصة لإضافة وحدات.
          </p>
        </div>
      )}

      {/* Global toggle */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-sans font-semibold text-foreground">الرد الآلي بالمساعد الذكي</p>
              <p className="font-sans text-sm text-muted-foreground">
                عند التفعيل، يرد المساعد تلقائياً على جميع محادثات العملاء في العيادة.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            {saving ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "-translate-x-6" : "-translate-x-1"
                }`}
              />
            )}
          </button>
        </div>
        {message && (
          <p className={`mt-3 text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Voice reply toggle */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <p className="font-sans font-semibold text-foreground">الرد الصوتي</p>
              <p className="font-sans text-sm text-muted-foreground">
                عند التفعيل، يرد المساعد برسالة صوتية عندما يرسل العميل رسالة صوتية. تُحتسب تكلفة
                إضافية للتحويل الصوتي.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={voiceEnabled}
            onClick={toggleVoice}
            disabled={voiceSaving || !enabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              voiceEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            {voiceSaving ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  voiceEnabled ? "-translate-x-6" : "-translate-x-1"
                }`}
              />
            )}
          </button>
        </div>
      </div>

      {/* Image analysis toggle */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-sans font-semibold text-foreground">تحليل الصور</p>
              <p className="font-sans text-sm text-muted-foreground">
                عند التفعيل، يقرأ المساعد الصورة التي يرسلها العميل ويرد بناءً عليها. عند الإيقاف
                تُحفظ الصورة وتُحوَّل إلى فريق العيادة. تُحتسب تكلفة إضافية لتحليل الصورة.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={imageEnabled}
            onClick={toggleImage}
            disabled={imageSaving || !enabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              imageEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            {imageSaving ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  imageEnabled ? "-translate-x-6" : "-translate-x-1"
                }`}
              />
            )}
          </button>
        </div>

        {/* Sub-control: respond vs. extract-only. Only meaningful when analysis is on. */}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border ps-14 pt-4">
          <div>
            <p className="font-sans text-sm font-semibold text-foreground">الرد الآلي على الصور</p>
            <p className="font-sans text-xs text-muted-foreground">
              عند التفعيل، يرد المساعد على الصورة تلقائياً. عند الإيقاف، يُستخرج نص الصورة (مثل
              الروشتات صعبة القراءة) ويُحفظ لفريق الاستقبال مع تحويل المحادثة لموظف — دون رد آلي.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={imageAutoReply}
            onClick={toggleImageAutoReply}
            disabled={imageAutoReplySaving || !enabled || !imageEnabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              imageAutoReply ? "bg-primary" : "bg-muted"
            }`}
          >
            {imageAutoReplySaving ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  imageAutoReply ? "-translate-x-6" : "-translate-x-1"
                }`}
              />
            )}
          </button>
        </div>
      </div>

      {/* Message debounce window */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Timer className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-sans font-semibold text-foreground">مهلة تجميع الرسائل</p>
            <p className="font-sans text-sm text-muted-foreground">
              مدة الانتظار بعد آخر رسالة من العميل قبل أن يرد المساعد — تتيح له إنهاء كتابة رسائله
              المتتابعة فيرد عليها جميعاً مرة واحدة. ({DEBOUNCE_MIN}–{DEBOUNCE_MAX} ثانية)
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={DEBOUNCE_MIN}
                max={DEBOUNCE_MAX}
                value={debounce}
                onChange={(e) => setDebounce(e.target.value)}
                disabled={debounceSaving}
                className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">ثانية</span>
              <button
                onClick={saveDebounce}
                disabled={debounceSaving || debounce === ""}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {debounceSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                حفظ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unit meter (read-only) */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <p className="font-sans text-sm font-semibold text-foreground">رصيد الوحدات</p>
        <div className="flex items-end justify-between">
          <div>
            <p
              className={`font-heading text-3xl font-bold ${
                !sufficient ? "text-red-600" : lowUnits ? "text-amber-600" : "text-foreground"
              }`}
            >
              {fmtUnits(unitBalance)}{" "}
              <span className="font-sans text-base font-normal text-muted-foreground">وحدة</span>
            </p>
            <p className="mt-1 font-sans text-xs text-muted-foreground">
              كل رد يرسله المساعد الذكي يخصم وحدة واحدة. ردود فريق العيادة اليدوية لا تُخصم منها
              شيء.
            </p>
          </div>
        </div>
        <p className="border-t border-border pt-3 font-sans text-xs text-muted-foreground">
          تتم إضافة الوحدات من قِبل المنصة. للاستفسار أو إضافة وحدات، تواصل مع فريق المنصة.
        </p>
      </div>
    </div>
  );
}

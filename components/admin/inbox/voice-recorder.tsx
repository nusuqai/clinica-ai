"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type Recorder from "opus-recorder";
import { Button } from "@/components/ui/button";
import { formatDuration } from "./shared";

/** Hard stop so a forgotten recording can't grow without bound. */
const MAX_SECONDS = 5 * 60;
const ENCODER_PATH = "/vendor/opus-recorder/encoderWorker.min.js";

/**
 * Records a staff voice note as OGG/Opus (WhatsApp's voice-note format) right in
 * the browser — no server conversion. Idle it's a mic button; while recording it
 * becomes a full-width bar (timer, cancel, send) and the parent hides the rest of
 * the composer via `onActiveChange`.
 */
export function VoiceRecorder({
  disabled,
  onRecorded,
  onActiveChange,
}: {
  disabled?: boolean;
  onRecorded: (file: File, durationSec: number) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const sendOnStopRef = useRef(false);
  const startedAtRef = useRef(0);

  useEffect(() => onActiveChange(state !== "idle"), [state, onActiveChange]);

  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) finish(true);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Release the mic if the component goes away mid-recording.
  useEffect(
    () => () => {
      sendOnStopRef.current = false;
      recorderRef.current?.stop().catch(() => {});
    },
    []
  );

  const start = async () => {
    setState("starting");
    try {
      const { default: RecorderCtor } = await import("opus-recorder");
      if (!RecorderCtor.isRecordingSupported()) {
        toast.error("المتصفح لا يدعم تسجيل الصوت");
        setState("idle");
        return;
      }
      const rec = new RecorderCtor({
        encoderPath: ENCODER_PATH,
        encoderApplication: 2048, // voice
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        streamPages: false,
        mediaTrackConstraints: { echoCancellation: true, noiseSuppression: true },
      });
      rec.ondataavailable = (data) => {
        if (!sendOnStopRef.current) return;
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const file = new File([new Uint8Array(data)], `voice-${Date.now()}.ogg`, {
          type: "audio/ogg",
        });
        onRecorded(file, duration);
      };
      recorderRef.current = rec;
      await rec.start();
      startedAtRef.current = Date.now();
      setSeconds(0);
      setState("recording");
    } catch (err) {
      console.error("[voice] could not start recording:", err);
      toast.error("تعذّر الوصول إلى الميكروفون — تحقق من إذن المتصفح");
      recorderRef.current = null;
      setState("idle");
    }
  };

  const finish = (send: boolean) => {
    const rec = recorderRef.current;
    if (!rec) return;
    // Elapsed from the ref, not state: the auto-stop interval holds a stale closure.
    sendOnStopRef.current = send && Date.now() - startedAtRef.current >= 1000;
    recorderRef.current = null;
    setState("idle");
    rec.stop().catch((err) => console.error("[voice] stop failed:", err));
  };

  if (state === "idle" || state === "starting") {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={start}
        disabled={disabled || state === "starting"}
        aria-label="تسجيل رسالة صوتية"
        className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
      >
        {state === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}
      </Button>
    );
  }

  return (
    <div className="flex h-10 flex-1 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 dark:border-red-900 dark:bg-red-950/40">
      <Button
        variant="ghost-destructive"
        size="icon-sm"
        onClick={() => finish(false)}
        aria-label="إلغاء التسجيل"
      >
        <Trash2 />
      </Button>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="font-sans text-sm tabular-nums text-red-700 dark:text-red-300" dir="ltr">
        {formatDuration(seconds)}
      </span>
      <span className="flex-1 truncate font-sans text-xs text-red-700/70 dark:text-red-300/70">
        جارٍ التسجيل...
      </span>
      <Button
        size="icon-sm"
        onClick={() => finish(true)}
        disabled={seconds < 1}
        aria-label="إرسال الرسالة الصوتية"
        className="rounded-full"
      >
        <Send />
      </Button>
    </div>
  );
}

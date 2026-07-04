"use client";

import { useState, useEffect, useRef } from "react";
import {
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type ConnState = "open" | "close" | "connecting" | "loading" | "error";
type WebhookState = "idle" | "checking" | "ok" | "setting" | "error";

export default function WhatsAppQR() {
  const [connState, setConnState] = useState<ConnState>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [webhookState, setWebhookState] = useState<WebhookState>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      const state: ConnState = data.state ?? "close";
      setConnState(state);
      return state;
    } catch {
      setConnState("error");
      return "error" as ConnState;
    }
  };

  const fetchQR = async () => {
    try {
      const res = await fetch("/api/whatsapp/qr");
      const data = await res.json();
      const raw: string = data.base64 ?? data.code ?? "";
      if (raw.startsWith("data:")) {
        setQr(raw);
      } else if (raw) {
        setQr(`data:image/png;base64,${raw}`);
      }
    } catch {
      // keep existing QR
    }
  };

  const ensureWebhook = async () => {
    setWebhookState("checking");
    try {
      const res = await fetch("/api/whatsapp/webhook-config");
      const data = await res.json();
      console.log("Webhook config response:", data);
      if (data.configured) {
        setWebhookState("ok");
        return;
      }
      // Not configured yet — set it automatically
      setWebhookState("setting");
      const setRes = await fetch("/api/whatsapp/webhook-config", {
        method: "POST",
      });
      setWebhookState(setRes.ok ? "ok" : "error");
    } catch {
      setWebhookState("error");
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const state = await fetchStatus();
      if (state === "open" && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        await ensureWebhook();
      }
    }, 5000);
  };

  useEffect(() => {
    const init = async () => {
      const state = await fetchStatus();
      if (state === "open") {
        await ensureWebhook();
      } else {
        await fetchQR();
        startPolling();
      }
    };
    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      setConnState("close");
      setQr(null);
      setWebhookState("idle");
      await fetchQR();
      startPolling();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefreshQR = async () => {
    setQr(null);
    await fetchQR();
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm">
      {/* Status bar */}
      <div className="flex items-center gap-2 mb-6">
        {connState === "open" && (
          <span className="flex items-center gap-2 text-sm font-medium text-green-600 font-sans">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            متصل
          </span>
        )}
        {connState === "connecting" && (
          <span className="flex items-center gap-2 text-sm font-medium text-amber-500 font-sans">
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري الاتصال...
          </span>
        )}
        {(connState === "close" || connState === "loading") && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
            <WifiOff className="w-4 h-4" />
            {connState === "loading" ? "جاري التحقق..." : "غير متصل"}
          </span>
        )}
        {connState === "error" && (
          <span className="flex items-center gap-2 text-sm text-red-500 font-sans">
            <AlertCircle className="w-4 h-4" />
            تعذر الاتصال بخادم واتساب
          </span>
        )}
      </div>

      {/* Content */}
      {connState === "open" ? (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <Wifi className="w-10 h-10 text-green-600" />
          </div>
          <p className="text-sm text-muted-foreground font-sans text-center">
            واتساب متصل ويستقبل الرسائل بنجاح
          </p>

          {/* Reception status */}
          {webhookState !== "idle" && (
            <div className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
              {webhookState === "checking" || webhookState === "setting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground font-sans">
                    {webhookState === "checking"
                      ? "جاري التحقق من إعدادات الاستقبال..."
                      : "جاري تفعيل استقبال الرسائل..."}
                  </span>
                </>
              ) : webhookState === "ok" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-xs text-green-700 font-sans">
                    جاهز لاستقبال الرسائل
                  </span>
                </>
              ) : webhookState === "error" ? (
                <>
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-red-600 font-sans">
                      تعذّر تفعيل استقبال الرسائل
                    </span>
                    <button
                      onClick={ensureWebhook}
                      className="text-xs text-accent underline text-right font-sans"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-sans hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {disconnecting && <Loader2 className="w-4 h-4 animate-spin" />}
            قطع الاتصال
          </button>
        </div>
      ) : qr ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground font-sans text-center">
            افتح واتساب على هاتفك ← الأجهزة المرتبطة ← ربط جهاز ← امسح الرمز
          </p>
          <img
            src={qr}
            alt="WhatsApp QR Code"
            className="w-56 h-56 rounded-xl border border-border object-cover"
          />
          <button
            onClick={handleRefreshQR}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-sans"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث الرمز
          </button>
        </div>
      ) : connState !== "error" ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-sans">
            جاري تحميل رمز QR...
          </p>
        </div>
      ) : null}
    </div>
  );
}

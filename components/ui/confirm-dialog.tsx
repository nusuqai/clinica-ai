"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * The app's one confirmation dialog — a promise-based replacement for
 * `window.confirm`, rendered as a shadcn AlertDialog so it matches the app
 * (RTL, Arabic, brand styling). Every destructive action goes through it.
 *
 * Plain yes/no:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ description: "حذف هذا الطبيب؟" }))) return;
 *
 * Or let the dialog run the action, so its confirm button shows a spinner and
 * the dialog stays open until the action settles; an `{ error }` result (or a
 * throw) is shown inside the dialog instead of closing it:
 *
 *   await confirm({
 *     title: "حذف الطبيب",
 *     description: <>حذف الطبيب «{name}»؟</>,
 *     warning: "سيتم حذف حسابه بالكامل ولا يمكن التراجع.",
 *     onConfirm: () => deleteDoctorAction(id),
 *   });
 *
 * Keyboard: focus starts on the confirm button (Enter confirms), Esc cancels,
 * focus is trapped inside; a click on the overlay cancels too. While the action
 * runs, nothing dismisses the dialog.
 */

export interface ConfirmOptions {
  title?: React.ReactNode;
  /** The question — name the item being removed. */
  description: React.ReactNode;
  /** Optional consequence line, shown in red (e.g. "لا يمكن التراجع"). */
  warning?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button — the default, since most confirms guard a delete. */
  destructive?: boolean;
  /**
   * Runs on confirm while the dialog shows a loading state. Resolve with
   * `{ error: string }` (the server actions' convention) or throw to keep the
   * dialog open with that message; anything else closes it and the confirm
   * promise resolves `true`.
   */
  onConfirm?: () => unknown;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a ConfirmProvider.");
  return confirm;
}

function errorOf(result: unknown): string | null {
  if (result && typeof result === "object" && "error" in result) {
    const error = (result as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return null;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const resolver = React.useRef<((value: boolean) => void) | null>(null);
  const confirmButton = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    // A second confirm while one is open answers the first with "no".
    resolver.current?.(false);
    setOptions(opts);
    setPending(false);
    setError(null);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
    setPending(false);
    setError(null);
  };

  // Every dismissal path (Esc, overlay, cancel) — ignored mid-action.
  const cancel = () => {
    if (!pending) settle(false);
  };

  async function handleConfirm() {
    if (!options?.onConfirm) return settle(true);
    setPending(true);
    setError(null);
    try {
      const message = errorOf(await options.onConfirm());
      if (message) {
        setError(message);
        setPending(false);
        return;
      }
      settle(true);
    } catch {
      setError("حدث خطأ غير متوقع، حاول مرة أخرى.");
      setPending(false);
    }
  }

  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && cancel()}>
        <AlertDialogContent
          className="w-[calc(100%-2rem)] max-w-md"
          dir="rtl"
          onOverlayClick={cancel}
          onEscapeKeyDown={(e) => pending && e.preventDefault()}
          // Radix focuses Cancel by default; start on the confirm button so
          // Enter confirms (Esc still cancels).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            confirmButton.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-lg font-bold text-foreground">
              {options?.title ?? (destructive ? "تأكيد الحذف" : "تأكيد الإجراء")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {options?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {options?.warning && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{options.warning}</span>
            </p>
          )}

          {error && (
            <p role="alert" className="font-sans text-sm text-red-600">
              {error}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancel} disabled={pending} className="mt-0">
              {options?.cancelText ?? "إلغاء"}
            </AlertDialogCancel>
            {/* A plain button, not AlertDialogAction: Action closes the dialog
                on click, but it must stay open while `onConfirm` runs. */}
            <Button
              ref={confirmButton}
              variant={destructive ? "destructive" : "default"}
              loading={pending}
              onClick={handleConfirm}
            >
              {options?.confirmText ?? (destructive ? "حذف" : "تأكيد")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

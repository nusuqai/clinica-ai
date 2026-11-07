"use client";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}

/** App-wide modal: a shadcn Dialog with the ClinicaAI header + scrollable body. */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-lg",
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 shadow-xl",
          width
        )}
      >
        <DialogHeader className="border-b border-border px-6 py-4 sm:text-start">
          <DialogTitle className="font-heading text-lg font-bold text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

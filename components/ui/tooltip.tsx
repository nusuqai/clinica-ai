"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs origin-[--radix-tooltip-content-transform-origin] overflow-hidden rounded-lg bg-primary px-3 py-1.5 text-center font-sans text-xs leading-relaxed text-white animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Shorthand for a plain text tooltip on one element — the replacement for a
 * native `title=`. Tooltips don't name their trigger for screen readers, so an
 * icon-only trigger still needs its own `aria-label`.
 */
function Hint({
  label,
  side = "top",
  className,
  children,
}: {
  label: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  /** Classes for the bubble, e.g. a light variant on dark surfaces. */
  className?: string;
  children: React.ReactElement;
}) {
  // Nothing to say (e.g. an empty note): render the element without a tooltip.
  if (label == null || label === "") return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint };

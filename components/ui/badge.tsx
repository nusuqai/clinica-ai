import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-sans text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        accent: "bg-accent/10 text-accent",
        muted: "bg-muted text-muted-foreground",
        outline: "border border-border text-foreground",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
        danger: "bg-red-100 text-red-700",
        info: "bg-blue-100 text-blue-700",
        neutral: "bg-gray-100 text-gray-600",
        sky: "bg-sky-100 text-sky-700",
        violet: "bg-violet-100 text-violet-700",
        rose: "bg-rose-100 text-rose-700",
        indigo: "bg-indigo-100 text-indigo-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Render the single child (e.g. a <button> or <Link>) with badge styling. */
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return <Comp className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

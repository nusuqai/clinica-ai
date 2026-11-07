import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Loading indicator; color it with a text-* class (inherits currentColor). */
function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return (
    <Loader2
      role="status"
      aria-label="جارٍ التحميل"
      className={cn("size-5 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

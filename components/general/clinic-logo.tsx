import { Stethoscope } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * The clinic's logo as a rounded square, falling back to a stethoscope tile
 * when there is no logo — or when the logo URL fails to load.
 */
export function ClinicLogo({
  src,
  name,
  className,
  fallbackClassName,
}: {
  src?: string | null;
  name: string;
  className?: string;
  /** Tile colours for the fallback, e.g. a softer tint on the dark sidebar. */
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={cn("h-9 w-9 rounded-xl", className)}>
      {src && <AvatarImage src={src} alt={name} className="object-cover" />}
      {/* With a logo, wait briefly before showing the tile so it doesn't flash while loading. */}
      <AvatarFallback
        delayMs={src ? 600 : undefined}
        className={cn("rounded-xl bg-accent text-white", fallbackClassName)}
      >
        <Stethoscope className="h-5 w-5" />
      </AvatarFallback>
    </Avatar>
  );
}

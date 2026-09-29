"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Loader2, ImageOff, X, ExternalLink } from "lucide-react";

interface ChatImageProps {
  src?: string;
  alt: string;
  /** Intrinsic size, when known (staff-sent images) — reserves exact space so
   *  there is zero layout shift. Unknown for inbound patient photos. */
  width?: number | null;
  height?: number | null;
  /** Max rendered width in px (default 240). */
  maxWidth?: number;
}

/** Full-screen preview of a chat image. Closes on backdrop click or Escape. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="فتح الصورة الأصلية"
        className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs text-white transition-colors hover:bg-white/20"
      >
        <ExternalLink className="h-4 w-4" />
        فتح الأصل
      </a>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
      />
    </div>
  );
}

/**
 * A chat image that:
 *  - loads only when scrolled near the viewport (native `loading="lazy"`),
 *  - shows a spinner over a reserved placeholder box while loading,
 *  - preserves the image's real proportions (never cropped): exact aspect-ratio
 *    when the dimensions are known, otherwise its natural size once loaded,
 *  - opens full-screen (lightbox) on click.
 */
export function ChatImage({ src, alt, width, height, maxWidth = 240 }: ChatImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [open, setOpen] = useState(false);
  const known = !!(width && height);

  if (status === "error") {
    return (
      <div
        className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted/60 text-muted-foreground"
        style={{ maxWidth }}
      >
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  // Known dims → reserve the exact box (aspect-ratio) and contain the image in it.
  // Unknown dims → reserve a neutral box only while loading, then let the image
  // take its natural height.
  const wrapStyle: CSSProperties = { maxWidth };
  if (known) wrapStyle.aspectRatio = `${width} / ${height}`;
  else if (status === "loading") wrapStyle.minHeight = 140;

  return (
    <>
      <div
        className="relative w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted/60"
        style={wrapStyle}
        onClick={() => status === "loaded" && setOpen(true)}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            className={[
              "block w-full transition-opacity duration-300",
              known ? "absolute inset-0 h-full object-contain" : "h-auto object-contain",
              status === "loaded" ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {open && src && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

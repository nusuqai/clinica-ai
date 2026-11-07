"use client";

import { createContext, useContext, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Instant skeletons for navigations that stay on the same route — filters,
// status pills, ?tab= switches. Next shows a route's loading.tsx only when the
// route itself changes; when just the search params change it keeps the old
// screen up until the server answers. Running those navigations in a
// transition gives us `isPending` the moment the user clicks, and
// <PendingSwap> uses it to put the skeleton up straight away. When the new
// page commits, the page's keyed <Suspense> shows the same skeleton until its
// data streams in, so the hand-off is seamless.

interface PendingNavigation {
  isPending: boolean;
  navigate: (href: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
}

const PendingNavigationContext = createContext<PendingNavigation | null>(null);

export function PendingNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string, { replace = false, scroll = false } = {}) {
    startTransition(() => {
      if (replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    });
  }

  return (
    <PendingNavigationContext.Provider value={{ isPending, navigate }}>
      {children}
    </PendingNavigationContext.Provider>
  );
}

/** The enclosing provider's navigation, or null outside one. */
export function usePendingNavigation() {
  return useContext(PendingNavigationContext);
}

/** Shows `fallback` instead of `children` while a navigation is pending. */
export function PendingSwap({
  fallback,
  children,
}: {
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  const nav = usePendingNavigation();
  return <>{nav?.isPending ? fallback : children}</>;
}

/**
 * A next/link <Link> whose plain clicks navigate through the provider, so the
 * page's <PendingSwap> skeletons show at once. Modified clicks (new tab, etc.)
 * and links outside a provider behave like a normal <Link>.
 */
export function PendingLink({
  href,
  replace,
  scroll = false,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  const nav = usePendingNavigation();
  return (
    <Link
      href={href}
      replace={replace}
      scroll={scroll}
      onClick={(e) => {
        onClick?.(e);
        if (
          !nav ||
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        nav.navigate(href, { replace, scroll });
      }}
      {...props}
    />
  );
}

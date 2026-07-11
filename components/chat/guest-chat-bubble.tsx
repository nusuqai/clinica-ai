"use client";

import { useEffect, useState } from "react";
import { signInAsGuest } from "@/server/actions/auth";
import ChatBubble from "./chat-bubble";

/**
 * Wraps ChatBubble for public pages (e.g. the landing page) where the visitor
 * may not be logged in. Ensures a session exists — signing in anonymously via
 * a server action if needed — before rendering the widget, so guests get the
 * same chat experience as logged-in patients without creating an account
 * first. The Supabase call happens server-side; the browser only calls this
 * server action.
 */
export default function GuestChatBubble() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    signInAsGuest().then((result) => {
      if (!cancelled && result.success) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <ChatBubble />;
}

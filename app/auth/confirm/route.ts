import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing route for every branded auth link (invite / recovery / email change).
// The link carries a Supabase `token_hash`; we exchange it for a session cookie
// via verifyOtp, then forward the user to the flow's `next` page. On failure we
// send them to an error screen rather than a half-authenticated state.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // Only allow same-origin relative redirects to avoid open-redirect abuse.
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }

    // Token failed — but a recovery/invite token is single-use, so the most
    // common cause is the SAME user clicking the link a second time after the
    // first click already opened their session. If a valid session is already
    // present, treat this as "already verified" and let them continue rather
    // than showing a misleading "expired" screen.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", origin));
}

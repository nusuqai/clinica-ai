import { NextRequest, NextResponse } from "next/server";

/**
 * The Meta webhook verification handshake.
 *
 * Because each clinic runs its own Meta app and we don't collect app secrets,
 * we don't verify `X-Hub-Signature-256`. Authenticity rests instead on the
 * unguessable per-clinic token in the callback URL path (see the route). This
 * is a temporary arrangement for the pre-verification phase — restore signature
 * verification when Embedded Signup lands (issue #7).
 */

/**
 * Meta verifies a callback URL by GETting it with `hub.*` query params. The
 * response has to be the raw `hub.challenge` value as plain text — a JSON body
 * or a wrapped object fails the check in the App Dashboard.
 *
 * @param verifyToken the token stored for the clinic this URL belongs to
 */
export function handleVerification(
  request: NextRequest,
  verifyToken: string | undefined,
): NextResponse {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  // Not a verification attempt — a browser, a health check, a stray probe.
  if (!mode && !token && !challenge) {
    return NextResponse.json({ ok: true });
  }

  if (!verifyToken) {
    console.error("[meta-webhook] no verify token for this callback URL");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (mode !== "subscribe" || token !== verifyToken || !challenge) {
    console.warn("[meta-webhook] verification rejected", {
      mode,
      hasChallenge: !!challenge,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

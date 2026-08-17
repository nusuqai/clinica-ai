# Email delivery (Resend)

All transactional + auth emails (clinic-request acknowledgement, approval invite,
rejection, admin-created invite, password reset, email change) are sent through
**[Resend](https://resend.com)**. Supabase still owns and validates every auth
token — we only take over *delivery* so the emails are branded, Arabic RTL, and
not subject to Supabase's testing-only rate limits.

## How it works

```
action (e.g. approveClinicRequest)
  └─ lib/email/send-auth-email.ts
       └─ admin.auth.admin.generateLink({ type })   ← Supabase mints the token, sends nothing
       └─ build link → APP_URL/auth/confirm?token_hash=…&type=…&next=…
       └─ render template (lib/email/templates) → sendEmail() (lib/email/resend.ts)
                                                     └─ Resend API
```

When the user clicks the link:

```
GET /auth/confirm  → supabase.auth.verifyOtp({ token_hash, type })  → session cookie set
                   → redirect to `next` (/set-password, /reset-password, …)
```

Transactional emails with no token (request received / rejected) skip
`generateLink` and go straight through `lib/email/send-transactional.ts`.

Sending **never throws** — if `RESEND_API_KEY` is unset it's a logged no-op, and
delivery failures are swallowed so approving a clinic (etc.) still succeeds.

## One-time setup

### 1. Resend account + domain

1. Create a free account at [resend.com](https://resend.com) (3k emails/mo).
2. **Domains → Add Domain** → enter your sending domain (a subdomain such as
   `mail.yourdomain.com` is recommended).
3. Resend shows **SPF / DKIM / DMARC** records.

### 2. Namecheap DNS

Domain List → **Manage** → **Advanced DNS** → add each record from Resend
(matching Host + Value exactly). Then click **Verify** in Resend.

### 3. Supabase redirect URLs

Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

- `http://localhost:3000/auth/confirm`
- `https://yourdomain.com/auth/confirm` (production)

> Note: because we generate links against our own `/auth/confirm` route via
> `generateLink`, the main requirement is that Supabase custom-SMTP is **not**
> needed for these flows — Resend does the sending. Keep custom SMTP configured
> too (or a Send Email hook) if you want Supabase's *own* automatic emails
> (e.g. default signup confirmation) routed through Resend as well.

### 4. Environment

Add to `.env.hosted` / `.env.localdb`:

```
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="Nusuq <noreply@yourdomain.com>"
```

`APP_URL` (already present) must point at the deployed origin in production so
the links in emails resolve correctly.

## Testing before the domain verifies

Leave `EMAIL_FROM` blank to use Resend's sandbox sender `onboarding@resend.dev`.
It only delivers to **your own Resend account email**, but it's enough to confirm
the wiring end-to-end (approve a request whose email is your Resend login).

## Templates

`lib/email/templates/` — a shared branded `layout.ts` plus one builder per flow
in `index.ts`. All are Arabic RTL and embed the clinic name in the body (sender
is the platform brand, Nusuq). To add a flow: add a builder, then a sender in
`send-auth-email.ts` (token flows) or `send-transactional.ts` (no token).

## Signup email verification (OTP)

Account creation exists **only under a clinic** (`/clinic/{slug}/register`) — there
is no global sign-up. The flow (issue #11, email half):

```
startClinicSignup(slug)   → guards against existing accounts (findAuthUserByEmail):
                              • confirmed + already a member → "login" error
                              • confirmed elsewhere → needsLogin (log in to join)
                              • unconfirmed leftover → deleted, re-created
                            → sendClinicSignupOtp: generateLink({type:"signup"}) mints
                              the user + a 6-digit code; Resend delivers the CODE
                            → redirect /clinic/{slug}/verify-otp?email=…
verifyClinicSignup(slug)  → verifyOtp({email, token, type:"signup"}) (Supabase verifies)
                            → session opens → upsert ClinicMember(PATIENT) → dashboard
```

Supabase owns OTP **creation and verification**; Resend only delivers. Locally
(no `RESEND_API_KEY`) the code is printed to the server log so you can still test.

**Unverified login → auto-resend.** If someone signs up but never verifies, then
tries to log in at `/clinic/{slug}/login`, Supabase returns `email_not_confirmed`
(only when the password is correct, so it can't probe accounts). `signInToClinic`
catches it, re-issues a fresh OTP (`sendClinicSignupOtp` → `mintSignupOtp`, which
regenerates for an existing unconfirmed user or deletes+recreates as a fallback),
and redirects them to `/clinic/{slug}/verify-otp` to finish. **This requires the
Supabase "Confirm email" toggle to be ON** — otherwise unconfirmed users can log
in directly and the gate never triggers.

## Not yet wired

- **Doctor/staff account invite** (`server/services/doctors.ts`) still creates a
  confirmed account with a known password — intentionally left for a follow-up.
- **Email change** sender exists (`sendEmailChange`) but no UI calls it yet.
- Phone/SMS verification (issue #11) is out of scope here.
- **Resend OTP** (a "resend code" button) — not added; the code lasts ~1h and the
  verify page links back to register to start over.

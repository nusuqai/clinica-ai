import "server-only";
import { prisma } from "@/lib/prisma";

// Per-email cooldown between signup verification-code sends. Protects the Resend
// quota and is standard OTP hygiene. Supabase adds its own per-IP throttling on
// verification; this covers repeated *sends*.
const COOLDOWN_MS = 60_000;

function key(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Seconds the caller must wait before another code may be sent to this email,
 * or 0 if a send is allowed now.
 */
export async function otpCooldownRemaining(email: string): Promise<number> {
  const rec = await prisma.otpRequest.findUnique({ where: { email: key(email) } });
  if (!rec) return 0;
  const remaining = COOLDOWN_MS - (Date.now() - rec.lastSentAt.getTime());
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/** Record that a code was just sent to this email, starting a fresh cooldown. */
export async function recordOtpSent(email: string): Promise<void> {
  const e = key(email);
  await prisma.otpRequest.upsert({
    where: { email: e },
    update: { lastSentAt: new Date() },
    create: { email: e },
  });
}

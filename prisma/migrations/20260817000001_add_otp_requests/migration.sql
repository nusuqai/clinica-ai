-- Per-email cooldown bookkeeping for signup verification codes. Stores the last
-- time a code was emailed to an address so resends can be throttled (protects
-- the Resend quota; standard OTP hygiene). Keyed by email — not a user id —
-- because the account may be unconfirmed or recreated between requests.

-- CreateTable
CREATE TABLE "otp_requests" (
    "email" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("email")
);

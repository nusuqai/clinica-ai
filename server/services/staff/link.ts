import "server-only";
import { randomInt } from "node:crypto";
import { Channel, ConversationKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Linking a member's own WhatsApp (#89).
 *
 * The member asks the dashboard for a one-time code and sends it FROM their
 * WhatsApp TO any of the clinic's numbers. An inbound message reaches our
 * webhook on both providers (the Cloud API's 24h rule only limits what the
 * clinic sends), so this needs no template, proves the member controls that
 * WhatsApp account, and records the exact identifiers it writes with —
 * including a hidden-number id (Meta BSUID / WhatsApp LID) when the phone is
 * hidden. It also opens the member's 24h window, so the confirmation is free.
 */

/** How long a code stays valid. */
export const LINK_CODE_TTL_MINUTES = 15;
/** The word in front of the digits — what the member types/pastes. */
export const LINK_CODE_PREFIX = "ربط";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_DIGITS.indexOf(d);
    return String(a >= 0 ? a : PERSIAN_DIGITS.indexOf(d));
  });
}

/**
 * The 6-digit code in a message that is ONLY a link code ("ربط-123456",
 * "ربط 123456", "link-123456", Arabic digits too), else null. Anchored to the
 * whole message so a patient's ordinary text can never be read as a code.
 */
export function parseLinkCode(text: string): string | null {
  const t = westernDigits(text.trim());
  const m = /^(?:ربط|link)\s*[-–—:]?\s*(\d{6})$/i.exec(t);
  return m ? m[1] : null;
}

export function formatLinkCode(code: string): string {
  return `${LINK_CODE_PREFIX}-${code}`;
}

/** A fresh code for the member (replacing any earlier one). The member's
 *  current link, if verified, keeps working until the new code is used. */
export async function createLinkCode(
  clinicId: string,
  memberId: string
): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await prisma.memberWhatsappLink.upsert({
        where: { memberId },
        create: { clinicId, memberId, linkCode: code, linkCodeExpiresAt: expiresAt },
        update: { linkCode: code, linkCodeExpiresAt: expiresAt },
      });
      return { code, expiresAt };
    } catch (err) {
      // Another member holds this code right now — draw again.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("تعذّر إنشاء رمز الربط، حاول مرة أخرى");
}

export interface WhatsappContactIds {
  phone: string | null;
  userId: string | null;
  name: string;
}

export type VerifyResult =
  | { ok: true; memberId: string; fullName: string }
  | { ok: false; reason: "invalid" | "expired" | "taken" };

/**
 * Verifies a link code that arrived on one of the clinic's numbers. On success
 * the member's link holds the identifiers the message came from and the number
 * it came through, and the member's own WhatsApp thread becomes a team-assistant
 * thread (hidden from the inbox).
 */
export async function verifyLinkCode(
  clinicId: string,
  code: string,
  contact: WhatsappContactIds,
  whatsappConfigId: string
): Promise<VerifyResult> {
  const link = await prisma.memberWhatsappLink.findFirst({
    where: { clinicId, linkCode: code },
    select: {
      id: true,
      memberId: true,
      linkCodeExpiresAt: true,
      member: { select: { userId: true, user: { select: { fullName: true } } } },
    },
  });
  if (!link) return { ok: false, reason: "invalid" };
  if (!link.linkCodeExpiresAt || link.linkCodeExpiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  // One WhatsApp account belongs to one member of a clinic.
  const ids: Prisma.MemberWhatsappLinkWhereInput[] = [];
  if (contact.phone) ids.push({ phone: contact.phone });
  if (contact.userId) ids.push({ whatsappUserId: contact.userId });
  if (ids.length === 0) return { ok: false, reason: "invalid" };
  const other = await prisma.memberWhatsappLink.findFirst({
    where: { clinicId, id: { not: link.id }, OR: ids },
    select: { id: true },
  });
  if (other) return { ok: false, reason: "taken" };

  await prisma.memberWhatsappLink.update({
    where: { id: link.id },
    data: {
      phone: contact.phone,
      whatsappUserId: contact.userId,
      whatsappConfigId,
      verifiedAt: new Date(),
      linkCode: null,
      linkCodeExpiresAt: null,
    },
  });
  await bindStaffWhatsappConversation(clinicId, link.member.userId, contact);
  return { ok: true, memberId: link.memberId, fullName: link.member.user.fullName };
}

/** The verified member link this WhatsApp contact writes from, or null. */
export async function findVerifiedLink(
  clinicId: string,
  contact: { phone: string | null; userId: string | null }
) {
  const or: Prisma.MemberWhatsappLinkWhereInput[] = [];
  if (contact.userId) or.push({ whatsappUserId: contact.userId });
  if (contact.phone) or.push({ phone: contact.phone });
  if (or.length === 0) return null;
  return prisma.memberWhatsappLink.findFirst({
    where: { clinicId, verifiedAt: { not: null }, OR: or },
    select: {
      id: true,
      memberId: true,
      phone: true,
      whatsappUserId: true,
      member: { select: { userId: true } },
    },
  });
}

function contactWhere(
  clinicId: string,
  contact: { phone: string | null; userId: string | null }
): Prisma.ConversationWhereInput | null {
  const or: Prisma.ConversationWhereInput[] = [];
  if (contact.userId) or.push({ whatsappUserId: contact.userId });
  if (contact.phone) or.push({ whatsappPhone: contact.phone });
  return or.length ? { clinicId, OR: or } : null;
}

/**
 * The member's own WhatsApp thread with the clinic, as a STAFF_ASSISTANT
 * conversation carrying this contact's identifiers (created when missing).
 *
 * The thread the contact already has (e.g. they chatted with the clinic before
 * linking) is converted — it's their own number, so its history is theirs. A
 * different earlier staff thread of the member (an old number) is detached so
 * the contact's identifiers and the member's account point at one thread.
 */
export async function bindStaffWhatsappConversation(
  clinicId: string,
  memberUserId: string,
  contact: WhatsappContactIds
): Promise<string> {
  const where = contactWhere(clinicId, contact);
  const byContact = where
    ? await prisma.conversation.findFirst({
        where: { ...where, channel: Channel.WHATSAPP },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true, whatsappPhone: true, whatsappUserId: true },
      })
    : null;
  const mine = await prisma.conversation.findFirst({
    where: { clinicId, userId: memberUserId, channel: Channel.WHATSAPP },
    select: { id: true },
  });

  if (byContact) {
    if (mine && mine.id !== byContact.id) {
      // Free the (clinic, user, channel) key and the old identifiers.
      await prisma.conversation.update({
        where: { id: mine.id },
        data: {
          kind: ConversationKind.STAFF_ASSISTANT,
          userId: null,
          whatsappPhone: null,
          whatsappUserId: null,
        },
      });
    }
    await prisma.conversation.update({
      where: { id: byContact.id },
      data: {
        kind: ConversationKind.STAFF_ASSISTANT,
        userId: memberUserId,
        whatsappPhone: contact.phone ?? byContact.whatsappPhone,
        whatsappUserId: contact.userId ?? byContact.whatsappUserId,
        // Leave the inbox's assignment alone — the thread is no longer listed.
      },
    });
    return byContact.id;
  }

  if (mine) {
    await prisma.conversation.update({
      where: { id: mine.id },
      data: {
        kind: ConversationKind.STAFF_ASSISTANT,
        whatsappPhone: contact.phone,
        whatsappUserId: contact.userId,
        ...(contact.name ? { whatsappName: contact.name } : {}),
      },
    });
    return mine.id;
  }

  const created = await prisma.conversation.create({
    data: {
      clinicId,
      channel: Channel.WHATSAPP,
      kind: ConversationKind.STAFF_ASSISTANT,
      userId: memberUserId,
      whatsappPhone: contact.phone,
      whatsappUserId: contact.userId,
      whatsappName: contact.name || contact.phone,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * A staff thread still carrying this contact's identifiers while the contact
 * is no longer a linked member (unlinked, or removed from the team): detach
 * it, so the number is treated as an ordinary contact again and gets a fresh
 * customer thread instead of writing into a hidden one.
 */
export async function detachOrphanStaffConversation(
  clinicId: string,
  contact: { phone: string | null; userId: string | null }
): Promise<void> {
  const where = contactWhere(clinicId, contact);
  if (!where) return;
  await prisma.conversation.updateMany({
    where: { ...where, kind: ConversationKind.STAFF_ASSISTANT },
    data: { whatsappPhone: null, whatsappUserId: null },
  });
}

/** Unlinks a member's WhatsApp: the link goes, and their thread is detached
 *  from the number (its history stays, hidden, on the member's account). */
export async function unlinkMemberWhatsapp(clinicId: string, memberId: string): Promise<void> {
  const link = await prisma.memberWhatsappLink.findFirst({
    where: { clinicId, memberId },
    select: { id: true, phone: true, whatsappUserId: true },
  });
  if (!link) return;
  await prisma.memberWhatsappLink.delete({ where: { id: link.id } });
  await detachOrphanStaffConversation(clinicId, {
    phone: link.phone,
    userId: link.whatsappUserId,
  });
}

/** The member's team-assistant thread on the dashboard bubble (WEB). */
export async function getOrCreateStaffWebConversation(
  clinicId: string,
  memberUserId: string
): Promise<string> {
  const existing = await prisma.conversation.findUnique({
    where: {
      clinicId_userId_channel: { clinicId, userId: memberUserId, channel: Channel.WEB },
    },
    select: { id: true, kind: true },
  });
  if (existing) {
    if (existing.kind !== ConversationKind.STAFF_ASSISTANT) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { kind: ConversationKind.STAFF_ASSISTANT },
      });
    }
    return existing.id;
  }
  const created = await prisma.conversation.create({
    data: {
      clinicId,
      userId: memberUserId,
      channel: Channel.WEB,
      kind: ConversationKind.STAFF_ASSISTANT,
    },
    select: { id: true },
  });
  return created.id;
}

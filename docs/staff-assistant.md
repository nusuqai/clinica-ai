# Team assistant & WhatsApp alerts (#89)

Clinic members (ADMIN, STAFF, DOCTOR) manage the clinic by chatting with the AI,
either from their own WhatsApp (to any of the clinic's numbers, Cloud API or
WhatsApp Web) or from the bubble on the dashboard. They also get grouped
WhatsApp alerts for the events the clinic admin routes to them.

## Who can use it

| Check                                                                                                                                                         | Where                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Clinic master switch (`StaffAssistantSettings.enabled`, default on)                                                                                           | `/admin/assistant`                          |
| Member flag (`ClinicMember.assistantEnabled`). ADMIN is always allowed; STAFF and DOCTOR need an admin to enable it. One flag covers WhatsApp and the bubble. | `/admin/assistant`                          |
| Linked WhatsApp (`MemberWhatsappLink`), needed for WhatsApp use and for alerts                                                                                | `/admin/my-whatsapp`, `/doctor/my-whatsapp` |

Both switches are re-read on every turn. When either is off, the member gets a
short notice instead of an answer, and it is not charged.

## Linking a number

1. The member opens "واتساب الخاص بي" and creates a code (`ربط-123456`, valid
   for 15 minutes).
2. They send that code **from** their WhatsApp **to** any clinic number. The
   page offers `wa.me` buttons with the text already filled in.
3. The inbound webhook (`server/services/staff/ingest.ts`) matches the code and
   records the phone and/or hidden id (Meta BSUID / WhatsApp LID). It also
   records which number they used, and alerts go out from that number. The
   member's existing thread on that number becomes a `STAFF_ASSISTANT` thread.

This works on both providers because only messages the clinic _sends_ are
limited by Meta's 24-hour window. The member's message also opens that window.

A linked number never goes through the patient pipeline: it never matches a
profile by phone, never provisions a patient, and is never escalated.
Unlinking, or removing the member from the team, detaches the thread so the
number becomes an ordinary contact again.

## Conversations

`Conversation.kind = STAFF_ASSISTANT` marks a member's own thread, on WhatsApp
or on the WEB bubble. These threads are hidden from the inbox
(`customerConversationWhere`) and never escalated (`ensureOpenEscalation` /
`escalateMessage` guard). WhatsApp threads still go through the debounce, and
`processDebouncedConversation` builds a staff context for them.

## Agent

- `AgentContext.staff` (a `StaffActor` with role, permissions, branch scope and
  doctorId) switches the agent to `buildStaffSystemPrompt` and `getStaffTools`.
- ADMIN/STAFF tools are each built only when the member holds the matching
  permission, and each re-checks branch scope:
  - Reads: appointments list and day summary, appointment details, patient
    search, medical file, open escalations, conversation search and messages,
    and the inbox team.
  - Writes: change status, reschedule, check in (arrival-based), book for a
    patient (`bookOnBehalf`, the same service the dashboard uses), resolve an
    escalation, AI on/off for a conversation, assign a conversation.
- DOCTOR tools: their own appointments, their patients, the medical file of
  patients they have treated, marking their visits completed or no-show, and
  check-in.
- There is deliberately **no** tool that messages patients.

### Confirmation, enforced on the server

Write tools only _propose_: they store a `StaffPendingAction` and return a
summary for the member. `confirm_action` runs it only when the member has
written a message _after_ the proposal was made, so the model cannot propose
and execute in the same turn. The executor re-checks permissions, scope and
state before acting. Proposals expire after 30 minutes, and a new proposal
replaces any older open one.

## Billing

Each assistant reply costs one unit like a patient reply. It is logged as
`AiUsageKind.STAFF_REPLY` so reports can split the two. Voice notes are
transcribed and billed as usual. Alerts cost nothing, since no AI is involved.

## Alerts

Events go through `server/services/staff/notifications.ts`:

| Event                 | Raised in                                                                                          | Who gets it                            |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| AI_ESCALATION         | `ensureOpenEscalation`, `escalateMessage`, the `escalate_to_human` tool                            | routed members                         |
| NEW_BOOKING           | `bookSlotAppointment` / `bookQueueAppointment` (not reschedules; the member who booked is skipped) | routed members; doctors only their own |
| PATIENT_CANCELLED     | patient web cancel, patient agent `cancel_appointment`                                             | routed members; doctors only their own |
| UNITS_LOW / UNITS_OUT | `notifyUnitAlert`                                                                                  | routed members                         |
| COLLEAGUE_ESCALATION  | inbox "escalate to colleague"                                                                      | that colleague                         |
| ASSIGNMENT            | inbox / assistant assignment                                                                       | the assignee                           |
| REMINDER_DUE          | the sweep (due `ConversationReminder`)                                                             | the reminder's creator                 |

Only members with a verified link are queued. Branch-limited staff only get
events from their own branches.

Delivery: pg_cron calls `POST /api/cron/staff-alerts` every minute
(`prisma/sql/staff-alerts-pgcron.sql`). A member's unsent alerts go out as
**one** grouped message once the oldest has waited `batchMinutes` (1–30,
default 5).

- WhatsApp Web, or an official number inside the member's 24-hour window: the
  full grouped text.
- Official number with the window closed: the clinic's approved alert template
  (tokens `alert_count`, `alert_summary`, `member_name`, `clinic_name`). The
  full text follows as soon as the member writes in
  (`flushMemberAlertsOnInbound`). With no template bound, the alerts wait for
  that moment.

Every alert sent is also saved in the member's thread, so the assistant knows
what "that escalation" refers to.

## Setup per environment

1. Apply the migration `20261124000001_staff_assistant` (`npm run prisma:deploy`).
2. Run `prisma/sql/staff-alerts-pgcron.sql` in the Supabase SQL editor after
   adding the `staff_alerts_url` Vault secret. It reuses `debounce_secret`
   (`CRON_SECRET`).
3. Official numbers only: create and approve a UTILITY alert template, then bind
   it in `/admin/assistant`.
4. Run `prisma/sql/cron-cleanup.sql` once. It schedules a daily job that prunes
   pg_cron's run log (7 days), delivered alerts (30 days) and used or expired
   confirmation proposals (7 days).

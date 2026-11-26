# Operations (العمليات)

Surgeries run as **team-managed cases**, not bookable appointments. A patient can
never book or schedule an operation. They can only ask for one; the clinic team
arranges everything else from the dashboard or the team assistant.

## Lifecycle

```
REQUESTED ─► PREPARING ─► SCHEDULED ─► DONE ─► CLOSED
 طلب جديد    قيد التجهيز   محددة الموعد   تمت      مغلقة
     └────────────┴────────────┴──► CANCELLED (ملغاة) ─► PREPARING (reopen)
```

- **REQUESTED**: opened by the patient AI (`request_operation`). Alerts the team
  through `StaffEvent.OPERATION_REQUEST`.
- **PREPARING**: the team is working on it (consultation, tests, price). A staff
  member creating a case starts here.
- **SCHEDULED**: reached **only** by scheduling (date + time). Requires a surgeon.
  "Postpone" = back to PREPARING, which clears the date and frees the surgeon.
- **DONE**: performed. Stamps `doneAt`, which starts the post-op check-in.
- **CLOSED**: follow-up finished. Can be reopened to DONE.

Transitions live in `OPERATION_TRANSITIONS` (`lib/operations.ts`), and the
service enforces them.

## Data

- `Operation`: patient, optional catalog type (`serviceId`; `name` is the
  snapshot), surgeon, place (a branch **or** `hospitalName`), wall-clock
  `scheduledDate` + `startTime` (same convention as day-only appointments),
  `durationMin`, `anesthesia`, `price`, `consentSigned`, pre/post-op
  instructions, internal `notes`, `requestNote`, `coordinatorId`, and the
  automation dedupe flags `reminderSentAt` and `followUpSentAt`.
- `OperationChecklistItem`: the pre-op checklist (labs, imaging, consent…).
- `OperationPayment`: deposits and installments (Decimal). Remaining = price − sum.
- `OperationEvent`: append-only case history (who did what).
- `OperationAttachment`: files in the private patient-media bucket under
  `<clinicId>/operations/<operationId>/`. Served by `/api/operation-attachments/[id]`.
- Catalog: `ServiceKind.OPERATION` plus `Service.operationChecklist` and
  `Service.postOpInstructions`. `prepInstructions` holds the pre-op text. These
  are copied into each new case. An OPERATION service is always saved with
  `bookable = false`, so the booking engine already refuses it.

## Surgeon's schedule

When a case is SCHEDULED and `blockSchedule` is on (the default), every **free**
slot of the surgeon that overlaps the window is set to `isBlocked` with
`Slot.blockedByOperationId`. Booked slots are never touched; they are reported
as **conflicts** (along with day-only visits that have a set time, other
operations, and the number of queue bookings that day). Rescheduling,
postponing, cancelling or changing the surgeon/duration re-syncs the hold
(`syncOperationBlocks`). Slots generated later are blocked too
(`blockNewSlotsForOperations`, called from slot generation). A doctor cannot
unblock an operation-held slot by hand.

## Access

- Permission key `operations` (branch-scoped). A branch-limited member sees
  cases in their branches **and** cases with no branch (outside hospital, or
  new requests).
- Doctors see their own operations (`/doctor/operations` and the team
  assistant's `list_my_operations`), read-only, without money.
- Patients see their own cases through the patient AI (`list_my_operations`).

## AI

- **Patient agent**: OPERATION services come back with `operation: true`. The
  prompt forbids booking them, quoting a final price or promising a date.
  `request_operation` opens or extends a request. `list_my_operations` is
  read-only. Any change goes to `escalate_to_human`.
- **Team assistant**: reads `list_operations`, `get_operation`,
  `list_operation_types`. Writes go through the confirm flow:
  `create_operation`, `update_operation`, `schedule_operation` (its summary
  shows conflicts), `set_operation_status`, `update_operation_checklist`,
  `record_operation_payment`, and `send_operation_message`. That last one sends
  the patient the details, pre-op or post-op instructions, or custom text over
  WhatsApp and threads it into their inbox conversation. On the official API it
  refuses when the 24h window is closed.

## Automations

Two new `AppointmentTemplatePurpose` values are bound on the WhatsApp
reminders page like the others (Meta template or Evolution custom text):

- `OPERATION_REMINDER`: `leadMinutes` before the operation (SCHEDULED, not yet
  reminded; a new date resets the flag).
- `OPERATION_FOLLOWUP`: `delayMinutes` after `doneAt` (within 7 days).

New tokens: `operation_name` and `operation_location`. `appointment_date` /
`appointment_time` resolve to the operation's own date and time.

## Not in v1

- Patients can't upload results into the case over WhatsApp (staff upload them
  on the case page).
- Operations don't show on the patient's landing-page history (patients ask
  the AI).
- No automatic `TreatmentRecord` when a case is marked DONE.
- No digital consent signature (checkbox plus an uploaded scan).

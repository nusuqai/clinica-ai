# Patient-data export & daily report

An Excel file of everything that happened to the clinic's **patients** in a
period. Clinic setup (doctors, services, prices…) is never exported on its own,
only as it appears on a patient's appointment.

Three ways to get it, one builder (`server/services/exports`):

| Where                   | Who                                           | How                                                                             |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `/admin/reports/export` | `reports` permission                          | Pick filters → download (`GET /api/exports?…`)                                  |
| Team assistant          | `reports` permission (not doctors)            | `export_patient_data` tool: file sent in the WhatsApp chat / link in the bubble |
| Scheduled report        | Chosen by the clinic ADMIN on the export page | Sent daily at the clinic's time over WhatsApp                                   |

## Filters (`lib/exports/filters.ts`)

Period (today, yesterday, this week (from Saturday), this month, or custom; at most 366 days),
branch, doctor, specialty, service, appointment status, one patient. Days are
calendar days on the clinic's clock (`Clinic.timezone`).

## What's in the file

| Sheet                  | Rows                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| الملخص                 | Period, filters, counts and revenue                                                                              |
| حسب الفرع / حسب الطبيب | The period's scheduled visits by status                                                                          |
| المرضى الجدد           | Patients who joined the clinic (`ClinicMember` PATIENT `createdAt`), first channel, file done, bookings          |
| حجوزات جديدة           | Appointments created in the period                                                                               |
| الإلغاءات              | Appointments cancelled in the period (+ reason)                                                                  |
| التغييرات              | One row per event: booked, confirmed, checked in, completed, cancelled, no-show, auto reminder, feedback request |
| مواعيد الفترة          | Appointments whose visit day is in the period                                                                    |
| الباقات المباعة        | Packages bought / granted                                                                                        |
| التقييمات              | Feedback received                                                                                                |
| السجلات الطبية         | Treatment records written/edited (complaint, diagnosis, procedures, prescriptions): **`medical_records` only**   |
| ملفات المرضى           | Health-profile answers updated: **`medical_records` only**                                                       |

Appointment rows carry everything: branch, doctor, specialty, day, time or
queue number, booking mode, services, offer, package used, estimated/final
totals, status, every timestamp, cancellation reason, notes (doctor notes
only with `medical_records`), referral, rating.

**Changes come from timestamps.** There is no appointment edit history, so a
reschedule doesn't show as its own event and the sheet doesn't say who made a
change. A no-show's time is the row's `updatedAt`, which is close but not exact.

**Scope.** A branch-limited member only gets their branches. Patient-level
sheets (new patients, health answers) are clinic-wide, but once any branch,
doctor, specialty, service or status filter (or a branch limit) applies, they
only include patients with a matching appointment.

## Delivery over WhatsApp (`delivery.ts`)

Each send is a `DataReportDelivery` row. **The file is never stored**: it is
built again from the row's filters at send time.

- Assistant request: the member just wrote in, so the file goes out at once.
- Scheduled: the minute sweep (`/api/cron/staff-alerts`, already on pg_cron)
  queues a row per recipient once the clinic's send time has passed
  (`DataReportSettings.lastRunOn` claims the day; `dedupeKey daily:<day>`).
- WhatsApp Web, or an official number inside the 24h window: the file is sent
  as a document with a summary caption.
- Official number with the window closed: the clinic's **alert template**
  (from `/admin/assistant`) announces "report ready". The file follows when the
  member writes in (`flushMemberReportsOnInbound`, called from staff ingest).
  If no template is bound, it simply waits for that message. Undelivered rows
  stop after 3 days or 5 attempts.
- Every send re-checks the member: still linked, still holds `reports`, and
  their current branch scope and medical permission.

Recipients are `StaffEventRecipient` rows with event `DAILY_REPORT`. They are
edited on the export page and left out of the alert-routing list.

## Setup per environment

1. Apply migration `20261125000001_data_export`.
2. Nothing new for cron: the existing `staff-alerts-sweep` job drives it.
3. Re-run `prisma/sql/cron-cleanup.sql` so the daily purge also prunes
   `data_report_deliveries` (30 days).

# Services, packages & offers — feature spec

Status: **agreed design, not yet implemented.** Everything in this document ships
in one phase. Items under [Not in this phase](#not-in-this-phase) were explicitly
decided against for now — they are recorded so they can be picked up later
without re-deciding.

This is a platform feature: it must fit any clinic type without per-type code
(see [Coverage by clinic type](#coverage-by-clinic-type)).

---

## 1. Why

Today booking assumes every visit is a **كشف**:

- Prices are two fixed columns on `Doctor` (`examinationFee`, `consultationFee`),
  used inconsistently (agent card + appointment detail show `examinationFee`;
  landing list, web booking modal and admin booking show `consultationFee`; solo
  landing shows `examinationFee ?? consultationFee`).
- `Appointment` records no service — only free-text `patientNotes`; the agent asks
  «الكشف بخصوص إيه؟» and stores the answer as a note.
- Durations are fixed per availability rule, so a 60-min procedure takes one
  30-min slot and queue estimates assume every patient takes the same time.
- Clinics work around it by putting price lists into knowledge docs.

Goal: a **general** catalog that fits any clinic type (aesthetic, derma, dental,
nutrition, physio, general) — clinic-defined categories + a small set of pricing
types — plus prepaid **packages** with tracked balances and a standalone **offer**
system.

## 2. Concepts in one table

|                          | Service                           | Package                             | Offer                                 |
| ------------------------ | --------------------------------- | ----------------------------------- | ------------------------------------- |
| What it is               | a treatment done in a visit       | prepaid credit bought in advance    | a time-boxed (or permanent) discount  |
| Booked in an appointment | yes, always (≥ 1 per appointment) | no — bought, then spent on services | applied to a service or package price |
| Has a balance            | no                                | yes (units or sessions)             | no                                    |
| Expires                  | no                                | yes (`validityDays`)                | optional dates                        |
| Example                  | Laser – Face, Botox, filling      | 1500 pulses / 3 months              | Black Friday 25%                      |

---

## 3. Data model

### 3.1 Categories (shared by services and packages)

```prisma
model Category {
  id        String  @id @default(uuid()) @db.Uuid
  clinicId  String  @db.Uuid
  name      String
  sortOrder Int     @default(0)
  isActive  Boolean @default(true)
  // services[], packages[], offerTargets[]
  @@unique([clinicId, name])
}
```

- One pool per clinic; every service and every package **must** pick one.
- A category in use cannot be deleted — only deactivated (or emptied first).

### 3.2 Services

```prisma
enum ServiceKind { CONSULTATION FOLLOW_UP PROCEDURE SESSION TEST }
enum PricingType { FIXED PER_UNIT STARTING_FROM TIERED AFTER_CONSULTATION FREE }

model Service {
  id               String      @id @default(uuid()) @db.Uuid
  clinicId         String      @db.Uuid
  categoryId       String      @db.Uuid
  name             String
  description      String?     // public: patient, agent, landing
  prepInstructions String?     // public: shown before/after booking
  agentNotes       String?     // AI agent only — never shown to the patient
  kind             ServiceKind
  pricingType      PricingType
  price            Decimal?    @db.Decimal(10, 2) // FIXED / STARTING_FROM: price; PER_UNIT: unit price
  unitLabel        String?     // PER_UNIT / TIERED: "نبضة" | "وحدة" | "سن" | "مل" | "حسنة"
  durationMin      Int?        // null → falls back to the rule's slot/estimated duration
  bookable         Boolean     @default(true)
  isActive         Boolean     @default(true)
  allBranches      Boolean     @default(true)
  sortOrder        Int         @default(0)
  @@unique([clinicId, name])
}

model ServiceBranch {           // availability + optional price per branch
  serviceId String  @db.Uuid
  branchId  String  @db.Uuid
  price     Decimal? @db.Decimal(10, 2)
  @@id([serviceId, branchId])
}

model ServicePriceTier {        // TIERED only: quantity brackets
  id        String  @id @default(uuid()) @db.Uuid
  serviceId String  @db.Uuid
  minQty    Int
  maxQty    Int?                // null = "and above"
  price     Decimal @db.Decimal(10, 2)   // total for the bracket
}
```

#### Branch scope

- `allBranches = true` → offered in every branch; `ServiceBranch` rows are optional
  and only **override the price** for that branch.
- `allBranches = false` → offered **only** in branches that have a `ServiceBranch`
  row (each with an optional own price).
- Admin UI: toggle "All branches / Specific branches" + per-branch price.

#### Pricing types

| Type               | Price at booking             | Final price                                       |
| ------------------ | ---------------------------- | ------------------------------------------------- |
| FIXED              | `price`                      | same                                              |
| PER_UNIT           | `unit price × estimated qty` | `unit price × actual qty` (entered at completion) |
| STARTING_FROM      | "from `price`"               | entered at completion                             |
| TIERED             | tier matching qty            | tier matching actual qty                          |
| AFTER_CONSULTATION | none ("يحدد بعد الكشف")      | entered at completion                             |
| FREE               | 0                            | 0                                                 |

**Notes for the agent**: `agentNotes` holds internal instructions for the AI
(e.g. "suggest a consultation first for first-time laser", "not for under 18",
"if asked about Full body, mention the 5000-pulse package is cheaper").

### 3.3 Practitioners and their services

- "Doctor" = **any practitioner** (doctor, nurse, technician, specialist). No new
  table. `DoctorTitle` gains `NURSE`, `TECHNICIAN`, `SPECIALIST_THERAPIST`
  (أخصائي علاج/تغذية); agent + landing present them accordingly (no "د." for a
  technician).

```prisma
model DoctorService {            // who provides what (+ optional overrides)
  doctorId    String  @db.Uuid
  serviceId   String  @db.Uuid
  price       Decimal? @db.Decimal(10, 2)
  durationMin Int?
  @@id([doctorId, serviceId])
}

model RuleService {              // optional: limit a schedule rule to some services
  ruleId    String @db.Uuid      // AvailabilityRule
  serviceId String @db.Uuid
  @@id([ruleId, serviceId])      // no rows for a rule = all the doctor's services
}
```

`Doctor.examinationFee` and `Doctor.consultationFee` are **removed** (after the
data migration, §9).

A booking line is valid only when **all** of these hold:
the branch offers the service · the practitioner provides it · the
practitioner's rule for that day/branch allows it (no `RuleService` rows, or a
matching row).

**Price resolution** (most specific wins): `DoctorService.price` →
`ServiceBranch.price` → `Service.price`. Then the active offer (§3.5), if any.

**Duration resolution**: `DoctorService.durationMin` → `Service.durationMin` →
rule default (`slotDurationMin` / `estimatedDurationMin`).

### 3.4 Packages (prepaid credit, fully tracked)

```prisma
enum CreditType { UNITS SESSIONS }

model Package {
  id           String  @id @default(uuid()) @db.Uuid
  clinicId     String  @db.Uuid
  categoryId   String  @db.Uuid
  name         String           // "1500 نبضة", "Gold"
  description  String?          // public
  terms        String?          // public: "no extension or refund after purchase"
  agentNotes   String?          // AI only
  price        Decimal @db.Decimal(10, 2)
  validityDays Int
  allBranches  Boolean @default(true)
  isActive     Boolean @default(true)
  sortOrder    Int     @default(0)
}

model PackageBranch {            // same semantics as ServiceBranch
  packageId String  @db.Uuid
  branchId  String  @db.Uuid
  price     Decimal? @db.Decimal(10, 2)
  @@id([packageId, branchId])
}

model PackageItem {              // one credit line; a package may mix lines
  id         String     @id @default(uuid()) @db.Uuid
  packageId  String     @db.Uuid
  creditType CreditType
  quantity   Int                 // 1500 pulses / 6 sessions
  categoryId String?    @db.Uuid // spendable on every service in this category…
  // …or on specific services via PackageItemService (exactly one of the two)
}

model PackageItemService {
  packageItemId String @db.Uuid
  serviceId     String @db.Uuid
  @@id([packageItemId, serviceId])
}
```

Packages are **not assigned to practitioners** — a package is sold, not
performed. Who can "use" it follows from the services its credit covers.

#### What a patient owns

```prisma
enum PatientPackageStatus { ACTIVE USED_UP EXPIRED CANCELLED }
enum PaymentStatus        { UNPAID PAID }

model PatientPackage {
  id            String  @id @default(uuid()) @db.Uuid
  clinicId      String  @db.Uuid
  patientId     String  @db.Uuid
  packageId     String  @db.Uuid
  branchId      String  @db.Uuid   // usable ONLY in this branch
  source        String             // "PURCHASE" | "OFFER" (free sessions from BUY_X_GET_Y)
  offerId       String? @db.Uuid   // offer applied at purchase
  basePrice     Decimal @db.Decimal(10, 2)  // snapshots
  pricePaid     Decimal @db.Decimal(10, 2)
  purchasedAt   DateTime
  expiresAt     DateTime
  status        PatientPackageStatus @default(ACTIVE)
  paymentStatus PaymentStatus        @default(UNPAID)
  paidAt        DateTime?
  paidConfirmedById String? @db.Uuid
  soldById      String? @db.Uuid   // null when requested by the patient (agent/web)
}

model PatientPackageBalance {    // one per PackageItem, snapshotted at purchase
  id               String @id @default(uuid()) @db.Uuid
  patientPackageId String @db.Uuid
  creditType       CreditType
  total            Int
  used             Int @default(0)
  reserved         Int @default(0)   // SESSIONS only
  // coverage (category / services) snapshotted from PackageItem
}

enum PackageLedgerType { PURCHASE RESERVE RELEASE CONSUME ADJUST EXTEND EXPIRE CANCEL }

model PackageLedger {            // every balance change, who and why (same idea as AiUnitLedger)
  id                String @id @default(uuid()) @db.Uuid
  clinicId          String @db.Uuid
  balanceId         String @db.Uuid
  appointmentItemId String? @db.Uuid
  type              PackageLedgerType
  quantity          Int              // signed
  note              String?
  createdById       String? @db.Uuid
  createdAt         DateTime @default(now())
}
```

`PatientPackage.expiresAt` holds the **last valid clinic day** (wall-clock date,
like offers). When a line could be paid by several credit lines of one package,
a SESSIONS line covering the service is used first, then a UNITS line.

#### Package rules (decided)

| Topic                               | Rule                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who can create a purchase           | staff (admin screens), **or the patient** (agent / website) by requesting a booking with package X                                                                                          |
| Payment                             | tracked separately (`paymentStatus`). An **unpaid package can still be used** — deduction is never blocked by payment. Staff confirm payment from the patient profile / completion modal    |
| Branch                              | usable **only in the branch it was bought in**                                                                                                                                              |
| Expiry                              | `expiresAt = purchasedAt + validityDays`; a booking may use it only if the visit date ≤ `expiresAt`. A daily job marks expired packages and writes an `EXPIRE` ledger row for the remainder |
| Reservation                         | SESSIONS: reserved at booking (1 per line × qty) so the last session can't be double-booked. UNITS: not reserved (amount unknown) — low-balance warning only                                |
| Completion                          | SESSIONS: consumed automatically. UNITS: actual quantity entered in the completion modal and consumed                                                                                       |
| Over the balance                    | deduct down to 0; record the rest as `uncoveredQuantity` on the visit line. **No extra charge** for now                                                                                     |
| Cancellation (any time, incl. late) | reservation **released**, nothing consumed                                                                                                                                                  |
| No-show                             | SESSIONS: **1 session consumed**. UNITS: **nothing deducted**                                                                                                                               |
| Extend / cancel / adjust            | admin or staff with `patient_packages` permission only; always a ledger row with a note                                                                                                     |
| Used up                             | status → `USED_UP` when every balance line reaches 0                                                                                                                                        |

### 3.5 Offers

```prisma
enum OfferType { PERCENT_OFF AMOUNT_OFF FIXED_PRICE BUY_X_GET_Y BONUS_UNITS }

model Offer {
  id          String    @id @default(uuid()) @db.Uuid
  clinicId    String    @db.Uuid
  name        String              // internal: "Black Friday 2026"
  label       String              // shown to patients: "خصم 25%" / "جلسة + جلسة هدية"
  type        OfferType
  value       Decimal?  @db.Decimal(10, 2) // %, amount, fixed price, or bonus units
  buyQty      Int?                // BUY_X_GET_Y
  getQty      Int?
  rewardValidityDays Int?         // BUY_X_GET_Y: validity of the free-session credit
  startsAt    DateTime?           // both null = always on
  endsAt      DateTime?
  isActive    Boolean   @default(true)   // pause / resume
  allBranches Boolean   @default(true)
  createdById String?   @db.Uuid
}

model OfferBranch { offerId String @db.Uuid; branchId String @db.Uuid; @@id([offerId, branchId]) }

model OfferTarget {               // exactly one of the three per row
  id         String  @id @default(uuid()) @db.Uuid
  offerId    String  @db.Uuid
  serviceId  String? @db.Uuid
  packageId  String? @db.Uuid
  categoryId String? @db.Uuid    // all services + packages in the category
}
```

- **Many offers per service/package**, each with its own dates and on/off switch.
  Add, edit, pause, resume, duplicate; delete only if never used (otherwise
  pause) — the service/package itself is never touched.
- **Dates are clinic calendar days**, both ends inclusive (stored as wall-clock
  dates like `Slot.date`). A **service** offer is judged on the **visit day**; a
  **package** offer on the **purchase day**. A `FIXED_PRICE` above the base price
  never raises it. The type of an offer that was already used can't be changed.
- **Status is derived**, never set by hand: Paused (`isActive=false`) · Scheduled
  (before `startsAt`) · Active (within dates, or no dates) · Expired (after
  `endsAt` — edit the dates or duplicate to reuse).
- **No overlapping offers.** Saving, editing or re-activating an offer is
  **refused** when another active (non-paused) offer covers the same target in an
  overlapping date range **and** an overlapping branch set. A category target
  overlaps the services/packages inside it. The person sees which offer blocks it,
  e.g. «يوجد عرض فعّال "Black Friday" على هذه الخدمة من 27/11 إلى 30/11».
  Consequence: at most one offer ever applies to a line — no stacking, no
  "best of" logic needed.
- Type applicability:
  - `PERCENT_OFF`, `AMOUNT_OFF`, `FIXED_PRICE` → services and packages. On
    PER_UNIT services they apply to the **unit** price.
  - `BUY_X_GET_Y` → services only. When a normally-paid line with the offer is
    completed with qty ≥ `buyQty`, the patient receives a `PatientPackage`
    (`source = OFFER`, price 0, SESSIONS × `getQty` for that service, branch =
    visit branch, validity `rewardValidityDays`).
  - `BONUS_UNITS` → packages only; adds `value` units to each UNITS credit line at
    purchase.
- Booking lines and package purchases **snapshot** `offerId` + discount, so editing
  or pausing an offer never changes history.
- Shown everywhere (agent, landing, booking UI): original price struck through,
  offer price, end date when set.

### 3.6 Appointments ↔ services

```prisma
model Appointment {
  // existing fields…  (patientNotes stays as plain notes)
  totalDurationMin Int?
  estimatedTotal   Decimal? @db.Decimal(10, 2)
  finalTotal       Decimal? @db.Decimal(10, 2)
  items            AppointmentItem[]
}

model AppointmentItem {
  id                String  @id @default(uuid()) @db.Uuid
  clinicId          String  @db.Uuid
  appointmentId     String  @db.Uuid
  serviceId         String  @db.Uuid
  doctorId          String? @db.Uuid   // v1: always the appointment's doctor
  quantity          Int     @default(1)
  // snapshots at booking
  basePrice         Decimal? @db.Decimal(10, 2)
  offerId           String?  @db.Uuid
  discount          Decimal? @db.Decimal(10, 2)
  unitPrice         Decimal? @db.Decimal(10, 2)
  total             Decimal? @db.Decimal(10, 2)  // estimated
  durationMin       Int
  // payment source
  patientPackageId  String?  @db.Uuid   // set = paid from a package
  balanceId         String?  @db.Uuid
  // completion
  finalQuantity     Int?
  finalTotal        Decimal? @db.Decimal(10, 2)
  uncoveredQuantity Int?               // used beyond the package balance
}

model Clinic {
  maxServicesPerAppointment Int?   // null = unlimited, 1 = single service
}
```

- Every appointment has **≥ 1 item**. Multiple items per appointment are
  supported; `maxServicesPerAppointment` limits it without schema changes.
- Each item is **paid normally** or **from one of the patient's active packages**
  that covers the service in that branch.
- The old rule "one open booking per doctor" is **removed**. New guard: a patient
  cannot hold **two bookings overlapping in time** (slot vs slot by time range;
  a slot inside a queue session window, or two queue bookings on the same day
  with overlapping session windows, also count as overlapping).

### 3.7 Scheduling: duration drives the schedule

- Appointment duration = sum of item durations.
- **Slot days**: an appointment occupies `ceil(duration / slotDurationMin)`
  **consecutive** slots of the same rule (contiguous, unblocked, inside working
  hours; non-referral for patients).
  - `Slot.appointmentId` (nullable) links every occupied slot;
    `Appointment.slotId` remains the starting slot (existing code keeps working).
  - Availability only offers start times where the whole duration fits.
  - Claiming the slots is one transaction — concurrent bookings can't overlap.
  - Reschedule and cancel move/free all occupied slots.
- **Queue days** (order / arrival):
  - Expected time = session start + actual durations of the bookings ahead.
  - Daily cap per rule, selectable: **none · number of patients · total minutes**
    (`capType`, `dailyCap`, `dailyCapMinutes`), snapshotted onto the day queue
    like today; minutes are claimed atomically (`bookedMinutes`) the same way
    `nextOrder` is today.

### 3.8 Completion modal

Opens when an appointment is marked **completed** — from the appointment page,
the doctor's queue panel and the queue's "complete & next".

| Line type                          | Input                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| FIXED / FREE                       | none — confirm                                                           |
| PER_UNIT / TIERED                  | actual quantity (**required**)                                           |
| STARTING_FROM / AFTER_CONSULTATION | final price (required)                                                   |
| From a UNITS package               | actual units; shows balance before → after, and uncovered amount if over |
| From a SESSIONS package            | none — 1 session consumed                                                |

Also in the modal: remove a line that wasn't done · add a line decided on the
spot · confirm an unpaid package's payment. Consumption, `BUY_X_GET_Y` rewards and
ledger rows are written in the same transaction as the status change.

---

## 4. Permissions (branch-scoped, same model as doctors)

New keys in `lib/permissions.ts`:

| Key                | Covers                                        | Scope  |
| ------------------ | --------------------------------------------- | ------ |
| `services`         | categories, services, packages (catalog)      | branch |
| `offers`           | offers only (e.g. a marketing role)           | branch |
| `patient_packages` | sell, confirm payment, adjust, extend, cancel | branch |

For a member limited to some branches (follows `doctorInScope` /
`doctorOnlyInScope` / `mergeDoctorBranches` in `server/services/branchScope.ts`):

| Item                                   | View         | Edit                                                                         |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Categories                             | yes          | no — clinic-wide, all-branch members only                                    |
| Service/package in all branches        | yes          | only their branches' price override                                          |
| Service/package only in their branches | yes          | fully                                                                        |
| Service/package in theirs + others     | yes          | only their part; can't remove other branches or delete                       |
| Service/package not in their branches  | hidden       | no                                                                           |
| Offer for all branches / outside scope | yes / hidden | no                                                                           |
| Offer limited to their branches        | yes          | yes                                                                          |
| Selling / adjusting packages           | —            | only `PatientPackage.branchId` in scope                                      |
| Completion modal                       | —            | follows the appointment's scope (`appointments`); doctors complete their own |

New tables get clinic-isolation RLS like the inbox tables, and every server action
runs an `…InScope` guard. Patients and the agent are not affected by staff
permissions — they see what is available in the branch being booked.

---

## 5. AI agent

| Tool                                                   | Change                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `search_services(query?, categoryId?, branchId?)`      | new — catalog with resolved branch price, active offer, unit, tiers summary                                                       |
| `get_service(serviceId)`                               | new — full details incl. branches/prices, prep instructions, `agentNotes`                                                         |
| `list_service_providers(serviceId, branchId?)`         | new — practitioners offering it (+ their price)                                                                                   |
| `list_packages(categoryId?, branchId?)`                | new — packages for sale, with terms and offer                                                                                     |
| `list_my_packages`                                     | new — patient's packages: balance, expiry, payment status, usage history                                                          |
| `get_doctor_working_hours` / `get_doctor_availability` | + `serviceIds`: only rules allowing them, start times where the full duration fits                                                |
| `book_appointment` / `book_order_appointment`          | + `items: [{ serviceId, quantity, patientPackageId? }]` (required); + optional `buyPackageId` to request a new package and use it |
| `list_doctors`                                         | + each practitioner's services                                                                                                    |
| `list_my_appointments` / appointment card              | + items, prices, package usage; `examinationFee` removed                                                                          |

Prompt flow:

1. **Default — service first**: patient names a service → `search_services` →
   branch (if unknown) → `list_service_providers` → offer practitioners or "first
   available" → availability → book.
2. **Favorite practitioner**: patient names both → verify the practitioner offers
   it in that branch → book, or explain and suggest who does.
3. **Unsure what they need** → offer a `CONSULTATION` service first.
4. **Has an active package covering the service** → ask: use the package (show
   balance + expiry) or pay separately.
5. Wants a new package → `list_packages`, show terms → booking with
   `buyPackageId` (created unpaid; staff confirm payment).
6. Remove «الكشف بخصوص إيه؟» and every كشف/استشارة price wording; `agentNotes`
   from services/packages are injected via the tools.

---

## 6. Screens

- **Admin → Services**: categories (CRUD, order), services (form: category, kind,
  pricing type + tiers, unit, duration, branches + prices, practitioners,
  description / prep / agent notes), packages (credit lines, coverage, validity,
  branches + prices, terms, agent notes), offers (list with derived status, form
  with targets/branches/dates, duplicate, pause/resume, overlap error),
  clinic-type templates.
- **Doctor form**: "Services" tab replaces the two fee inputs (assign services,
  optional price/duration override). Doctor's own profile shows services
  read-only.
- **Availability rule form**: optional "Only these services"; cap type
  none / patients / minutes.
- **Manual booking (admin/staff)**: patient → services cart (each line: pay
  normally / use active package / sell new package now) → practitioner (filtered
  by services + branch) → time (fits total duration).
- **Appointment detail**: items, prices, package usage, totals; completion modal.
- **Patient profile (admin)**: packages, balances, ledger, sell package, confirm
  payment, adjust / extend / cancel.
- **Patient portal**: "My visits" with services, quantities and how each was paid;
  "My packages" with balance, expiry and usage history; request a package.
- **Web booking modal**: services (or package) first → practitioner → time.
- **Landing**: service catalog by category with prices/offers; doctor cards and
  solo-doctor section show services instead of the كشف price.
- **Chat tool cards**: services, package balance.
- **Reports**: package sales, package consumption, offer usage — per branch.

## 7. Clinic-type templates

Dental · Aesthetic & derma · Nutrition · General · Physio. Applying a template
creates its categories and typical services (kind, pricing type, unit, duration;
**no prices**). Idempotent — existing names are skipped. Afterwards it is ordinary
editable data.

## 8. Background jobs

- Daily: expire packages (`EXPIRE` ledger rows, status → `EXPIRED`).
- Offer status needs no job (derived from dates at read time).
- No-show sweep (existing) also applies the no-show package rule.

## 9. Migration

Following the project rule: **local DB first, never hosted without an explicit ask**
(and the shadow-DB workaround in `prisma/README.md`).

1. Create a `"عام"` category + clinic services **كشف** (`CONSULTATION`) and
   **استشارة** (`FOLLOW_UP`) for every clinic that has fees.
2. For every doctor with `examinationFee` / `consultationFee`, create
   `DoctorService` rows with those prices.
3. Backfill one `AppointmentItem` (كشف, doctor's examination fee as snapshot) for
   existing appointments so every appointment has ≥ 1 item.
4. Switch all readers to services; then drop `examinationFee` / `consultationFee`.

No clinic's catalog data is loaded by the migration.

---

## Not in this phase

Decided explicitly — recorded so they can be added later without redesign.

| Topic                                                                                                                                             | Decision now                                                                                                                   | How it would be added later                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Devices / equipment as a schedulable resource** (e.g. a branch with one laser machine shared by two technicians — both could be booked at 4:00) | **Ignored.** Only the practitioner's availability is checked; the device is part of the service name (e.g. "Laser – Device A") | `DeviceType (clinicId, name)`, `BranchDevice (branchId, deviceTypeId, count)`, `ServiceDevice (serviceId, deviceTypeId)`; availability/booking additionally checks `in-use < count` for the device in that branch at that time. Optional — services without a device unaffected |
| Charging usage beyond a package balance                                                                                                           | not charged                                                                                                                    | `AppointmentItem.uncoveredQuantity` is already recorded; price it at the service unit price                                                                                                                                                                                     |
| Using a package in another branch                                                                                                                 | not allowed                                                                                                                    | relax the `PatientPackage.branchId` check / add a per-package flag                                                                                                                                                                                                              |
| Online payment                                                                                                                                    | none — staff confirm payment                                                                                                   | `PaymentStatus` already separate from usage                                                                                                                                                                                                                                     |
| Different practitioners per line in one appointment                                                                                               | all lines use the appointment's doctor                                                                                         | `AppointmentItem.doctorId` already exists                                                                                                                                                                                                                                       |

## Coverage by clinic type

Each common pricing pattern maps onto the model without clinic-type-specific code:

| Pattern                                   | Example                                                         | Model                                             |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Fixed price                               | كشف, PRP session, teeth cleaning                                | FIXED service                                     |
| Price per unit                            | laser per pulse, Botox per unit, dental per tooth/canal, per ml | PER_UNIT service + `unitLabel`                    |
| Price by quantity bracket                 | lesion removal 1–5 / 6–10 / >10                                 | TIERED service                                    |
| Price decided after examination           | root canal, braces, surgery                                     | AFTER_CONSULTATION / STARTING_FROM                |
| Variants (area, brand, size)              | laser Face vs Full legs; filler brand; 1ml vs 2ml               | separate services in one category                 |
| Different price / availability per branch | multi-branch chains                                             | `allBranches` + `ServiceBranch` / `PackageBranch` |
| "Before discount" price                   | promotional price lists                                         | base price + FIXED_PRICE offer                    |
| Session + free session                    | peeling, physio                                                 | BUY_X_GET_Y offer                                 |
| Limited-time / branch-only discount       | seasonal campaigns                                              | offer with dates + `OfferBranch`                  |
| Prepaid units                             | pulse packages with validity                                    | Package with UNITS line                           |
| Prepaid sessions / programs               | physio 10 sessions, monthly nutrition follow-ups                | Package with SESSIONS line(s)                     |
| Mixed bundle                              | 3 laser sessions + 1 PRP                                        | Package with several lines                        |
| Follow-up vs first visit                  | كشف / استشارة                                                   | CONSULTATION / FOLLOW_UP services                 |

---

## Implementation progress

Branch: `feat/services-packages` (from `dev`).

| #   | Step                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema + migration (`20261120000001_services_packages`) + practitioner titles                 | **Done** — applied to the local DB and data migration verified (2026-11-20)                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Categories, services, branches, practitioner assignment (admin)                               | **Done** — `/admin/services` (categories, services, branch scope + prices, tiers, practitioners), doctor page "الخدمات" tab, permission keys `services`/`offers`/`patient_packages`; fee inputs removed from the admin doctor forms                                                                                                                                                                                                                       |
| 3   | Offers                                                                                        | **Done** — `/admin/services/offers` (list with derived status + filters, form, pause/resume, duplicate as paused, delete only if unused, overlap refusal), `offers` permission tab; pricing helpers `loadLiveOffers` / `offerForItem` for steps 4–5                                                                                                                                                                                                       |
| 4   | Booking engine: items, consecutive slots, queue minutes cap, overlap guard                    | **Done** — `server/services/booking.ts` (line resolver + price/offer/duration snapshots, consecutive-slot claim, queue none/patients/minutes cap, patient overlap guard, release on cancel, reschedule keeps services), duration/service-aware availability, expected times from real minutes, rule form: cap type + \"only these services\"                                                                                                              |
| 5   | Packages: sale, pending payment, balance, reserve/consume, no-show, expiry                    | **Done** — `/admin/services/packages` (credit lines units/sessions, coverage category or services, branch prices, validity, terms), patient profile section (sell with offer/bonus preview, confirm payment, adjust, extend/re-open, cancel, ledger), booking lines paid from a package (session reserved atomically; reschedule reuses it), release on cancel, consume on completion/no-show, expiry in the hourly sweep                                 |
| 6   | Completion modal                                                                              | **Done** — `server/services/completion.ts` + shared `CompleteVisitDialog` (admin board, admin queue \"next\", doctor's list): actual units / final prices, remove or add lines (paid normally or from a package), confirm unpaid packages, BUY_X_GET_Y rewards, final totals; appointment page lists the visit's services                                                                                                                                 |
| 7   | Permissions (`services`, `offers`, `patient_packages`)                                        | **Done** — keys + branch scope enforced in every catalog / offer / package action (built with steps 2, 3, 5); RLS on the new tables (step 1); team role editor lists them automatically                                                                                                                                                                                                                                                                   |
| 8   | AI agent tools + prompt                                                                       | **Done** — `agent/tools/services.ts` (search_services, get_service, list_service_providers, list_packages), patient list_my_packages + request_package, booking tools take `items` (+ patientPackageId), service-aware working hours / availability, doctor lists show services, booking card shows lines + total, chat cards for services / packages; prompt rewritten service-first (favourite practitioner, use package or pay, no «الكشف بخصوص إيه؟») |
| 9   | Web booking, patient portal, landing (incl. replacing hardcoded "د." with `practitionerName`) | **Done** — booking modal (patient + admin dialog): services step → service-aware days/slots/queue → priced confirm (branch price, offer, pay from a package); landing: services & packages catalog (book a service → pick practitioner; request a package), patient \"باقاتي\", services on the patient's appointments, doctor cards / solo section show services; reports: service revenue, package sales / use, offer usage per branch                  |
| 10  | Clinic-type templates                                                                         | todo                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 11  | Drop `Doctor.examinationFee` / `consultationFee`                                              | todo                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Next action: step 10 (clinic-type templates) then step 11 (drop the fee columns).

A booking that sends no services (only API callers now — the agent, the web
modal and the admin dialog all send them) gets the practitioner's default line:
their كشف (CONSULTATION) service, or their only service.

Behavior change introduced in step 1: cancelling an appointment now frees its
slot(s) (`Slot.heldById`); before, a cancelled booking kept the slot taken
forever. `Appointment.slotId` is no longer unique — it is the first slot of the
visit and stays on cancelled appointments as history.

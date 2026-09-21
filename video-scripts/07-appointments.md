# Clip 07 — Appointments (verify the AI's booking, confirmation reminder, doctor queue)

**Screen:** `/admin/appointments` (the board) → appointment details modal → cut to mobile (WhatsApp reminder + patient reply) → back to board (status flips) → `/admin/doctors/[فؤاد الصياد]?tab=queue` (الدور tab)
**Motion:** Running — this is the clip that closes the loop on Clip 06's booking.

**Beats:**

0. Transition in from Clip 06's conversation, spoken over the cut
1. Click "المواعيد" in sidebar → board shown with 5 columns: قيد الانتظار, مؤكد, مكتمل, ملغي, لم يحضر.
2. Click the card for the patient/booking from Clip 06 → "تفاصيل الموعد" modal opens.
3. Modal shows: الدكتور فؤاد الصياد، فرع المهندسين، دور رقم 1، الحالة **قيد الانتظار** — proof the AI booked it correctly (matches exactly what it told the patient in the chat).
4. Cut to mobile: the automated WhatsApp reminder arrives (this is the `CONFIRM_REMINDER` template — its exact wording is whatever your clinic's template says, since it's admin-configurable per clinic, not hardcoded).
5. Patient replies from their phone confirming they're coming.
6. Back in the system: the appointment's status flips from **قيد الانتظار → مؤكد** — the AI reads the reply itself (via a `confirm_appointment` tool) and updates the status; no admin touches anything.
7. Navigate to doctors → فؤاد الصياد's profile → الدور tab.
8. The queue/order panel is shown: who's being served now, who's next, how many are booked vs. the daily cap, and the ordered patient list (this patient is in it).

## Script

0. وعشان نتأكد إن كل ده اشتغل صح... يلا نفتح صفحة المواعيد.
1. المواعيد... هنا بتشوف كل حجوزات العيادة، مقسّمة قيد الانتظار، مؤكدة، مكتملة، ملغاة، ولو حد ماجاش.
2. نفتح تفاصيل الحجز اللي عملناه في المحادثة اللي فاتت.
3. الدكتور فؤاد الصياد، فرع المهندسين، دور رقم واحد... والحالة لسه قيد الانتظار.
4. لسه محتاجين تأكيد من المريض... فالنظام بيبعتله رسالة تذكير على واتساب.
5. وهو من موبايله... بيأكد إنه هيحضر.
6. على طول... حالة الموعد بتتغير من قيد الانتظار لمؤكد، من غير ما حد من العيادة يلمس حاجة.
7. ونرجع لصفحة الدكتور فؤاد الصياد... ونفتح خانه الدور.
8. من هنا بيتابع الطابور بالكامل... مين بيتكشف دلوقتي، ومين جاي بعده، وعدد الحجوزات لكل يوم.

## Durations

| Beat | Words | @2.2 wps | @2.5 wps | Action                            |
| ---- | ----- | -------- | -------- | --------------------------------- |
| 0    | 11    | 5.0s     | 4.4s     | Transition from Clip 06           |
| 1    | 15    | 6.8s     | 6.0s     | Sidebar click → board (5 columns) |
| 2    | 9     | 4.1s     | 3.6s     | Click the booking's card          |
| 3    | 12    | 5.5s     | 4.8s     | Details modal contents            |
| 4    | 11    | 5.0s     | 4.4s     | Cut to mobile, reminder arrives   |
| 5    | 6     | 2.7s     | 2.4s     | Patient replies confirming        |
| 6    | 17    | 7.7s     | 6.8s     | Status flips Pending → Confirmed  |
| 7    | 8     | 3.6s     | 3.2s     | Navigate to doctor's الدور tab    |
| 8    | 15    | 6.8s     | 6.0s     | Queue panel shown                 |

**Raw speaking time:** ~41.6–47.3s
**With pauses (~0.3s × 8 gaps):** **≈ 44–50s total.**

Beat 6 is the payoff of this whole clip — it's the second time in the video the system changes state on its own from a WhatsApp reply (booking in Clip 06, confirmation here), which is the real proof point of "no one on staff is touching this." Give it the same slight lift you gave the branch-hours error in Clip 05 and the AI-feeds-the-assistant line in Clip 04.

## TTS notes

- Stability: 45–50%, style 0–5% for beats 1–5 and 7–8 (steady walkthrough).
- Beat 6: style ~10%, and don't rush "من غير ما حد من العيادة يلمس حاجة" — let it land as the sentence it's building to.
- Keep the `...` pauses — beat 4→5→6 is a three-step mini-story (reminder sent → patient replies → status changes) and the pauses are what make it read as a sequence rather than a list.

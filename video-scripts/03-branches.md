# Clip 03 — Branches

**Screen:** `/admin/branches` — الفروع (branch cards) → opens "تعديل الفرع" modal on one branch
**Motion:** Running — a real action sequence, in this order (from your description):

0. Transition in from Clip 02 (specialties) — spoken over the hard-cut, before the branches page settles on screen
1. Page shown (branch cards)
2. Open the edit modal on a branch
3. Add a phone number (فتح صف رقم جديد في قسم "أرقام هواتف الفرع")
4. Remove that same phone number
5. Show the working-hours section (ساعات العمل)
6. Save (حفظ التعديلات)
7. Open the edit modal on a **different** branch, then close it

The script below has one line per beat, in the same order, so you can cut narration-to-action 1:1.

## Script

0. وبعد ما تظبط التخصصات... يجي دور الفروع.
1. الفروع... لو عيادتك ليها أكتر من فرع، تقدر تدير كل فرع لوحده من هنا.
2. تدوس تعديل... وتفتح كل بيانات الفرع ده.
3. تضيف رقم تليفون جديد للفرع في ثانية...
4. ولو غلطت أو مش محتاجه، تشيله بضغطة واحدة.
5. وتحت... بتحدد ساعات شغل الفرع يوم بيوم.
6. والساعات دي مش شكل بس... النظام بيستخدمها يتأكد إن مواعيد الدكاترة جوه وقت شغل الفرع.
7. تحفظ... وخلاص، التعديلات اتسجلت.
8. ونفس الطريقة بالظبط لأي فرع تاني عندك.

## Durations

| Beat | Line | Words | @2.2 wps | @2.5 wps | Action it covers                                                                        |
| ---- | ---- | ----- | -------- | -------- | --------------------------------------------------------------------------------------- |
| 0    | 0    | 7     | 3.2s     | 2.8s     | Transition from Clip 02                                                                 |
| 1    | 1    | 14    | 6.4s     | 5.6s     | Branch cards on screen                                                                  |
| 2    | 2    | 7     | 3.2s     | 2.8s     | Click "تعديل" → modal opens                                                             |
| 3    | 3    | 7     | 3.2s     | 2.8s     | Click "إضافة رقم", type a number                                                        |
| 4    | 4    | 8     | 3.6s     | 3.2s     | Click the ✕ on that phone row                                                           |
| 5    | 5    | 7     | 3.2s     | 2.8s     | Scroll to / reveal ساعات العمل                                                          |
| 6    | 6    | 15    | 6.8s     | 6.0s     | Hold on hours section (toggle a day if you want the line to have something to point at) |
| 7    | 7    | 4     | 1.8s     | 1.6s     | Click "حفظ التعديلات"                                                                   |
| 8    | 8    | 7     | 3.2s     | 2.8s     | Open another branch's edit modal, then close it                                         |

**Raw speaking time:** ~30.8–34.2s
**With pauses (~0.3s × 8 gaps):** **≈ 33.2–36.6s total.**

Practical note: beat 6 is the longest line (15 words, ~6–7s) sitting on what's probably your shortest action (just looking at the hours table). Two ways to fix the mismatch, pick whichever fits your footage:

- **Slow down the screen action** — pause on the hours section a beat longer, maybe toggle one day from "مفتوح" to "مغلق" and back, so there's something happening while the line plays.
- **Split the line** — say "وتحت... بتحدد ساعات شغل الفرع يوم بيوم" (beat 5) while hours first appear, then hold beat 6's "مش شكل بس" line until you're already mid-save, letting it bleed slightly into beat 7's action instead of demanding its own dead-air segment.

Either way, don't record beat 6 to play entirely before you move the cursor — 6–7 seconds of a static table with no cursor movement will feel like a stall.

## TTS notes

- Stability: 45–50% throughout — this clip is explaining features, not hooking attention, so keep delivery steady and confident rather than punchy.
- Style exaggeration: 0–5%, except a slight lift on beat 6 ("مش شكل بس") — that's the one line making a real claim (hours actually gate booking, not decorative), so it earns a touch more emphasis than the rest.
- `...` pauses after lines 1, 2, 3, 5, 7 mark where the on-screen click/action should land — generate with those pauses intact rather than stripping the ellipses.

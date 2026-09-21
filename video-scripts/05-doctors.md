# Clip 05 — Doctors (profile → edit → availability rules)

**Screen:** `/admin/doctors` → doctor row click → `/admin/doctors/[id]` (فؤاد الصياد) → edit modal → scroll to "قواعد التوفر" (the `AvailabilityRulesEditor` embedded at the bottom of the edit-doctor modal, not the separate Rules tab)
**Motion:** Running — this is your longest and most feature-dense clip, matching your described action sequence exactly:

0. Transition in from Clip 04 (clinic info), spoken over the cut
1. Click "الأطباء" in sidebar → doctors list shown
2. Click doctor row **فؤاد الصياد** → doctor profile page opens
3. Open edit-doctor modal (pencil icon) → all doctor fields shown
4. Scroll to bottom of modal → قواعد التوفر (availability rules) section
5. Open نظام الجدولة dropdown → choose "نظام الدور (طابور)" (order-based)
6. Pick branch, day, start time, end time
7. Set دقائق الكشف التقديرية and الحد الأقصى للحجوزات to values that overflow (e.g. 50 × 20) — on-screen warning banner appears, real text: _"تنبيه: 50 مريض × 20 دقيقة = 16 ساعات و40 دقيقة، وهي تتجاوز نافذة العمل [X ساعات]. يتّسع الوقت لـ [N] مريض فقط — قلّل الحد الأقصى أو دقائق الكشف، أو وسّع وقت النهاية."_
8. Fix it: cap → 20, exam minutes → 20 → banner turns green/ok
9. Referral-only + note fields shown, left untouched
10. Click "إضافة قاعدة" → **error**, real text: _"الفرع يعمل يوم [اليوم] من [HH:MM] إلى [HH:MM] فقط."_ (the chosen start/end fall outside that branch's hours for that day)
11. Fix the rule's start/end to sit inside the branch's window, click add again → succeeds
12. Click "حفظ التعديلات" to save the doctor
13. Open the "قواعد التوفر" tab on the doctor page → the new rule is listed

## Script

0. دلوقتي... نيجي لأهم عنصر في العيادة، الأطباء.
1. الأطباء... هنا بتشوف كل دكاترة العيادة في صفحة واحدة.
2. تدوس على أي دكتور... زي الدكتور فؤاد الصياد... عشان تشوف بروفايله بالكامل.
3. من هنا تقدر تعدّل بيانات الدكتور... الاسم، التخصص، الخبرة، وأسعار الكشف والاستشارة.
4. ونزّل تحت... هتلاقي قواعد التوفر بتاعته.
5. تقدر تختار نظام الحجز... مواعيد بأوقات ثابتة، أو نظام الدور.
6. خلّينا نختار نظام الدور... وتحدد الفرع، واليوم، ووقت البداية والنهاية.
7. وتحدد كام دقيقة تقريبًا للكشف... وأد إيه أقصى عدد حجوزات في اليوم.
8. يعني هنا... 50 مريض في 20 دقيقة يبقى 16 ساعة و40 دقيقة... أكتر من وقت دوام الفرع، فالنظام بينبهك على طول.
9. نظبطها... 20 حجز بس، و20 دقيقة للكشف، وتبقى مظبوطة.
10. وفيه كمان خيار تحويلات فقط... وملاحظة لو حابب تضيف تفاصيل.
11. تدوس إضافة قاعدة...
12. ولو وقت القاعدة برّه ساعات عمل الفرع... النظام بيوقفك ويقولك الفرع شغال من الساعة كذا لحد كذا بس.
13. تظبط الميعاد يكون جوه وقت الفرع... وتضيف تاني.
14. تحفظ التعديلات...
15. وتدوس على تبويب قواعد التوفر... عشان تتأكد إن القاعدة اتضافت صح.

## Durations

| Beat | Words | @2.2 wps | @2.5 wps | Action it covers                       |
| ---- | ----- | -------- | -------- | -------------------------------------- |
| 0    | 7     | 3.2s     | 2.8s     | Transition from Clip 04                |
| 1    | 9     | 4.1s     | 3.6s     | Sidebar click → doctors list           |
| 2    | 12    | 5.5s     | 4.8s     | Click فؤاد الصياد → profile page       |
| 3    | 12    | 5.5s     | 4.8s     | Open edit modal, fields visible        |
| 4    | 6     | 2.7s     | 2.4s     | Scroll to availability rules           |
| 5    | 10    | 4.5s     | 4.0s     | Open نظام الجدولة dropdown             |
| 6    | 10    | 4.5s     | 4.0s     | Choose order-based, branch, day, times |
| 7    | 12    | 5.5s     | 4.8s     | Type exam minutes + daily cap          |
| 8    | 21    | 9.5s     | 8.4s     | Overflow warning banner shown          |
| 9    | 9     | 4.1s     | 3.6s     | Correct to 20/20 → ok banner           |
| 10   | 10    | 4.5s     | 4.0s     | Referral-only + note fields shown      |
| 11   | 3     | 1.4s     | 1.2s     | Click إضافة قاعدة                      |
| 12   | 18    | 8.2s     | 7.2s     | Branch-hours error appears             |
| 13   | 8     | 3.6s     | 3.2s     | Fix start/end, add again → success     |
| 14   | 2     | 0.9s     | 0.8s     | Click حفظ التعديلات                    |
| 15   | 11    | 5.0s     | 4.4s     | Open قواعد التوفر tab → rule listed    |

**Raw speaking time:** ~64–73s
**With pauses (~0.3s × 15 gaps):** **≈ 69–77s total.**

This is by far your longest clip, but that tracks — the real footage (opening a modal, filling ~6 fields, reading a warning, correcting it, hitting an error, correcting that too, saving, then switching tabs) genuinely takes over a minute to perform on screen. Don't try to compress the narration to "catch up" to a shorter cut — if your actual footage runs shorter than ~65–74s, cut the script instead of speeding up the read:

- **First to cut:** beat 10 (referral-only/note callout) — it's the only beat describing fields that are shown but never touched, so it's the least essential to the story.
- **Second to cut:** merge beats 8+9 into one line ("يعني 50 مريض في 20 دقيقة... مش هتزبط، فنظبطها 20 و20 وتبقى مظبوطة") if you want the whole warning→fix beat tighter.

Don't cut beat 12 (the branch-hours error) — that's the clip's actual payoff: proof the system stops you from creating an impossible schedule, not just decoration.

## TTS notes

- Stability: 45–50% for the walkthrough lines (1–7, 9–11, 13–15) — informational, steady pace.
- Style exaggeration: 0–5% baseline, lift to ~10% on beats 8 and 12 — those are the two "look, it actually catches mistakes" moments and are the ones worth a slight edge in delivery, same treatment as the payoff lines in clips 03 and 04.
- Numbers (50, 20, 16 ساعة و40 دقيقة) should be generated as written, not abbreviated — v3 reads Arabic numerals naturally, but double-check the output since this is the one clip with several numbers back-to-back.
- Keep every `...` — with 14 beats chained together, the pauses are what stop this from sounding like a run-on lecture.

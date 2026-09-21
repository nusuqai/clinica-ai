# Clip 06 — Messages (patient ↔ AI conversation)

**Screen:** `/admin/messages` — click "الرسائل" in sidebar → click the patient's conversation row → chat opens. Split-screen with the mobile screen-recording of the same WhatsApp conversation playing alongside the admin inbox view.
**Motion:** Running.

**Opening beats (before the conversation plays):**

1. Click "الرسائل" in the sidebar → the conversations list appears (all patients who've messaged).
2. Click on this patient's row → their thread opens on the right, mobile recording starts alongside it.

**Single voice, single generation** — same narrator and same settings as every other clip, one paste into the UI. The narrator tells the story of the conversation while the real messages play on screen; the viewer reads the actual Arabic text in the bubbles at their own pace, so nothing is lost by not dubbing each message word-for-word.

## Script

0. وكل الجدول ده... من غير حجز حقيقي مش هينفع. يلا نشوفه بيحصل إزاي.
1. من صفحة الرسائل... بتتابع كل محادثة مع المريض، لحظة بلحظة.
2. المريض بيكتب على واتساب إنه عايز يعمل ليزك.
3. والمساعد الذكي بيرد عليه على طول... الدكتور فؤاد الصياد، استشاري تصحيح إبصار، وبيشتغل في فرعين.
4. بيسأله عايز تحجز؟ يقوله اه... فيقوله مواعيده، ونظام الحجز عنده بالدور.
5. المريض يطلب يحجز النهارده... والمساعد يحجزله في ثانية.
6. ويقوله دورك رقم واحد، والكشف الساعة عشرة، والانتظار حوالي عشرين دقيقة... وعنوان الفرع كمان.
7. وحتى لما سأله يوصل إزاي... قاله المترو ينزل فين، ويمشي كام دقيقة، وبعتله الخريطة.
8. كل ده... حصل لوحده، من غير ما حد من فريق العيادة يرد يدوي.

## Timing the narration to the messages

The conversation on screen has to stay roughly in step with what's being said. Rough mapping:

| Line | What should be on screen                                                    |
| ---- | --------------------------------------------------------------------------- |
| 0–1  | Sidebar click → conversation list → thread opens                            |
| 2    | Patient's first message ("لو سمحت كنت عايز اكشف ليزك")                      |
| 3    | AI's reply naming د. فؤاد الصياد and the two branches                       |
| 4    | Patient's "اه" → AI's reply with Saturday hours + queue system              |
| 5    | Patient's "تمام احجزلي معاه النهارده"                                       |
| 6    | **The booking confirmation** — order number 1, 10:00, ~20 min wait, address |
| 7    | Patient asks for directions → AI's metro/walking directions + map link      |
| 8    | Final thank-you exchange, then hold                                         |

If the real recording runs longer than the narration, slow the message playback or hold on the booking confirmation (line 6) — that's the moment worth lingering on. Don't speed the messages up to catch the VO; a viewer who can't read the confirmation bubble misses the point of the clip.

## Durations

| Line | Words | @2.2 wps | @2.5 wps |
| ---- | ----- | -------- | -------- |
| 0    | 13    | 5.9s     | 5.2s     |
| 1    | 10    | 4.5s     | 4.0s     |
| 2    | 8     | 3.6s     | 3.2s     |
| 3    | 15    | 6.8s     | 6.0s     |
| 4    | 11    | 5.0s     | 4.4s     |
| 5    | 8     | 3.6s     | 3.2s     |
| 6    | 14    | 6.4s     | 5.6s     |
| 7    | 14    | 6.4s     | 5.6s     |
| 8    | 13    | 5.9s     | 5.2s     |

**Raw speaking time:** ~42.4–48.2s
**With pauses (~0.3s × 8 gaps):** **≈ 45–51s total.**

Line 6 (the booking landing) and line 8 (the closing "nobody touched this") are the two beats carrying the clip. Line 8 especially — it's the thesis of the whole video, and it gets echoed by clip 07's status-flip line.

## TTS notes

- Same voice and same settings as all other clips (Multilingual v2, stability 50%, similarity 75%, style 0–5%, speaker boost on) — consistency across clips matters more than tuning this one.
- Keep every `...` — lines 3, 5, 6, 7 use them to separate the patient's action from the AI's response within a single sentence, which is what keeps a one-voice retelling from blurring the two sides together.
- Line 8 should land slower and slightly warmer than the rest. It's the payoff.

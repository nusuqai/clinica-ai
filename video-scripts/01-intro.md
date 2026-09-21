# Clip 01 — Intro

**Screen:** لوحة تحكم الأدمن (`/admin`) — نظرة عامة (KPI cards + آخر النشاطات)
**Motion:** فريز (Frozen). صورة ثابتة للوحة، من غير أي حركة كيرسور أو أكشن حقيقي.
Since it's static for ~13–16 seconds, don't leave it as a dead screenshot — add a slow Ken Burns zoom-in (start ~102% → end ~112%, whole clip length) so it reads as "alive" while the VO is doing all the work. Optional: a soft glow/highlight pulse on the "لوحة التحكم" title exactly when the brand name is said (line 4), so the visual pops the instant the brand lands.

## Script

1. لو عيادتك بتستقبل حجوزات، ورسايل مرضى، ومواعيد دكاترة كل يوم...
2. وانت اللي بتتابع كل ده بنفسك...
3. في نظام بيعمل كل ده مكانك.
4. ده كلينيكا إيه آي.
5. منصة واحدة... بتدير عيادتك بالكامل.

## Durations

| Line | Words                                 | Est. seconds (@2.2 wps) | Est. seconds (@2.5 wps) |
| ---- | ------------------------------------- | ----------------------- | ----------------------- |
| 1    | 10                                    | 4.5                     | 4.0                     |
| 2    | 6                                     | 2.7                     | 2.4                     |
| 3    | 6                                     | 2.7                     | 2.4                     |
| 4    | 4 (brand — say slower, don't rush it) | 2.5*                    | 2.2*                    |
| 5    | 5                                     | 2.3                     | 2.0                     |

*Line 4 is the brand reveal — treat it as its own beat, not a fast line. Even though it's only 4 words, give it ~2.5s minimum with a beat of silence right before it.

**Raw speaking time:** ~14.7–15.0s
**With natural pause after each line (~0.3–0.4s × 4 gaps) + a longer ~0.6s beat before line 4:** **≈ 16.5–17s total**

So: cut the clip to **~17 seconds**, hold the frozen dashboard for the full duration (the zoom handles the visual pacing, no need to cut away), and hard-cut to Clip 02 right as line 5 ends — that's your trigger to go from "frozen brand hook" into the first "running" tour clip.

## TTS notes (Eleven v3, per your ElevenLabs setup)

- Stability: 40–50% — this line needs warmth and a slight rise in energy toward the brand name, not flat delivery.
- Style exaggeration: 0–10%, but nudge toward 10% for line 4 (the brand name) so it lands with a touch more confidence/punch than the rest.
- Slight pause markers: insert `...` (as written above) at lines 1, 3, and 5 — v3 reads these as natural breath pauses, which is what gives the "hook → problem → reveal" rhythm instead of a monotone read.
- Don't rush line 4. If the model reads it too fast, split it into its own generation request so it doesn't inherit the pacing of line 3.

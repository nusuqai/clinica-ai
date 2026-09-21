# Video scripts — ClinicaAI demo

One file per clip, numbered in the order they play in the final edit. Each file has the same shape:

- **Screen** — what's on screen (page/section)
- **Motion** — frozen (paused screenshot, maybe a slow zoom) or running (a live action happening: typing, clicking, a slot being added, a WhatsApp message arriving, etc.)
- **Script** — the Egyptian-Arabic narration, line by line (line breaks = natural pause points for the VO)
- **Duration** — estimated spoken length at ~2.2–2.5 words/sec, plus notes on where the clip needs to hold or cut
- **TTS notes** — ElevenLabs settings for that line's tone

## Clips are linked, not standalone

From clip 02 onward, each script opens with a short **transition/bridge line** (labeled line/beat "0", or folded into the existing opening line where noted) that references the _previous_ clip's topic before introducing its own. These are written to be spoken right over the hard-cut between clips, so the narration reads as one continuous voice touring the app rather than eight separate intros. Clip 01 needs no incoming bridge (it's the start), and clip 08's opening line does double duty as both its own content and the bridge from clip 07, closing the loop back to clip 01's brand line.

If you re-cut the clip order, re-check the bridge line at the start of whichever clip now comes second — it'll reference the wrong predecessor.

Files:

- `01-intro.md` — home page (paused), brand intro
- `02-specialties.md` — specialties page, running
- `03-branches.md` — branches page, edit modal walkthrough (add/remove phone, hours, save, second branch)
- `04-clinic-info.md` — clinic info page (paused): name, description, public phones, socials
- `05-doctors.md` — doctors list → profile → edit modal → availability rules (order-based, capacity warning, branch-hours error)
- `06-messages.md` — messages inbox + mobile recording, narrated patient↔AI conversation (single voice, like every other clip)
- `07-appointments.md` — appointments board, verify AI's booking, WhatsApp confirmation reminder flips status, doctor's queue tab
- `08-reports.md` — reports page (paused), closing clip — bookends the intro with brand + CTA

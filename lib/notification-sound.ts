/**
 * Plays a short notification chime using the Web Audio API.
 *
 * We synthesize the tone instead of loading an audio file so there's no binary
 * asset to ship and no `<audio>` element that browsers may block. The single
 * AudioContext is created lazily and reused; browsers start it "suspended"
 * until a user gesture, so we resume() on every play — by the time a staff
 * member has an escalation, they've almost always already clicked around the
 * dashboard, which unlocks audio.
 */

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** One short note: a sine tone that fades out to avoid a click. */
function playNote(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;

  // Quick attack, smooth exponential release.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Plays a pleasant two-note "ding-dong" chime to alert staff that a customer
 * needs a human. Safe to call anywhere; silently no-ops if audio is
 * unavailable or blocked.
 */
export function playEscalationSound() {
  const ctx = getContext();
  if (!ctx) return;

  const start = () => {
    const now = ctx.currentTime;
    playNote(ctx, 880, now, 0.18); // A5
    playNote(ctx, 1174.66, now + 0.16, 0.28); // D6
  };

  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(start)
      .catch(() => {});
  } else {
    start();
  }
}

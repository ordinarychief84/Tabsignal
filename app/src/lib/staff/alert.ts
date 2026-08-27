/**
 * The noise a new request makes.
 *
 * A server is not looking at the screen. That is the whole premise of
 * the product — they are carrying plates, taking an order at another
 * table, or facing the wrong way — so a request that only changes some
 * pixels has not really arrived. Vibration already existed; this adds
 * the part that works when the phone is in an apron pocket, and the
 * switch to turn it off.
 *
 * SYNTHESISED, NOT A FILE. Two short sine tones through the Web Audio
 * API rather than an mp3: nothing to download on venue wifi, nothing to
 * cache, nothing to 404 after a deploy, and no decode delay on a phone
 * that has been asleep. It also means the sound cannot be mistaken for
 * a notification from another app, which matters on a shared device.
 *
 * THE SETTING IS PER DEVICE, and deliberately so. The same person's own
 * phone and the shared tablet by the pass want different answers, and a
 * setting stored against the staff account would force one on both. It
 * lives in localStorage.
 *
 * DEFAULT OFF. A service tool that starts making noise the first time
 * somebody opens it in a quiet dining room has made a decision that
 * wasn't its to make. The control is visible, so turning it on is one
 * tap; a venue that wants it can have it.
 */

const STORAGE_KEY = "tabcall.staff.requestSound";

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    // Private mode, or storage disabled. Silence is the safe answer.
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* nothing to do — the toggle just won't persist */
  }
}

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;

/**
 * Browsers refuse to make noise until the user has interacted with the
 * page. A staff app that has been open all shift has had plenty of
 * interaction, but the very first request after a cold load might not
 * have — so the context is created lazily and resumed on demand, and a
 * refusal is swallowed rather than thrown into a render.
 */
function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: Ctor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Two rising notes, about a third of a second in total.
 *
 * Short because it will play during service and a long tone is a tone
 * people learn to resent. Rising because a falling pair reads as
 * something finishing, and this is something starting. Quiet by
 * absolute standards — it is meant to be noticed in a room, not to
 * carry across one.
 */
export function playRequestChime(): void {
  const context = audioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;

    for (const [index, frequency] of [660, 880].entries()) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;

      const start = now + index * 0.14;
      const end = start + 0.13;
      // Ramped rather than switched: an abrupt gate produces a click
      // that is more startling than the note itself.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    /* audio is a nicety; never let it break the queue */
  }
}

/** A short double pulse. Distinct from the single buzz of a system alert. */
export function vibrate(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([14, 60, 14]);
    }
  } catch {
    /* iOS Safari has no vibrate and throws on some Androids */
  }
}

/**
 * Everything a newly-arrived request should do to get noticed, once.
 *
 * DEDUPLICATION IS THE CALLER'S JOB TO SEED, NOT TO REMEMBER. §54 says a
 * waiter must not be alerted twice for the same event, and the ways that
 * happens are mundane: a socket event and the 30-second poll delivering
 * the same request, or a reconnect replaying it. So this keeps the set
 * of ids it has already announced, and a second call for the same id
 * does nothing at all.
 *
 * The set is capped — a long shift should not grow an unbounded list of
 * request ids in memory — and old entries are dropped in insertion
 * order, which is safe because a request from two hundred requests ago
 * is not about to arrive again.
 */
const announced = new Set<string>();
const MAX_REMEMBERED = 300;

export function alertForRequest(requestId: string, opts?: { sound?: boolean }): boolean {
  if (!requestId || announced.has(requestId)) return false;

  announced.add(requestId);
  if (announced.size > MAX_REMEMBERED) {
    const oldest = announced.values().next().value;
    if (oldest) announced.delete(oldest);
  }

  vibrate();
  if (opts?.sound ?? soundEnabled()) playRequestChime();
  return true;
}

/**
 * Mark requests as already-announced without alerting.
 *
 * Used on the queue's first load. Without it, opening the app to a busy
 * floor would buzz once per request that was already sitting there —
 * which is both useless and the fastest way to get a server to turn the
 * sound off permanently.
 */
export function seedAnnounced(ids: string[]): void {
  for (const id of ids) announced.add(id);
}

/** Test seam — the module-level set would otherwise leak between cases. */
export function __resetAnnounced(): void {
  announced.clear();
}

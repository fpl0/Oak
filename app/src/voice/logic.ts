// Pure decisions of the voice and audio set-up (ux §4.7, contracts §8.2, §8.5, §8.6): verdicts and copy for each
// measurement, the note the first sing plays, the live note readout and the tolerance-ladder summary. No audio
// here; the parts in ./parts call these with what @oak/audio measured.
import type { Profile } from "@oak/api";
import type { SingTolCents } from "@oak/content-kit";
import type { PitchFrame } from "@oak/pitch";
import { median } from "@oak/pitch";
import { formatNoteMidi } from "../lib/notes.ts";

/** ux §4.7 `mic.noise`: below −45 dBFS is quiet enough. */
export const NOISE_OK_DB = -45;
/** contracts §8.6: tap latency above 120 ms looks like Bluetooth; timing grades get more forgiving. */
export const HIGH_TAP_MS = 120;
/** Fewer matched taps than this out of 16 and the measurement is not worth keeping. */
export const MIN_TAPS = 8;
/** A sing latency outside this window is a mis-detection (an onset found on the wrong click), not a latency. */
export const SING_LATENCY_MAX_MS = 400;

export type OutputChoice = "wired" | "bluetooth" | "speakers";

export function noiseVerdict(db: number): { ok: boolean; title: string; body: string } {
  const at = `${Math.round(db)} dBFS`;
  if (db < NOISE_OK_DB)
    return {
      ok: true,
      title: "Quiet enough",
      body: `The room measured ${at}. Oak can hear a soft voice clearly.`,
    };
  return {
    ok: false,
    title: "A little noisy here",
    body: `The room measured ${at}. A quieter spot helps Oak hear you; you can carry on and re-check later.`,
  };
}

export function bleedVerdict(heard: boolean): { ok: boolean; title: string; body: string } {
  return heard
    ? {
        ok: false,
        title: "The mic hears the speakers",
        body: "Singing along with playback would confuse it. Headphones fix this; until then Oak plays first and listens after.",
      }
    : {
        ok: true,
        title: "No bleed",
        body: "The mic did not hear the test tones. Playback and singing can overlap.",
      };
}

export interface TapVerdict {
  ok: boolean;
  title: string;
  body: string;
}

export function tapVerdict(r: { latencyMs: number; jitterMs: number; taps: number }): TapVerdict {
  if (r.taps < MIN_TAPS || !Number.isFinite(r.latencyMs))
    return {
      ok: false,
      title: "Not enough taps to measure",
      body: `Oak caught ${r.taps} of 16. Tap Space (or the pad) on each click, then try again.`,
    };
  const ms = Math.round(r.latencyMs);
  if (r.latencyMs > HIGH_TAP_MS)
    return {
      ok: true,
      title: `Your taps land ${ms} ms after the click`,
      body: "That looks like Bluetooth latency. Oak allows for it, and timing grades will be a little looser.",
    };
  return {
    ok: true,
    title: `Your taps land ${ms} ms ${ms >= 0 ? "after" : "before"} the click`,
    body: `Oak subtracts that from every tap. Your taps vary by about ${Math.round(r.jitterMs)} ms.`,
  };
}

export function singLatencyVerdict(ms: number): { ok: boolean; title: string; body: string } {
  if (!Number.isFinite(ms) || Math.abs(ms) > SING_LATENCY_MAX_MS)
    return {
      ok: false,
      title: "Oak couldn't line your voice up with the clicks",
      body: "Sing a short 'da' right on each click, at a steady volume, and try again.",
    };
  return {
    ok: true,
    title: `Your voice lands ${Math.round(Math.abs(ms))} ms ${ms >= 0 ? "after" : "before"} the click`,
    body: "Oak allows for that when it times your singing.",
  };
}

export interface RangeLike {
  lowMidi: number;
  highMidi: number;
  comfortLowMidi: number;
  comfortHighMidi: number;
}

/** ux §4.7 result card: "Your singing zone: A2–E4 (comfortable C3–C4). Oak will choose keys that sit there." */
export function rangeSummary(r: RangeLike): string {
  const zone = `${formatNoteMidi(r.lowMidi)}–${formatNoteMidi(r.highMidi)}`;
  const comf = `${formatNoteMidi(r.comfortLowMidi)}–${formatNoteMidi(r.comfortHighMidi)}`;
  return `Your singing zone: ${zone} (comfortable ${comf}). Oak will choose keys that sit there.`;
}

/** A range is believable when it spans at least a few notes and sits inside the human voice (E1–C6). */
export function rangeOk(r: RangeLike): boolean {
  return r.highMidi - r.lowMidi >= 3 && r.lowMidi >= 28 && r.highMidi <= 84;
}

/**
 * The home note (C) the first sing plays: the C nearest the middle of the comfort zone, else middle C. Any
 * octave counts when it is graded (contracts §8.1 rule 8: folded per note), so this only picks a comfortable one.
 */
export function firstSingTonic(p: Pick<Profile, "comfortLowMidi" | "comfortHighMidi">): number {
  if (p.comfortLowMidi === null || p.comfortHighMidi === null) return 60;
  const mid = (p.comfortLowMidi + p.comfortHighMidi) / 2;
  const below = Math.floor(mid / 12) * 12;
  return mid - below <= 6 ? below : below + 12;
}

/** A frame is voiced at the pipeline's clarity gate (contracts §8.1 rule 1). */
export const voiced = (f: PitchFrame, clarity = 0.9) => f.clarity >= clarity && f.hz > 0;

export const midiOfHz = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/** The live readout ("Hum anything"): the median MIDI of the last few voiced frames, or null. */
export function liveMidi(frames: readonly PitchFrame[], last = 5): number | null {
  const v = frames
    .slice(-last * 2)
    .filter((f) => voiced(f))
    .slice(-last);
  if (v.length < Math.min(3, last)) return null;
  return median(v.map((f) => midiOfHz(f.hz)));
}

export function noteReadout(midi: number | null): string {
  if (midi === null) return "—";
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "±";
  return `${formatNoteMidi(nearest)} ${sign}${Math.abs(cents)}¢`;
}

/** ux §4.3 needle words: arrows and words only, never red/green. */
export function centsWords(cents: number): string {
  const a = Math.abs(cents);
  if (a <= 10) return "spot on";
  if (a <= 50) return cents < 0 ? "a little low" : "a little high";
  return cents < 0 ? "low" : "high";
}

/** Folds `midi` to the octave of `target` (error in (−600, 600] cents) and returns the signed error in cents. */
export function foldedCents(midi: number, target: number): number {
  let c = (midi - target) * 100;
  c = ((((c + 600) % 1200) + 1200) % 1200) - 600;
  return c === -600 ? 600 : c;
}

// --- the tolerance ladder (contracts §8.2) ---------------------------------------------------------

export const LADDER: readonly SingTolCents[] = [70, 50, 35, 25];
const NEXT_RULE: Readonly<Record<number, string>> = {
  70: "on 3 days within 21, each with at least 8 sung notes, your day's median miss is 35¢ or less",
  50: "on 3 days within 21, each with at least 8 sung notes, your day's median miss is 25¢ or less",
  35: "on 3 days within 21, each with at least 8 sung notes, your day's median miss is 20¢ or less",
};

export function ladderSummary(p: Pick<Profile, "singToleranceCents" | "singTolMode">): {
  current: string;
  next: string;
} {
  const t = p.singToleranceCents;
  const current = `±${t}¢ (${p.singTolMode === "auto" ? "Auto" : "fixed"})`;
  if (p.singTolMode === "fixed") return { current, next: "Fixed: it stays here until you choose Auto." };
  const rule = NEXT_RULE[t];
  if (!rule) return { current, next: "The finest step. It never loosens by itself." };
  const nxt = LADDER[LADDER.indexOf(t) + 1];
  return { current, next: `Tightens to ±${nxt}¢ when ${rule}. It never loosens by itself.` };
}

// --- the learner's own words for an output device ---------------------------------------------------

export function outputGuidance(kind: OutputChoice): {
  tone: "info" | "attention";
  title: string;
  body: string;
} {
  if (kind === "bluetooth")
    return {
      tone: "attention",
      title: "AirPods are fine for listening",
      body: "Oak will listen through your computer's own microphone, never the earbuds' (that would switch them to a low-quality call mode). Bluetooth adds delay, so Oak measures your timing in this set-up and tap grades are a little more forgiving.",
    };
  if (kind === "speakers")
    return {
      tone: "attention",
      title: "Speakers work for almost everything",
      body: "When you sing, the mic would also hear the speakers, so in singing steps Oak plays first and listens after. Wired headphones avoid this.",
    };
  return {
    tone: "info",
    title: "Wired headphones: the best set-up",
    body: "No delay, and the mic hears only you.",
  };
}

/** The output choice Oak guesses from the device label (the learner confirms it). */
export function outputChoiceOf(kind: Profile["outputKind"]): OutputChoice {
  return kind === "bluetooth" ? "bluetooth" : kind === "speakers" ? "speakers" : "wired";
}

// --- the three pitch-match trials (ux §4.7 `voice.match`, contracts §8.6) ---------------------------

/** The window a pitch-match trial is judged on: ±50¢ (ux §4.7), any octave. */
export const MATCH_CENTS = 50;
/** Seconds the learner has to sing each note back. */
export const MATCH_SING_SEC = 3;

/**
 * Three notes inside the comfort zone (ux §4.7): the middle, a major third above it and a fourth below it,
 * kept inside the zone; without a measured zone, around middle C.
 */
export function matchTargets(
  p: Pick<Profile, "comfortLowMidi" | "comfortHighMidi">,
): [number, number, number] {
  const lo = p.comfortLowMidi ?? 55;
  const hi = p.comfortHighMidi ?? 67;
  const mid = Math.round((lo + hi) / 2);
  const inside = (m: number) => Math.min(hi, Math.max(lo, m));
  return [mid, inside(mid + 4), inside(mid - 5)];
}

export interface MatchTrial {
  midi: number;
  /** Signed cents, folded to the nearest octave; null when no steady note was heard. */
  cents: number | null;
}

/** One trial in words and arrows (ux §4.3: no red or green): "spot on (+4¢)", "↓ a little low (−32¢)", "↑ 5 semitones high". */
export function matchWords(cents: number | null): string {
  if (cents === null) return "no steady note heard";
  const arrow = cents > 0 ? "↑ " : "↓ ";
  if (Math.abs(cents) <= 10) return `spot on (${cents > 0 ? "+" : cents < 0 ? "−" : "±"}${Math.abs(cents)}¢)`;
  if (Math.abs(cents) < 100)
    return `${arrow}${centsWords(cents)} (${cents > 0 ? "+" : "−"}${Math.abs(cents)}¢)`;
  const semis = Math.round(Math.abs(cents) / 100);
  return `${arrow}${semis} semitone${semis === 1 ? "" : "s"} ${cents > 0 ? "high" : "low"}`;
}

export function matchVerdict(trials: readonly MatchTrial[]): {
  within: number;
  title: string;
  body: string;
} {
  const within = trials.filter((t) => t.cents !== null && Math.abs(t.cents) <= MATCH_CENTS).length;
  const heard = trials.filter((t) => t.cents !== null).length;
  if (heard === 0)
    return {
      within,
      title: "Oak didn't hear a steady note",
      body: "Sing a long 'ooh' right after each note, at a comfortable volume. You can try again now or later; nothing waits on it.",
    };
  if (within >= 2)
    return {
      within,
      title: `${within} of 3 notes matched within ±${MATCH_CENTS}¢`,
      body: "Your voice finds the notes. Oak starts every learner at ±70¢ and tightens it as your singing settles.",
    };
  return {
    within,
    title: `${within} of 3 notes matched within ±${MATCH_CENTS}¢`,
    body: "Matching a note you just heard is a skill, and the singing steps are where it grows. Oak starts wide, at ±70¢, and only tightens once your singing shows it is ready.",
  };
}

// --- headphones changed since the set-up (contracts §8.6: re-checked when the device changes) ----------

/**
 * What to say when the output the computer reports now differs from the one the timing was measured with.
 * `nowKind` is the class of the default output's label (Bluetooth earbuds, wired, speakers) or null when the
 * browser does not name it (no permission yet).
 */
export function outputChangeAdvice(
  nowLabel: string | null,
  nowKind: OutputChoice | null,
  measured: Profile["outputKind"],
): { title: string; body: string } | null {
  if (!nowLabel || !nowKind || measured === "unknown") return null;
  if (nowKind === "bluetooth" && measured !== "bluetooth")
    return {
      title: `Oak sees ${nowLabel}`,
      body: "AirPods are fine for listening; Oak listens through your computer's own microphone. Bluetooth adds delay, so measure the timing again with them on.",
    };
  if (nowKind !== "bluetooth" && measured === "bluetooth")
    return {
      title: `Oak sees ${nowLabel}`,
      body: "Your timing was measured over Bluetooth. Measure it again so taps and sung notes line up without the extra delay.",
    };
  return null;
}

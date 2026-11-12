// Reference tones for singing (Wave 3): what plays before a sung trial so the learner knows where home is.
// Pure (no Strudel import): `import { dronePlan } from "@oak/strudel/reference"` and hand the plan to
// `OakStrudel.playEvents`. Measured by `e2e/quality.pw.ts` (in tune, steady, fundamental-dominant, loudness
// matched to the piano cadence): see `packages/strudel/sound-quality.json`.
//
// One pitch, one octave: a reference never doubles the tonic at the octave or adds a sub-octave, so the octave
// the learner hears is the octave they are asked to sing in. Callers pass the tonic already moved into the
// learner's comfort range (contracts §8.1 rule 3).
import type { AudioPlan, SuperdoughValue } from "@oak/drills";

export type ReferenceKind = "drone" | "tonic" | "cadence";

/**
 * The named presets. `drone`: a held triangle (odd harmonics at 1/n², so the fundamental carries ~99 % of the
 * energy and the octave cannot be misheard), no vibrato, no filter movement, no reverb, slow enough attack and
 * release that it neither clicks nor thumps. `tonic` and `cadence`: the Salamander piano, the instrument every
 * drill's cadence context already uses, at a level loudness-matched to the drone.
 */
export const REFERENCE_TONES: Readonly<Record<ReferenceKind, Readonly<Omit<SuperdoughValue, "note">>>> = {
  drone: { s: "triangle", attack: 0.12, decay: 0, sustain: 1, release: 0.4, gain: 0.45, lpf: 4000 },
  tonic: { s: "piano", gain: 1.1, release: 0.3 },
  cadence: { s: "piano", gain: 0.5, release: 0.2 },
};

/** Sounds to preload before any reference plays (`AudioPlan.preload` names). */
export const REFERENCE_PRELOAD: readonly string[] = ["piano"];

const clampMidi = (midi: number): number => Math.max(36, Math.min(84, Math.round(midi)));

/** One reference event value at a MIDI pitch (rounded, clamped to C2–C6). */
export function referenceValue(kind: ReferenceKind, midi: number): SuperdoughValue {
  return { ...REFERENCE_TONES[kind], note: clampMidi(midi) } as SuperdoughValue;
}

/** The tonic held as a drone for `seconds` (default 2.5). */
export function dronePlan(tonicMidi: number, seconds = 2.5): AudioPlan {
  const release = REFERENCE_TONES.drone.release as number;
  return {
    events: [{ at: 0, dur: seconds, value: referenceValue("drone", tonicMidi) }],
    durationSec: seconds + release,
    preload: [],
  };
}

/** The tonic once on the piano ("this is home"). */
export function tonicPlan(tonicMidi: number, seconds = 1.2): AudioPlan {
  return {
    events: [{ at: 0, dur: seconds, value: referenceValue("tonic", tonicMidi) }],
    durationSec: seconds + 0.3,
    preload: [...REFERENCE_PRELOAD],
  };
}

/**
 * I–IV–V–I in close position around the tonic, each chord with its bass (minor: iv and a major V, so the
 * leading tone is there), then optionally the tonic alone as a drone. The voicing is `answers/sing.ts`'s
 * `cadenceChords`, so every sung trial hears the same home.
 */
export function cadencePlan(
  tonicMidi: number,
  opts: { mode?: "major" | "minor"; bpm?: number; thenDrone?: number } = {},
): AudioPlan {
  const t = Math.round(tonicMidi);
  const third = opts.mode === "minor" ? 3 : 4;
  const sixth = opts.mode === "minor" ? 8 : 9;
  const one = [t - 12, t, t + third, t + 7];
  const chords = [one, [t - 7, t, t + 5, t + sixth], [t - 5, t - 1, t + 2, t + 7], one];
  const beat = 60 / (opts.bpm ?? 90);
  const events: AudioPlan["events"] = [];
  chords.forEach((chord, i) => {
    const dur = i === chords.length - 1 ? beat * 2 : beat;
    for (const midi of chord)
      events.push({
        at: i * beat,
        dur: dur * 0.95,
        value: { ...REFERENCE_TONES.cadence, note: midi } as SuperdoughValue,
      });
  });
  let durationSec = beat * (chords.length + 1) + 0.2;
  if (opts.thenDrone && opts.thenDrone > 0) {
    const at = durationSec;
    events.push({ at, dur: opts.thenDrone, value: referenceValue("drone", t) });
    durationSec = at + opts.thenDrone + (REFERENCE_TONES.drone.release as number);
  }
  return { events, durationSec, preload: [...REFERENCE_PRELOAD] };
}

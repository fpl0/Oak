// Wave 3 adversarial review of the pitch gate and the sung graders: voices and rooms the corpus builders did not
// cover. Very low (C2) and very high (E6) voices, wide and fast vibrato, clipped input, a backing track leaking
// loudly, short staccato notes, whistling, vocal fry and noise, at 48 and 44.1 kHz; then the free-mode graders on
// late, legato, vibrato and wrong-octave takes. The frame gate is the contract's ("≥ 95 % of voiced frames within
// ±25 cents, octave errors < 2 %"); the note checks guard what the free-mode graders read (`pitchFramesToNotes`).
//
// Two defects this suite found and pins:
//  - `corpus.ts` wrote harmonic 80 past the end of its 80-slot buffer for any f0 ≤ 65 Hz: a C2 with vibrato
//    rendered as NaN, so the "very low voice" was silently never tested.
//  - the tracker split a held note whenever single smoothed frames left the note by 70¢: an ordinary vibrato
//    (±60¢ at 5.5–7 Hz) came out as a note 45¢ flat or as no note at all, and every vibrato clip of the corpus
//    segmented into 5–9 alternating notes. Splits now read the mean over ~130 ms and wait for a held pitch.
import { describe, expect, test } from "bun:test";
import type { LearnerProfile, SingTolerance } from "@oak/content-kit";
import {
  type ClipPart,
  type ClipSpec,
  type CorpusClip,
  corpusSpecs,
  type NoteSpec,
  renderClip,
  TRUTH_STEP,
} from "./corpus.ts";
import { PROFILE, SING_TOL } from "./fixtures.test-data.ts";
import { analyzeClip, GATE, gateReport, isWithheld, scoreClip } from "./gate.ts";
import { detectBleed, gradeSung } from "./sung.ts";
import { mulberry32 } from "./synth.ts";
import { pitchFramesToNotes, trackerOptionsFor } from "./tracker.ts";
import type { SungNote, SungTarget } from "./types.ts";
import { WINDOW_SIZE } from "./types.ts";

const LEAD: ClipPart = { kind: "gap", sec: 0.35 };
const TAIL: ClipPart = { kind: "gap", sec: 0.3 };
function separated(midis: number[], dur: number, over: Partial<NoteSpec> = {}, gap = 0.18): ClipPart[] {
  const parts: ClipPart[] = [LEAD];
  midis.forEach((midi, i) => {
    parts.push({ kind: "phrase", notes: [{ midi, dur, ...over }] });
    if (i < midis.length - 1) parts.push({ kind: "gap", sec: gap });
  });
  parts.push(TAIL);
  return parts;
}

/** Voices at the edges of the corpus, at both sample rates. */
function edgeSpecs(): ClipSpec[] {
  const out: ClipSpec[] = [];
  for (const sampleRate of [48000, 44100]) {
    const sr = sampleRate === 44100 ? "/44k1" : "";
    out.push(
      {
        id: `low/C2-E2${sr}`,
        cls: "steady",
        sampleRate,
        rangeLow: 36,
        timbre: { vowel: "o", h1Db: -4 },
        parts: separated([36, 38, 40], 0.8, { vibrato: { rateHz: 5.5, cents: 30 } }),
      },
      {
        id: `low/weak-fundamental${sr}`,
        cls: "weak-fundamental",
        sampleRate,
        rangeLow: 36,
        timbre: { vowel: "u", h1Db: -20, tiltDb: -3 },
        parts: separated([37, 40, 43], 0.8),
      },
      {
        id: `high/C6-E6${sr}`,
        cls: "steady",
        sampleRate,
        rangeLow: 62,
        timbre: { vowel: "a" },
        parts: separated([84, 86, 88], 0.7, { vibrato: { rateHz: 6, cents: 40 } }),
      },
      {
        id: `vibrato/wide-slow${sr}`,
        cls: "vibrato",
        sampleRate,
        rangeLow: 53,
        timbre: { vowel: "o" },
        parts: separated([57, 64, 72], 1.2, { vibrato: { rateHz: 4, cents: 90 } }),
      },
      {
        id: `bleed/loud${sr}`,
        cls: "bleed",
        sampleRate,
        rangeLow: 48,
        timbre: { vowel: "e" },
        // The backing leaks at −40 dBFS, 20 dB under the voice: ten times the corpus's loudest bleed.
        background: [{ kind: "bleed", db: -40 }],
        parts: [
          { kind: "gap", sec: 1.6 },
          ...separated([53, 57, 60], 0.5, { vibrato: { rateHz: 5.5, cents: 25 } }).slice(1),
          { kind: "gap", sec: 1.2 },
        ],
      },
      {
        id: `short/staccato${sr}`,
        cls: "consonant",
        sampleRate,
        rangeLow: 48,
        timbre: { vowel: "a" },
        parts: separated([55, 57, 59, 60, 62, 64], 0.14, { consonant: "t" }, 0.08),
      },
    );
  }
  return out;
}

/** A take recorded too hot: the clip amplified by `gainDb` and hard-clipped at full scale (no auto gain). */
function clipped(c: CorpusClip, gainDb: number): CorpusClip {
  const k = 10 ** (gainDb / 20);
  return {
    ...c,
    id: `${c.id}/+${gainDb}dB`,
    samples: c.samples.map((v) => Math.max(-1, Math.min(1, v * k))),
  };
}

/** Whistling: a near-pure sine with a light vibrato and breath noise, 0.6 s a note. */
function whistle(sampleRate: number, midis: number[]): CorpusClip {
  const rand = mulberry32(9);
  const dur = 0.6;
  const gap = 0.2;
  const n = Math.round((0.35 + midis.length * (dur + gap)) * sampleRate);
  const samples = new Float32Array(n);
  const steps = Math.ceil(n / TRUTH_STEP) + 1;
  const f0 = new Float32Array(steps);
  const env = new Float32Array(steps);
  let phase = 0;
  midis.forEach((m, k) => {
    const a = Math.round((0.35 + k * (dur + gap)) * sampleRate);
    for (let i = 0; i < dur * sampleRate; i++) {
      const t = i / sampleRate;
      const hz = 440 * 2 ** ((m - 69 + 0.2 * Math.sin(2 * Math.PI * 5 * t)) / 12);
      phase += (2 * Math.PI * hz) / sampleRate;
      const e = Math.min(1, t / 0.03, (dur - t) / 0.03);
      samples[a + i] = 0.1 * e * Math.sin(phase) + 0.005 * (rand() * 2 - 1);
      const s = Math.floor((a + i) / TRUTH_STEP);
      f0[s] = hz;
      env[s] = e;
    }
  });
  return {
    id: `whistle/${sampleRate}`,
    cls: "steady",
    sampleRate,
    samples,
    f0,
    env,
    profile: { noiseFloorDb: -80, rangeLow: 48 },
    duration: n / sampleRate,
  };
}

/** Vocal fry: glottal pulses at an irregular 25–65 Hz, each a short ring of the first formant. No pitch at all. */
function fry(sampleRate: number): CorpusClip {
  const rand = mulberry32(7);
  const n = Math.round(3 * sampleRate);
  const samples = new Float32Array(n);
  for (let t = 0.3 * sampleRate; t < 2.7 * sampleRate; t += sampleRate / (25 + 40 * rand())) {
    for (let i = 0; i < 0.006 * sampleRate && t + i < n; i++) {
      const j = Math.round(t + i);
      samples[j] =
        (samples[j] as number) +
        0.3 * Math.exp(-i / (0.0015 * sampleRate)) * Math.sin((2 * Math.PI * 700 * i) / sampleRate);
    }
  }
  const steps = Math.ceil(n / TRUTH_STEP) + 1;
  return {
    id: `fry/${sampleRate}`,
    cls: "silence-room",
    sampleRate,
    samples,
    f0: new Float32Array(steps),
    env: new Float32Array(steps),
    profile: { noiseFloorDb: -80, rangeLow: 40 },
    duration: n / sampleRate,
  };
}

function notesOf(c: CorpusClip): SungNote[] {
  return pitchFramesToNotes(analyzeClip(c), {
    ...trackerOptionsFor(c.profile),
    windowSec: WINDOW_SIZE / c.sampleRate,
  });
}
function wanted(spec: ClipSpec): number[] {
  return spec.parts.flatMap((p) => (p.kind === "phrase" ? p.notes.map((n) => n.midi) : []));
}
/** The notes found, as `midi` rounded to cents, against the notes sung. */
function expectNotes(got: readonly SungNote[], want: readonly number[], cents = 30): void {
  expect({ count: got.length, want }).toEqual({ count: want.length, want });
  got.forEach((n, i) => {
    expect(Math.abs(n.midi - (want[i] as number)) * 100).toBeLessThan(cents);
  });
}

describe("the pitch gate on voices and rooms the corpus does not cover", () => {
  test("very low and very high voices, wide vibrato, loud bleed, short notes, clipping, whistling — at 48 and 44.1 kHz", () => {
    const tenor = renderClip({
      id: "clipped/tenor",
      cls: "steady",
      rangeLow: 48,
      levelDb: -6,
      timbre: { vowel: "a" },
      parts: separated([50, 55, 62, 67], 0.6, { vibrato: { rateHz: 5.5, cents: 30 } }),
    });
    const clips = [
      ...edgeSpecs().map(renderClip),
      clipped(tenor, 12),
      whistle(48000, [79, 84, 88, 91]),
      whistle(44100, [76, 81]),
    ];
    const results = clips.map((clip) => ({ clip, counts: scoreClip(clip, analyzeClip(clip)) }));
    for (const r of results) {
      const row = gateReport([r]).overall;
      // Every clip on its own: the voice is found, in tune and in the right octave.
      expect({ id: r.clip.id, within: row.within >= GATE.minWithin }).toEqual({
        id: r.clip.id,
        within: true,
      });
      expect({ id: r.clip.id, octave: row.octave }).toEqual({ id: r.clip.id, octave: 0 });
      expect({ id: r.clip.id, recall: row.recall >= GATE.minRecall }).toEqual({
        id: r.clip.id,
        recall: true,
      });
      // Loud bleed is the one room where the backing itself is reported (see the next test); elsewhere nothing is.
      if (r.clip.cls !== "bleed")
        expect({ id: r.clip.id, fv: row.falseVoiced <= GATE.maxFalseVoiced }).toEqual({
          id: r.clip.id,
          fv: true,
        });
    }
  }, 120_000);

  test("loud bleed never moves the sung notes; the backing alone is heard as low notes (known limit)", () => {
    for (const spec of edgeSpecs().filter((s) => s.cls === "bleed")) {
      const notes = notesOf(renderClip(spec));
      const voice = notes.filter((n) => n.midi > 45);
      expectNotes(voice, wanted(spec), 15);
      // The bass of the backing (C2 under the room's high-pass) is what leaks through as "voice": a free-mode
      // grader sees extra low notes, which the alignment skips, and the bleed check of the set-up is what
      // keeps a learner with leaky headphones off sing steps with playback (contracts §8.6).
      expect(notes.filter((n) => n.midi <= 45).every((n) => Math.abs(n.midi - 36) < 0.3)).toBe(true);
    }
  }, 60_000);

  test("unvoiced sound is never a note: vocal fry, room noise, consonants alone", () => {
    for (const c of [fry(48000), fry(44100)]) {
      expect({ id: c.id, notes: notesOf(c).length }).toEqual({ id: c.id, notes: 0 });
    }
    const rooms = corpusSpecs()
      .filter((s) => s.cls === "silence-room")
      .map(renderClip);
    for (const c of rooms) expect({ id: c.id, notes: notesOf(c).length }).toEqual({ id: c.id, notes: 0 });
  }, 60_000);

  test("a grader on noise gives no credit and nothing to the ladder", () => {
    const targets: SungTarget[] = [60, 62, 64].map((midi, i) => ({
      midi,
      on: 0.4 + i * 0.7,
      off: 1.0 + i * 0.7,
    }));
    for (const c of [
      fry(48000),
      renderClip(corpusSpecs().find((s) => s.id === "silence-room/fan") as ClipSpec),
    ]) {
      const frames = analyzeClip(c);
      const profile = { ...PROFILE, noiseFloorDb: c.profile.noiseFloorDb };
      for (const mode of ["pitch", "echo", "resolution"] as const) {
        const r = gradeSung(frames, targets, SING_TOL, mode, profile);
        expect({ id: c.id, mode, score: r.score, pass: r.pass, ladder: r.medianAbsCents }).toEqual({
          id: c.id,
          mode,
          score: 0,
          pass: false,
          ladder: null,
        });
      }
    }
  }, 60_000);
});

describe("segmentation (what echo, resolution and bassline grade)", () => {
  test("every corpus clip segments into exactly the notes sung (vibrato, scoops, glides, consonants)", () => {
    const wrong: string[] = [];
    for (const spec of [...corpusSpecs(), ...edgeSpecs()]) {
      if (spec.cls === "silence-room" || spec.cls === "bleed" || isWithheld(spec)) continue;
      const got = notesOf(renderClip(spec));
      const want = wanted(spec);
      const ok =
        got.length === want.length && got.every((n, i) => Math.abs(n.midi - (want[i] as number)) < 0.3);
      if (!ok)
        wrong.push(`${spec.id}: want ${want.join(" ")}, got ${got.map((n) => n.midi.toFixed(2)).join(" ")}`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);

  test("legato semitone steps as short as Oak's free-mode singing asks (an eighth at 104 bpm ≈ 0.29 s) still split", () => {
    for (const vib of [0, 40]) {
      const midis = [60, 61, 62, 63, 62, 61, 60];
      const spec: ClipSpec = {
        id: `legato/semitones/${vib}`,
        cls: "glide-legato",
        rangeLow: 48,
        timbre: { vowel: "a" },
        parts: [
          LEAD,
          {
            kind: "phrase",
            legato: true,
            glideSec: 0.04,
            notes: midis.map((midi) => ({
              midi,
              dur: 0.25,
              ...(vib ? { vibrato: { rateHz: 5.5, cents: vib } } : {}),
            })),
          },
          TAIL,
        ],
      };
      expectNotes(notesOf(renderClip(spec)), midis, 25);
    }
  }, 30_000);

  test("one held note with vibrato is one note at its centre: ±90¢ at 4 Hz, ±80¢ at 5.5 Hz, ±60¢ at 7 Hz", () => {
    for (const [rateHz, cents] of [
      [4, 90],
      [5.5, 80],
      [6.5, 70],
      [7, 60],
    ] as const) {
      const spec: ClipSpec = {
        id: `vibrato/${rateHz}/${cents}`,
        cls: "vibrato",
        rangeLow: 48,
        timbre: { vowel: "a" },
        parts: separated([57, 64], 1.2, { vibrato: { rateHz, cents } }, 0.2),
      };
      expectNotes(notesOf(renderClip(spec)), [57, 64], 15);
    }
  }, 60_000);
});

describe("the sung-sequence graders on hard takes", () => {
  const tol = (over: Partial<SingTolerance> = {}): SingTolerance => ({ ...SING_TOL, ...over });
  const profile: LearnerProfile = { ...PROFILE, rangeLow: 48, noiseFloorDb: -72 };
  const targetsOf = (midis: readonly number[], start = 0.5, dur = 0.5): SungTarget[] =>
    midis.map((midi, i) => ({ midi, on: start + i * dur, off: start + (i + 1) * dur }));
  function take(
    notes: readonly (Partial<NoteSpec> & { midi: number; dur: number })[],
    start: number,
    legato = true,
  ) {
    const parts: ClipPart[] = [{ kind: "gap", sec: start }];
    if (legato) parts.push({ kind: "phrase", legato: true, glideSec: 0.07, notes: [...notes] });
    else for (const n of notes) parts.push({ kind: "phrase", notes: [n] });
    parts.push({ kind: "gap", sec: 0.6 });
    const c = renderClip({
      id: `take/${start}/${notes.map((n) => `${n.midi}:${n.vibrato?.cents ?? 0}`).join("-")}/${legato}`,
      cls: "glide-legato",
      rangeLow: 48,
      timbre: { vowel: "a" },
      parts,
    });
    return analyzeClip(c);
  }

  test("a legato echo sung with a singer's vibrato (±60¢ at 6 Hz) passes with full credit", () => {
    const melody = [60, 64, 62, 65, 64, 60];
    const frames = take(
      melody.map((midi) => ({ midi, dur: 0.45, vibrato: { rateHz: 6, cents: 60, onsetSec: 0.1 } })),
      0.4,
    );
    const r = gradeSung(frames, targetsOf(melody, 0.4, 0.45), tol(), "echo", profile);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.pass).toBe(true);
  }, 30_000);

  test("a sung resolution 3 → 2 → 1 with vibrato and a late start passes", () => {
    const path = [64, 62, 60];
    const frames = take(
      path.map((midi) => ({ midi, dur: 0.6, vibrato: { rateHz: 5.5, cents: 70 } })),
      1.4,
    );
    const r = gradeSung(frames, targetsOf(path, 0.3, 0.6), tol(), "resolution", profile);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1]);
    expect(r.pass).toBe(true);
  }, 30_000);

  test("wrong-octave takes: the whole phrase an octave down is fine; one note leaping an octave earns half", () => {
    const pattern = [60, 62, 64, 67, 72];
    const down = take(
      pattern.map((m) => ({ midi: m - 12, dur: 0.5 })),
      0.5,
    );
    for (const mode of ["echo", "degree"] as const) {
      const r = gradeSung(down, targetsOf(pattern), tol({ octave: "global" }), mode, profile);
      expect({ mode, credit: r.notes.map((n) => n.credit) }).toEqual({ mode, credit: [1, 1, 1, 1, 1] });
    }
    const leap = take(
      pattern.map((m, i) => ({ midi: i === 4 ? m - 12 : m, dur: 0.5 })),
      0.5,
    );
    const r = gradeSung(leap, targetsOf(pattern), tol({ octave: "global" }), "degree", profile);
    expect(r.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 0.5]);
    expect(r.notes[4]?.feedback).toBe("sing.octave-jump");
    // Exact octave: the same take an octave down earns nothing.
    const exact = gradeSung(down, targetsOf(pattern), tol({ octave: "exact" }), "degree", profile);
    expect(exact.notes.every((n) => n.credit === 0)).toBe(true);
  }, 30_000);

  test("a start later than the grader looks (1 s on half-second notes) never buys credit for the wrong notes", () => {
    const pattern = [60, 62, 64, 67, 72];
    const frames = take(
      pattern.map((midi) => ({ midi, dur: 0.5 })),
      1.5,
    );
    const r = gradeSung(frames, targetsOf(pattern), tol(), "degree", profile);
    // Each window then holds the NEXT target's predecessor: credit only where that happens to be in tune.
    expect(r.pass).toBe(false);
    expect(r.notes.filter((n) => n.credit === 1).length).toBeLessThanOrEqual(1);
    // The same take is fine in a free mode, which aligns by order.
    const echo = gradeSung(frames, targetsOf(pattern), tol(), "echo", profile);
    expect(echo.pass).toBe(true);
  }, 30_000);
});

// Second review pass (after integration): more takes a real learner gives, each through the frame gate and
// through the timed (`degree`) and free (`echo`) graders, at 48 and 44.1 kHz; and the one room the graders
// cannot tell from a voice on their own.
describe("second pass: scoops, drift, breathy and soft voices, short notes, mains hum, a high vibrato", () => {
  const pattern = [60, 64, 67, 64, 60];
  function takeSpec(
    id: string,
    midis: readonly number[],
    note: Partial<NoteSpec> & { dur: number },
    over: Partial<ClipSpec> = {},
  ): ClipSpec {
    const parts: ClipPart[] = [{ kind: "gap", sec: 0.5 }];
    for (const midi of midis) parts.push({ kind: "phrase", notes: [{ midi, ...note }] });
    parts.push({ kind: "gap", sec: 0.6 });
    return { id, cls: "steady", rangeLow: 48, timbre: { vowel: "a" }, parts, ...over };
  }
  function cases(sampleRate: number): { spec: ClipSpec; midis: readonly number[]; dur: number }[] {
    const sr = { sampleRate };
    const bass = [40, 43, 47, 43, 40];
    const soprano = [76, 79, 83, 86, 88];
    return [
      // An untrained singer slides up into every note from a whole tone below over 0.2 s.
      {
        spec: takeSpec(`scoop/${sampleRate}`, pattern, { dur: 0.5, scoopCents: 200, scoopSec: 0.2 }, sr),
        midis: pattern,
        dur: 0.5,
      },
      // … or sags 40¢ flat over every held note.
      {
        spec: takeSpec(`drift/${sampleRate}`, pattern, { dur: 0.5, driftCents: -40 }, sr),
        midis: pattern,
        dur: 0.5,
      },
      // A breathy voice with a weak fundamental.
      {
        spec: takeSpec(
          `breathy/${sampleRate}`,
          pattern,
          { dur: 0.5 },
          { ...sr, timbre: { vowel: "a", breathDb: -12, h1Db: -6 } },
        ),
        midis: pattern,
        dur: 0.5,
      },
      // A shy singer far from the mic (−38 dBFS) in a room 15 dB under the voice.
      {
        spec: takeSpec(
          `soft-noisy/${sampleRate}`,
          pattern,
          { dur: 0.5 },
          { ...sr, levelDb: -38, background: [{ kind: "pink-snr", snrDb: 15 }] },
        ),
        midis: pattern,
        dur: 0.5,
      },
      // Short articulated notes (0.2 s each, a "d" before each).
      {
        spec: takeSpec(`short/${sampleRate}`, pattern, { dur: 0.2, consonant: "d" }, sr),
        midis: pattern,
        dur: 0.2,
      },
      // A bass around E2 over 50 Hz mains hum.
      {
        spec: takeSpec(
          `bass-hum/${sampleRate}`,
          bass,
          { dur: 0.6 },
          {
            ...sr,
            rangeLow: 38,
            timbre: { vowel: "o", h1Db: -10 },
            background: [{ kind: "hum", hz: 50, db: -50 }],
          },
        ),
        midis: bass,
        dur: 0.6,
      },
      // A soprano up to E6 with a fast, wide vibrato.
      {
        spec: takeSpec(
          `soprano-vibrato/${sampleRate}`,
          soprano,
          { dur: 0.6, vibrato: { rateHz: 6.5, cents: 70 } },
          {
            ...sr,
            rangeLow: 64,
            timbre: { vowel: "i" },
          },
        ),
        midis: soprano,
        dur: 0.6,
      },
      // A voice over a backing leaking at −46 dBFS (20 dB under it).
      {
        spec: takeSpec(
          `bleed-under-voice/${sampleRate}`,
          pattern,
          { dur: 0.5 },
          { ...sr, cls: "bleed", levelDb: -26, background: [{ kind: "bleed", db: -46 }] },
        ),
        midis: pattern,
        dur: 0.5,
      },
    ];
  }

  test("each take: ≥ 95 % of voiced frames within ±25¢, no octave errors, every note credited in degree and echo", () => {
    for (const sampleRate of [48000, 44100])
      for (const { spec, midis, dur } of cases(sampleRate)) {
        const clip = renderClip(spec);
        const frames = analyzeClip(clip);
        const row = gateReport([{ clip, counts: scoreClip(clip, frames) }]).overall;
        expect({ id: spec.id, within: row.within >= GATE.minWithin, octave: row.octave }).toEqual({
          id: spec.id,
          within: true,
          octave: 0,
        });
        const profile: LearnerProfile = {
          ...PROFILE,
          rangeLow: spec.rangeLow,
          rangeHigh: spec.rangeLow + 24,
          comfLow: spec.rangeLow + 2,
          comfHigh: spec.rangeLow + 20,
          noiseFloorDb: clip.profile.noiseFloorDb,
        };
        const targets = midis.map((midi, i) => ({ midi, on: 0.5 + i * dur, off: 0.5 + (i + 1) * dur }));
        for (const mode of ["degree", "echo"] as const) {
          const r = gradeSung(frames, targets, SING_TOL, mode, profile);
          expect({ id: spec.id, mode, credit: r.notes.map((n) => n.credit), pass: r.pass }).toEqual({
            id: spec.id,
            mode,
            credit: midis.map(() => 1),
            pass: true,
          });
        }
      }
  }, 120_000);

  test("a silent learner under leaky headphones: the graders hear the backing's bass as a sung 1; detectBleed catches it", () => {
    // Known limit, pinned so it is not forgotten: with the per-note octave fold of contracts §8.1, the
    // backing's C2 leaking at −40 dBFS passes a 'sing 1' step and gives the ladder a ~2¢ note. The protection
    // is contracts §8.6's bleed detection during sing steps (voiced frames within 30¢ of what is playing for
    // more than 300 ms), which `detectBleed` implements: the host must call it with what it played.
    const bar = 2.4; // the corpus backing: one chord a bar at 100 bpm, bass on beats 1 and 3
    const roots = [36, 33, 29, 31, 36, 33];
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ];
    const playing = [
      ...roots.map((midi, i) => ({ midi, on: i * bar, off: (i + 1) * bar })),
      ...chords.flatMap((c, i) => c.map((midi) => ({ midi, on: i * bar, off: (i + 1) * bar }))),
    ];
    for (const db of [-46, -40]) {
      const clip = renderClip({
        id: `silent-bleed/${db}`,
        cls: "bleed",
        rangeLow: 48,
        timbre: { vowel: "a" },
        background: [{ kind: "bleed", db }],
        parts: [{ kind: "gap", sec: 6 }],
      });
      const frames = analyzeClip(clip);
      expect({ db, bleed: detectBleed(frames, playing) }).toEqual({ db, bleed: true });
      if (db === -40) {
        // The limit itself: on its own, the grader credits the leak (a fix here must update this line).
        const r = gradeSung(frames, [{ midi: 60, on: 0.5, off: 1.5 }], SING_TOL, "pitch", {
          ...PROFILE,
          rangeLow: 48,
          noiseFloorDb: clip.profile.noiseFloorDb,
        });
        expect(r.pass).toBe(true);
      }
    }
    const quiet = analyzeClip(
      renderClip({
        id: "silent-bleed/-60",
        cls: "bleed",
        rangeLow: 48,
        timbre: { vowel: "a" },
        background: [{ kind: "bleed", db: -60 }],
        parts: [{ kind: "gap", sec: 6 }],
      }),
    );
    const r = gradeSung(quiet, [{ midi: 60, on: 0.5, off: 1.5 }], SING_TOL, "pitch", {
      ...PROFILE,
      rangeLow: 48,
    });
    expect({ score: r.score, ladder: r.medianAbsCents }).toEqual({ score: 0, ladder: null });
  }, 60_000);
});

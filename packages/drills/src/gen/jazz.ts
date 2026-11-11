// Jazz families (contracts §7.3 stage G): guide-tone lines (which voice moves; sing the 3rd/7th line),
// voicings (shell, rootless A, drop 2), hearing extensions, chord-scales and avoid notes, and tritone and
// backdoor substitutions. Chords are spelled from their own root (STYLE §5), never from Strudel's voicer.
import type { ChordQuality, KeySpec } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import {
  CHORD_SUFFIX,
  CHORD_TONES,
  chordDisplay,
  keysFor,
  mod,
  parsePc,
  type RnChord,
  rnRoot,
  rnRootPc,
  spellAs,
  spellChord,
  spellMidi,
} from "../kernel.ts";
import { above, rn, spellVoiced } from "../music.ts";
import { atom, chordOf, type Node, seq } from "../pat.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  pickKey,
  pickTempo,
  silentTrial,
  trialOf,
} from "./common.ts";
import { singTargets } from "./keyed.ts";

/** The spelled name of chord member `semis` above a root ("F#3"). */
function memberName(root: string, quality: ChordQuality, rootMidi: number, semis: number): string {
  const idx = CHORD_TONES[quality].semis.findIndex((s) => mod(s, 12) === mod(semis, 12));
  const names = spellChord(root, quality);
  const pc = idx >= 0 ? (names[idx] as string) : spellMidi(rootMidi + semis, null).pc;
  return spellAs(rootMidi + semis, pc).name;
}
const noteList = (root: string, quality: ChordQuality, rootMidi: number, semis: readonly number[]): string =>
  semis.map((s) => memberName(root, quality, rootMidi, s)).join(" ");

/** One comped chord: its notes above the bass, its root and quality (the notes are spelled from the root). */
interface Comp {
  upper: number[];
  rootPc: number;
  quality: ChordQuality;
}
/** A two-track comping piece: the chords (spelled from their own roots) and a bass root, one chord a bar. */
function compPiece(ctx: GenCtx, key: KeySpec, chords: readonly Comp[]) {
  const names = (c: Comp) =>
    spellVoiced(
      { midis: [above(c.rootPc, 36), ...c.upper], rootPc: c.rootPc, quality: c.quality, inversion: 0 },
      key,
    );
  const items: Node[] = chords.map((c) => seq([chordOf(names(c).slice(1))]));
  const bass: Node[] = chords.map((c) => seq([atom(names(c)[0] as string)]));
  const alt = (xs: Node[]): Node => (xs.length === 1 ? (xs[0] as Node) : { t: "alt", items: xs });
  const tracks: TrackSpec[] = [
    {
      label: "chords",
      src: "note",
      pat: alt(items),
      s: ctx.rng.pick(["rhodes", "piano"]),
      gain: jitter(ctx, 0.55),
    },
    { label: "bass", src: "note", pat: alt(bass), s: "upright", gain: jitter(ctx, 0.75) },
  ];
  return buildPiece({ bpm: pickTempo(ctx), bars: chords.length, tracks });
}

// --- fam.jzz.guide ------------------------------------------------------------------------------

/** The 3rd and 7th of a chord as MIDI near `center`. */
function guideTones(rootPc: number, quality: ChordQuality, center: number): number[] {
  const s = CHORD_TONES[quality].semis;
  const third = s[1] as number;
  const seventh = s[3] as number;
  return [third, seventh].map((x) => {
    const pc = mod(rootPc + x, 12);
    let m = above(pc, center - 6);
    if (m - center > 6) m -= 12;
    return m;
  });
}
/**
 * A guide-tone line: start on the 3rd or the 7th of the first chord, then on each chord take the guide
 * tone nearest the last note (a common tone or a step, as the textbooks draw them).
 */
export function guideLine(
  chords: readonly { rootPc: number; quality: ChordQuality }[],
  start: 0 | 1,
  center = 64,
): number[] {
  const first = chords[0] as { rootPc: number; quality: ChordQuality };
  const line = [guideTones(first.rootPc, first.quality, center)[start] as number];
  for (const c of chords.slice(1)) {
    const prev = line[line.length - 1] as number;
    const opts = guideTones(c.rootPc, c.quality, prev).flatMap((m) => [m - 12, m, m + 12]);
    line.push(opts.reduce((best, m) => (Math.abs(m - prev) < Math.abs(best - prev) ? m : best)));
  }
  return line;
}

const II_V_I: readonly RnChord[] = [rn("2", "m7"), rn("5", "7"), rn("1", "maj7")];
const TURNAROUND: readonly RnChord[] = [rn("1", "maj7"), rn("6", "m7"), rn("2", "m7"), rn("5", "7")];

export const jazzGuide: Generator = {
  name: "jazz-guide",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const cat = ctx.category;
    if (cat === "v7-i-voice") {
      // Two chords as shells (root in the bass, 3rd and 7th above): which voice moves, top or bottom?
      const pair = ctx.rng.pick([
        [rn("5", "7"), rn("1", "maj7")],
        [rn("2", "m7"), rn("5", "7")],
      ]);
      const roots = pair.map((c) => rnRootPc(c, key));
      const start = ctx.rng.pick([0, 1] as const);
      const lineA = guideLine(
        pair.map((c, i) => ({ rootPc: roots[i] as number, quality: c.quality })),
        start,
        62,
      );
      const lineB = guideLine(
        pair.map((c, i) => ({ rootPc: roots[i] as number, quality: c.quality })),
        start === 0 ? 1 : 0,
        lineA[0] as number,
      );
      const voicings = [0, 1].map((i) => [lineA[i] as number, lineB[i] as number].sort((a, b) => a - b));
      const moving = lineA[0] !== lineA[1] ? lineA : lineB;
      const top = (voicings[0] as number[])[1] === moving[0];
      const piece = compPiece(
        ctx,
        key,
        pair.map((c, i) => ({
          upper: voicings[i] as number[],
          rootPc: roots[i] as number,
          quality: c.quality,
        })),
      );
      return trialOf(piece, { choice: [top ? "top" : "bottom"] }, cueOf(ctx), {
        mode: "choice",
        key,
        options: ["top", "bottom"],
        optionLabels: { top: "The top voice moves", bottom: "The bottom voice moves" },
        chords: pair.map((c) => chordDisplay(rnRoot(c, key), c.quality)),
        prompt: "Two guide tones, two chords: which voice moves?",
      });
    }
    // Sing a guide-tone line over ii–V–I (or the I–vi–ii–V turnaround) while it plays.
    const prog = cat === "turnarounds" ? TURNAROUND : II_V_I;
    const roots = prog.map((c) => rnRootPc(c, key));
    const start = ctx.rng.pick([0, 1] as const);
    const line = guideLine(
      prog.map((c, i) => ({ rootPc: roots[i] as number, quality: c.quality })),
      start,
    );
    const piece = compPiece(
      ctx,
      key,
      prog.map((c, i) => ({
        upper: guideTones(roots[i] as number, c.quality, 60).sort((a, b) => a - b),
        rootPc: roots[i] as number,
        quality: c.quality,
      })),
    );
    const barSec = 1 / piece.cps;
    return trialOf(piece, {}, cueOf(ctx, { countInBars: 1 }), {
      mode: "sing",
      key,
      singMode: "pitch",
      singTargets: singTargets(ctx, line, barSec, 0),
      responseAt: 0,
      line,
      startsOn: start === 0 ? "3rd" : "7th",
      chords: prog.map((c) => chordDisplay(rnRoot(c, key), c.quality)),
      prompt: `Sing the guide-tone line from the ${start === 0 ? "3rd" : "7th"} of the first chord, one note a bar.`,
    });
  },
};

// --- fam.jzz.voicing ----------------------------------------------------------------------------

/** Voicings as semitones above the root (the bass for rooted ones), named the way the lessons name them. */
const SHELL = { maj7: [0, 4, 11], "7": [0, 4, 10], m7: [0, 3, 10] } as const;
/** Rootless (Levine): A = 3 5 7 9 (dominant 3 13 7 9), B = 7 9 3 5 (dominant 7 9 3 13). */
const ROOTLESS: Readonly<Record<"maj7" | "7" | "m7", { A: number[]; B: number[] }>> = {
  maj7: { A: [4, 7, 11, 14], B: [11, 14, 16, 19] },
  "7": { A: [4, 9, 10, 14], B: [10, 14, 16, 21] },
  m7: { A: [3, 7, 10, 14], B: [10, 14, 15, 19] },
};
const SEVENTHS = ["maj7", "7", "m7"] as const;

export const jazzVoicing: Generator = {
  name: "jazz-voicing",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const deg = ctx.rng.pick([
      { d: "2", q: "m7" },
      { d: "5", q: "7" },
      { d: "1", q: "maj7" },
      { d: "6", q: "m7" },
      { d: "4", q: "maj7" },
    ] as const);
    const chord = rn(deg.d, deg.q);
    const root = rnRoot(chord, key);
    const q = deg.q as (typeof SEVENTHS)[number];
    const rootMidi = above(parsePc(root).pc, 48);
    const list = (semis: readonly number[]) => noteList(root, q, rootMidi, semis);
    const name = chordDisplay(root, q);
    let correct: string;
    let wrong: string[];
    let prompt: string;
    if (ctx.category === "rootless") {
      const r = ROOTLESS[q];
      correct = list(r.A);
      const other = q === "m7" ? "7" : "m7";
      wrong = [list(r.B), list([0, ...r.A.slice(0, 3)]), noteList(root, other, rootMidi, ROOTLESS[other].A)];
      prompt = `Which is the rootless A voicing of ${name}?`;
    } else if (ctx.category === "drop2") {
      // Close position under a top note, then the second voice from the top dropped an octave.
      const close = [...CHORD_TONES[q].semis];
      const inv = ctx.rng.int(0, 3);
      const closeV = close.map((s, i) => (i < inv ? s + 12 : s)).sort((a, b) => a - b);
      const drop = (v: number[], fromTop: number) =>
        v.map((s, i) => (i === v.length - 1 - fromTop ? s - 12 : s)).sort((a, b) => a - b);
      correct = list(drop(closeV, 1));
      wrong = [list(closeV), list(drop(closeV, 2)), list(drop(closeV, 0))];
      prompt = `Close position ${list(closeV)}: which is its drop-2 voicing?`;
    } else {
      correct = list(SHELL[q]);
      const other = q === "maj7" ? "7" : q === "7" ? "maj7" : "7";
      wrong = [
        list([0, 7, CHORD_TONES[q].semis[3] as number]),
        list([0, CHORD_TONES[q].semis[1] as number, 7]),
        noteList(root, other, rootMidi, SHELL[other]),
      ];
      prompt = `Which is a shell voicing (root, 3rd, 7th) of ${name}?`;
    }
    const options = ctx.rng.shuffle([correct, ...[...new Set(wrong)].filter((w) => w !== correct)]);
    return silentTrial({ choice: [correct] }, cueOf(ctx, { replays: -1 }), {
      mode: "choice",
      key,
      chord: name,
      options,
      prompt,
    });
  },
};

// --- fam.jzz.extension --------------------------------------------------------------------------

/** The three qualities each category contrasts (exercises §4.4). */
export const EXTENSION_SETS: Readonly<Record<string, ChordQuality[]>> = {
  "7-9-13": ["7", "9", "13"],
  "9-b9-s9": ["9", "7b9", "7#9"],
  "maj7-s11-69": ["maj7", "maj7#11", "69"],
  "m7-m9-m11": ["m7", "m9", "m11"],
  "alt-13-b13": ["7alt", "13", "7b13"],
};
/** Upper structures above the bass root: guide tones low, the colour tone on top so it is heard. */
export const EXTENSION_VOICINGS: Readonly<Partial<Record<ChordQuality, number[]>>> = {
  "7": [4, 7, 10],
  "9": [4, 10, 14],
  "13": [4, 10, 14, 21],
  "7b9": [4, 10, 13],
  "7#9": [4, 10, 15],
  maj7: [4, 7, 11],
  "maj7#11": [4, 7, 11, 18],
  "69": [4, 9, 14],
  m7: [3, 7, 10],
  m9: [3, 10, 14],
  m11: [3, 10, 14, 17],
  "7alt": [4, 10, 15, 20],
  "7b13": [4, 10, 20],
};

export const jazzExtension: Generator = {
  name: "jazz-extension",
  generate(ctx) {
    const set = EXTENSION_SETS[ctx.category] ?? (EXTENSION_SETS["7-9-13"] as ChordQuality[]);
    const quality = ctx.rng.pick(set);
    const rootPc = ctx.rng.int(0, 11);
    const bass = above(rootPc, 36);
    const upperRoot = above(rootPc, 48);
    const upper = (EXTENSION_VOICINGS[quality] as number[]).map((s) => upperRoot + s);
    const piece = compPiece(ctx, { tonic: spellMidi(rootPc + 60, null).pc, mode: "major" }, [
      { upper, rootPc, quality },
    ]);
    return trialOf(piece, { choice: [quality] }, cueOf(ctx), {
      mode: "choice",
      options: [...set],
      optionLabels: Object.fromEntries(set.map((q) => [q, CHORD_SUFFIX[q].lead])),
      rootPc,
      midis: [bass, ...upper],
      prompt: "Which chord is it?",
    });
  },
};

// --- fam.jzz.chord-scale ------------------------------------------------------------------------

/** Diatonic chord-scales: the mode of the key from each degree. */
const DIATONIC_SCALE: Readonly<
  Record<number, { d: "1" | "2" | "3" | "4" | "5" | "6" | "7"; q: ChordQuality; scale: string }>
> = {
  1: { d: "1", q: "maj7", scale: "ionian" },
  2: { d: "2", q: "m7", scale: "dorian" },
  3: { d: "3", q: "m7", scale: "phrygian" },
  4: { d: "4", q: "maj7", scale: "lydian" },
  5: { d: "5", q: "7", scale: "mixolydian" },
  6: { d: "6", q: "m7", scale: "aeolian" },
  7: { d: "7", q: "m7b5", scale: "locrian" },
};
const SCALE_LABELS: Readonly<Record<string, string>> = {
  ionian: "Ionian (major)",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  aeolian: "Aeolian (natural minor)",
  locrian: "Locrian",
  "locrian-nat2": "Locrian ♮2",
  "whole-half": "Whole–half diminished",
  altered: "Altered",
  "lydian-dominant": "Lydian dominant",
};
/** Scales a chord of each quality could take: the near misses of a question. */
const SAME_QUALITY: Readonly<Partial<Record<ChordQuality, string[]>>> = {
  maj7: ["ionian", "lydian", "mixolydian"],
  m7: ["dorian", "phrygian", "aeolian"],
  "7": ["mixolydian", "ionian", "dorian"],
  m7b5: ["locrian", "locrian-nat2", "aeolian"],
};
/** Avoid notes (semitones above the root) of the diatonic chord-scales that have one. */
const AVOID: Readonly<Record<string, number>> = {
  ionian: 5,
  mixolydian: 5,
  aeolian: 8,
  phrygian: 1,
  locrian: 1,
};

export const jazzChordScale: Generator = {
  name: "jazz-chord-scale",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const cue = cueOf(ctx, { replays: -1 });
    const cat = ctx.category;
    const choice = (
      answer: string,
      pool: readonly string[],
      prompt: string,
      extra: Record<string, unknown> = {},
    ) => {
      const opts = ctx.rng.shuffle([
        answer,
        ...ctx.rng.shuffle(pool.filter((x) => x !== answer)).slice(0, 2),
      ]);
      return silentTrial({ choice: [answer] }, cue, {
        mode: "choice",
        key,
        options: opts,
        optionLabels: Object.fromEntries(opts.map((o) => [o, SCALE_LABELS[o] ?? o])),
        prompt,
        ...extra,
      });
    };
    if (cat === "half-dim-dim") {
      // Minor ii–V: iiø7 takes Locrian ♮2; a passing dim7 takes the whole–half scale.
      const minor = keysFor(ctx.level.keys, "minor");
      const mk = ctx.rng.pick(minor);
      if (ctx.rng.next() < 0.5) {
        const root = rnRoot(rn("2", "m7b5"), mk);
        return choice(
          "locrian-nat2",
          ["locrian-nat2", "locrian", "aeolian"],
          `In ${mk.tonic} minor, which scale fits ${chordDisplay(root, "m7b5")} (iiø7)?`,
          { key: mk },
        );
      }
      const root = spellMidi(rnRootPc(rn("#4", "dim7"), key) + 60, key).pc;
      return choice(
        "whole-half",
        ["whole-half", "locrian", "altered"],
        `Which scale fits the passing ${chordDisplay(root, "dim7")}?`,
      );
    }
    if (cat === "altered-lydian") {
      const pick = ctx.rng.int(0, 2);
      if (pick === 0) {
        const root = rnRoot(rn("5", "7alt"), key);
        return choice(
          "altered",
          ["altered", "mixolydian", "lydian-dominant"],
          `Which scale fits ${chordDisplay(root, "7alt")} resolving to ${key.tonic}?`,
        );
      }
      if (pick === 1) {
        const root = rnRoot(rn("4", "maj7"), key);
        return choice(
          "lydian",
          ["lydian", "ionian", "mixolydian"],
          `In ${key.tonic} major, which scale fits ${chordDisplay(root, "maj7")} (IVmaj7)?`,
        );
      }
      const root = rnRoot(rn("b7", "7#11"), key);
      return choice(
        "lydian-dominant",
        ["lydian-dominant", "mixolydian", "altered"],
        `Which scale fits ${chordDisplay(root, "7#11")} (a dominant that does not resolve down a fifth)?`,
      );
    }
    if (cat === "avoid-notes") {
      const degs = [1, 5, 6, 3, 7].filter(
        (d) => AVOID[(DIATONIC_SCALE[d] as { scale: string }).scale] !== undefined,
      );
      const d = DIATONIC_SCALE[ctx.rng.pick(degs)] as { d: "1"; q: ChordQuality; scale: string };
      const root = rnRoot(rn(d.d, d.q), key);
      const rootMidi = above(parsePc(root).pc, 60);
      const avoid = AVOID[d.scale] as number;
      // Scale tones as the key spells them; the avoid note and two other non-chord scale tones as options.
      const name = (semis: number) => spellMidi(rootMidi + semis, key).pc;
      const chordSemis = CHORD_TONES[d.q].semis.map((s) => mod(s, 12));
      // Other non-chord tones of the same scale (the key's own notes): the near misses.
      const tonic = parsePc(key.tonic).pc;
      const tensions = [1, 2, 5, 6, 8, 9].filter(
        (x) =>
          x !== avoid &&
          !chordSemis.includes(x) &&
          [0, 2, 4, 5, 7, 9, 11].includes(mod(rootMidi + x - tonic, 12)),
      );
      const opts = ctx.rng.shuffle([avoid, ...ctx.rng.shuffle(tensions).slice(0, 2)]).map(name);
      return silentTrial({ choice: [name(avoid)] }, cue, {
        mode: "choice",
        key,
        textKind: "pc",
        options: opts,
        scale: d.scale,
        prompt: `In ${key.tonic} major, over ${chordDisplay(root, d.q)} (${SCALE_LABELS[d.scale]}), which note is the avoid note?`,
      });
    }
    // basic: the ii, V and I of the key.
    const d = DIATONIC_SCALE[ctx.rng.pick([1, 2, 5])] as { d: "1"; q: ChordQuality; scale: string };
    const root = rnRoot(rn(d.d, d.q), key);
    const numeral = d.d === "1" ? "Imaj7" : d.d === "2" ? "ii7" : "V7";
    return choice(
      d.scale,
      SAME_QUALITY[d.q] ?? [d.scale],
      `In ${key.tonic} major, which scale fits ${chordDisplay(root, d.q)} (${numeral})?`,
    );
  },
};

// --- fam.jzz.subs -------------------------------------------------------------------------------

type Cadence = "V7-I" | "bII7-I" | "backdoor";
const CADENCES: Readonly<Record<Cadence, RnChord[]>> = {
  "V7-I": [rn("2", "m7"), rn("5", "7"), rn("1", "maj7"), rn("1", "maj7")],
  "bII7-I": [rn("2", "m7"), rn("b2", "7"), rn("1", "maj7"), rn("1", "maj7")],
  backdoor: [rn("4", "m7"), rn("b7", "7"), rn("1", "maj7"), rn("1", "maj7")],
};
/** Close voicings of 7th chords with the bass root, upper voices around middle C. */
function seventhVoicings(chords: readonly RnChord[], key: KeySpec): Comp[] {
  const out: Comp[] = [];
  let center = 62;
  for (const c of chords) {
    const rootPc = rnRootPc(c, key);
    // 3rd, 5th, 7th and root (or 9th for dominants) in close position nearest the last chord.
    const semis = CHORD_TONES[c.quality].semis.slice(1, 4);
    let best: number[] = [];
    let bestD = Number.POSITIVE_INFINITY;
    for (let base = 50; base <= 62; base++) {
      const v = semis.map((s) => above(mod(rootPc + s, 12), base)).sort((a, b) => a - b);
      if ((v[2] as number) - (v[0] as number) > 12) continue;
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      if (Math.abs(mean - center) < bestD) {
        bestD = Math.abs(mean - center);
        best = v;
      }
    }
    out.push({ upper: best, rootPc, quality: c.quality });
    center = best.reduce((a, b) => a + b, 0) / best.length;
  }
  return out;
}

export const jazzSubs: Generator = {
  name: "jazz-subs",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const cat = ctx.category;
    if (cat === "in-standard") {
      // Eight bars of I–vi–ii–V twice; one of the V7s (or the VI7 on the way) replaced by its tritone sub.
      const base: RnChord[] = [
        rn("1", "maj7"),
        rn("6", "m7"),
        rn("2", "m7"),
        rn("5", "7"),
        rn("3", "m7"),
        rn("6", "7"),
        rn("2", "m7"),
        rn("5", "7"),
      ];
      const where = ctx.rng.pick([3, 5, 7]);
      const subbed = base.map((c, i) =>
        i === where ? { ...c, degree: c.degree === "5" ? "b2" : "b3", quality: "7" as const } : c,
      ) as RnChord[];
      const piece = compPiece(ctx, key, seventhVoicings(subbed, key));
      const options = Array.from({ length: 8 }, (_, i) => String(i + 1)).filter((b) => b !== "1");
      return trialOf(piece, { choice: [String(where + 1)] }, cueOf(ctx), {
        mode: "choice",
        ui: "bar-buttons",
        key,
        bars: 8,
        options,
        optionLabels: Object.fromEntries(options.map((o) => [o, `Bar ${o}`])),
        prompt: "One dominant is replaced by its tritone substitute. In which bar?",
      });
    }
    const open: Cadence[] = (["V7-I", "bII7-I", "backdoor"] as Cadence[]).filter(
      (c) => c !== "backdoor" || cat === "backdoor" || ctx.openCategories.includes("backdoor"),
    );
    const which = ctx.rng.pick(open);
    const piece = compPiece(ctx, key, seventhVoicings(CADENCES[which], key));
    return trialOf(piece, { choice: [which] }, cueOf(ctx), {
      mode: "choice",
      key,
      options: open,
      optionLabels: {
        "V7-I": "ii–V7–I",
        "bII7-I": "ii–♭II7–I (tritone sub)",
        backdoor: "iv7–♭VII7–I (backdoor)",
      },
      prompt: "Which way into the tonic?",
    });
  },
};

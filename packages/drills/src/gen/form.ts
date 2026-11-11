// Form families: `fam.frm.sections` (AABA or verse–chorus? phrases of 4 or 8 bars? subtle contrast) and
// `fam.frm.blues` (which chord now? where does IV arrive? quick change? jazz blues?). Exercises §4.4.
import type { KeySpec } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import { type RnChord, spellMidi, stepToMidi } from "../kernel.ts";
import { above, rn, spellVoiced, voiceProgression } from "../music.ts";
import { atom, chordOf, line, type Node, rest, seq } from "../pat.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  jitter,
  pickKey,
  pickKit,
  pickSound,
  pickTempo,
  trialOf,
} from "./common.ts";

/** Bars of one arrangement, each bar a chord, a melody bar (or null) and a drum density. */
interface Bar {
  chord: RnChord;
  mel: (number | null)[] | null;
  drums: "none" | "light" | "full";
  lift?: number;
}

/** Builds a piece from bars: chords, bass on beats 1 and 3, melody in the key's own scale, drums. */
function arrange(ctx: GenCtx, key: KeySpec, bars: readonly Bar[], opts: { melOctave?: number } = {}) {
  const voiced = voiceProgression(
    bars.map((b) => b.chord),
    key,
  );
  const octave = opts.melOctave ?? 4;
  const chordItems: Node[] = [];
  const bassItems: Node[] = [];
  const melItems: Node[] = [];
  const kickItems: Node[] = [];
  const hatItems: Node[] = [];
  bars.forEach((b, i) => {
    const v = voiced[i] as (typeof voiced)[number];
    chordItems.push(seq([chordOf(spellVoiced(v, key).slice(1))]));
    const root = spellMidi(above(v.rootPc, 36), key).code;
    const fifth = spellMidi(above(v.rootPc, 36) + 7, key).code;
    bassItems.push(line([root, null, fifth, null]));
    melItems.push(
      b.mel === null
        ? seq([rest])
        : line(
            b.mel.map((s) =>
              s === null ? null : spellMidi(stepToMidi(s + (b.lift ?? 0), key, octave), key).code,
            ),
          ),
    );
    kickItems.push(b.drums === "none" ? seq([rest]) : line(["bd", "sd", "bd", "sd"]));
    hatItems.push(b.drums === "full" ? seq([atom("hh", 8)]) : seq([rest]));
  });
  const bank = pickKit(ctx);
  const kit = bank ? { bank } : {};
  const alt = (items: Node[]): Node => ({ t: "alt", items });
  const tracks: TrackSpec[] = [
    { label: "chords", src: "note", pat: alt(chordItems), s: pickSound(ctx), gain: jitter(ctx, 0.45) },
    {
      label: "bass",
      src: "note",
      pat: alt(bassItems),
      s: ctx.rng.pick(["ebass", "upright"]),
      gain: jitter(ctx, 0.75),
    },
    {
      label: "mel",
      src: "note",
      pat: alt(melItems),
      s: ctx.rng.pick(["piano", "vibes", "cleangtr"]),
      gain: jitter(ctx, 0.7),
    },
    { label: "drums", src: "s", pat: alt(kickItems), gain: jitter(ctx, 0.6), ...kit },
  ];
  if (hatItems.some((h) => !(h.t === "seq" && h.items[0]?.t === "rest")))
    tracks.push({ label: "hats", src: "s", pat: alt(hatItems), gain: jitter(ctx, 0.3), ...kit });
  return buildPiece({ bpm: pickTempo(ctx), bars: bars.length, tracks });
}

// --- fam.frm.sections ---------------------------------------------------------------------------

/** A 4-bar section: the A (verse) material and the B (bridge or chorus) material, contrasting in harmony and contour. */
function sectionA(): Bar[] {
  return [
    { chord: rn("1", "maj"), mel: [0, 2, 4, 2], drums: "light" },
    { chord: rn("5", "maj"), mel: [1, null, 4, null], drums: "light" },
    { chord: rn("6", "min"), mel: [0, 2, 5, 4], drums: "light" },
    { chord: rn("4", "maj"), mel: [3, null, null, null], drums: "light" },
  ];
}
function sectionB(strong: boolean): Bar[] {
  const d = strong ? "full" : "light";
  const lift = strong ? 2 : 0;
  return [
    { chord: rn("4", "maj"), mel: [5, 5, 7, 5], drums: d, lift },
    { chord: rn("1", "maj"), mel: [4, null, 2, null], drums: d, lift },
    { chord: rn("4", "maj"), mel: [5, 7, 8, 7], drums: d, lift },
    { chord: rn("5", "maj"), mel: [6, null, null, null], drums: d, lift },
  ];
}
/** The B section of a subtle form: the same contour and texture as A, only the harmony moves. */
function sectionSubtle(): Bar[] {
  return sectionA().map((b, i) => ({
    ...b,
    chord: [rn("4", "maj"), rn("2", "min"), rn("5", "maj"), rn("5", "maj")][i] as RnChord,
  }));
}
/** Eight bars: two 4-bar phrases (a half cadence, then a full one) or one 8-bar phrase (one cadence). */
function phrases(eight: boolean): Bar[] {
  if (!eight)
    return [
      { chord: rn("1", "maj"), mel: [2, 2, 4, 2], drums: "light" },
      { chord: rn("4", "maj"), mel: [3, 5, 3, 1], drums: "light" },
      { chord: rn("1", "maj"), mel: [2, 0, 2, 4], drums: "light" },
      { chord: rn("5", "maj"), mel: [1, null, null, null], drums: "light" },
      { chord: rn("1", "maj"), mel: [2, 2, 4, 2], drums: "light" },
      { chord: rn("4", "maj"), mel: [3, 5, 3, 1], drums: "light" },
      { chord: rn("5", "maj"), mel: [1, 6, 4, 1], drums: "light" },
      { chord: rn("1", "maj"), mel: [0, null, null, null], drums: "light" },
    ];
  return [
    { chord: rn("1", "maj"), mel: [2, 2, 4, 2], drums: "light" },
    { chord: rn("4", "maj"), mel: [3, 5, 3, 1], drums: "light" },
    { chord: rn("6", "min"), mel: [2, 0, 2, 4], drums: "light" },
    { chord: rn("2", "min"), mel: [5, 3, 1, 3], drums: "light" },
    { chord: rn("5", "maj"), mel: [4, 6, 4, 2], drums: "light" },
    { chord: rn("1", "maj"), mel: [2, 4, 7, 4], drums: "light" },
    { chord: rn("4", "maj"), mel: [5, 3, 2, 1], drums: "light" },
    { chord: rn("1", "maj"), mel: [0, null, null, null], drums: "light" },
  ];
}

const FORMS = ["AABA", "verse-chorus"] as const;
const SUBTLE_FORMS = ["AABA", "ABAB", "AAAA"] as const;
const FORM_LABELS: Readonly<Record<string, string>> = {
  AABA: "AABA (verse, verse, bridge, verse)",
  "verse-chorus": "Verse–chorus (ABAB)",
  ABAB: "ABAB",
  AAAA: "AAAA (one idea, four times)",
  "phrase-4": "Phrases of 4 bars",
  "phrase-8": "One 8-bar phrase",
};

export const formSections: Generator = {
  name: "form-sections",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const cat = ctx.category;
    if (cat === "phrase-4" || cat === "phrase-8") {
      const piece = arrange(ctx, key, phrases(cat === "phrase-8"));
      const options = ["phrase-4", "phrase-8"];
      return trialOf(piece, { choice: [cat] }, cueOf(ctx), {
        mode: "choice",
        key,
        options,
        optionLabels: Object.fromEntries(options.map((o) => [o, FORM_LABELS[o] as string])),
        prompt: "Where do the phrases end: every 4 bars, or only after 8?",
      });
    }
    let form: string;
    let options: string[];
    let bars: Bar[];
    if (cat === "subtle") {
      form = ctx.rng.pick(SUBTLE_FORMS);
      options = [...SUBTLE_FORMS];
      const A = sectionA();
      const B = sectionSubtle();
      bars = [...form].flatMap((s) => (s === "A" ? A : B));
    } else {
      form = cat;
      options = [...FORMS];
      const A = sectionA();
      const B = sectionB(cat === "verse-chorus");
      bars = (form === "AABA" ? [A, A, B, A] : [A, B, A, B]).flat();
    }
    const piece = arrange(ctx, key, bars);
    return trialOf(piece, { choice: [form] }, cueOf(ctx), {
      mode: "choice",
      key,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, FORM_LABELS[o] as string])),
      sectionBars: 4,
      prompt: "Which form is this?",
    });
  },
};

// --- fam.frm.blues ------------------------------------------------------------------------------

type BluesForm = "standard" | "quick-change" | "jazz-blues";
const BLUES: Readonly<Record<BluesForm, RnChord[]>> = {
  standard: ["1", "1", "1", "1", "4", "4", "1", "1", "5", "4", "1", "5"].map((d) => rn(d as "1", "7")),
  "quick-change": ["1", "4", "1", "1", "4", "4", "1", "1", "5", "4", "1", "5"].map((d) => rn(d as "1", "7")),
  "jazz-blues": [
    rn("1", "7"),
    rn("4", "7"),
    rn("1", "7"),
    rn("1", "7"),
    rn("4", "7"),
    rn("#4", "dim7"),
    rn("1", "7"),
    rn("6", "7"),
    rn("2", "m7"),
    rn("5", "7"),
    rn("1", "7"),
    rn("5", "7"),
  ],
};
/** The numeral the "which chord" question expects for a bar of the standard form. */
const numeralOf = (c: RnChord): string => (c.degree === "1" ? "I" : c.degree === "4" ? "IV" : "V");

function bluesPiece(ctx: GenCtx, key: KeySpec, chords: readonly RnChord[]) {
  return arrange(
    ctx,
    key,
    chords.map((chord) => ({ chord, mel: null, drums: "full" as const })),
  );
}

export const formBlues: Generator = {
  name: "form-blues",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const cat = ctx.category;
    if (cat === "which-chord") {
      const chords = BLUES.standard;
      const byNumeral = { I: [] as number[], IV: [] as number[], V: [] as number[] };
      for (const [i, c] of chords.entries()) byNumeral[numeralOf(c) as "I"].push(i + 1);
      const numeral = ctx.rng.pick(["I", "IV", "V"] as const);
      const bar = ctx.rng.pick(byNumeral[numeral]);
      const piece = bluesPiece(ctx, key, chords);
      return trialOf(piece, { choice: [numeral] }, cueOf(ctx), {
        mode: "choice",
        key,
        options: ["I", "IV", "V"],
        barCounter: true,
        markedBar: bar,
        prompt: `Which chord plays in bar ${bar}?`,
      });
    }
    if (cat === "iv-arrival") {
      // Eight bars of the form from a starting bar the learner is not told: where does IV first sound?
      const start = ctx.rng.pick([1, 3, 9, 11]);
      const chords = Array.from({ length: 8 }, (_, i) => BLUES.standard[(start - 1 + i) % 12] as RnChord);
      const first = chords.findIndex((c) => c.degree === "4") + 1;
      const piece = bluesPiece(ctx, key, chords);
      const options = Array.from({ length: 8 }, (_, i) => String(i + 1));
      return trialOf(piece, { choice: [String(first)] }, cueOf(ctx), {
        mode: "choice",
        ui: "bar-buttons",
        key,
        bars: 8,
        startBar: start,
        options,
        optionLabels: Object.fromEntries(options.map((o) => [o, `Bar ${o}`])),
        prompt: "In which bar does the IV chord first arrive?",
      });
    }
    // Whole-form questions: quick change or not; from level 4, a jazz blues among the forms taught so far.
    const taught = (["standard", "quick-change", "jazz-blues"] as BluesForm[]).filter(
      (f) => f === cat || ctx.openCategories.includes(f),
    );
    const form: BluesForm =
      cat === "jazz-blues" && taught.length > 1 && ctx.rng.next() < 0.5
        ? ctx.rng.pick(taught.filter((f) => f !== "jazz-blues"))
        : (cat as BluesForm);
    const options: BluesForm[] = cat === "jazz-blues" ? taught : ["quick-change", "standard"];
    const bars = cat === "jazz-blues" ? 12 : 6;
    const piece = bluesPiece(ctx, key, BLUES[form].slice(0, bars));
    return trialOf(piece, { choice: [form] }, cueOf(ctx), {
      mode: "choice",
      key,
      options,
      optionLabels: {
        standard: "Standard",
        "quick-change": "Quick change (IV in bar 2)",
        "jazz-blues": "Jazz blues",
      },
      prompt: cat === "jazz-blues" ? "Which blues is this?" : "Quick change, or the standard form?",
    });
  },
};

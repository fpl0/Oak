// Stages E–F and the rhythm part of H in the drill runner (contracts §7.3; docs/design/wave6.md §11), pure and
// unit-tested: seventh-chord quality (which two notes tell the quality; the chord against its near miss), chromatic
// degrees (the lean to the nearest note of the key, chromatic syllables, one pad key per pitch), the chord from
// outside the key (which bar, what it is, where it leans; the key's own chord in its place), modes (the one changed
// note; the tune in the scale it is compared with), key changes (where home moved, which way and how far; the two
// homes; the passage without its lift), and rhythm II (the push on a grid, the hats' division, count syllables for
// triplets and compound meter). After every answer the learner can hear the thing alone, in context, and against
// its near miss. Music comes from the trial's own events and @oak/theory, never from a local table.
import type { Answer, ChordQuality, Degree, FamilyDef, KeySpec, MeterId, NEvent, Trial } from "@oak/api";
import { MODE_CHARACTERISTIC, MODE_DEGREES, type ScaleMode } from "@oak/content-kit";
import { type AudioPlan, eventsToAudioPlan } from "@oak/drills";
import {
  appliedReading,
  beatGrid,
  borrowedReading,
  type ChordId,
  chordNotes,
  chromaticDegree,
  chromaticLabel,
  degreeSemitones,
  diatonicChords,
  guideTones,
  keyDisplay,
  keyDistance,
  METERS,
  modeColour,
  outsideChordKind,
  romanText,
  scalePcs,
  seventhChord,
  seventhInfo,
  seventhQualityOf,
  syllableOf,
  toLeadSheet,
} from "@oak/theory";
import { qualityLabel, rnDisplay } from "../answers/keys.ts";
import type { AnswerSpec } from "../answers/types.ts";
import { arpeggioPlan, type ChordSlot, chordSlotsOf, revoice, tonicIn, tonicPc } from "./harmony.ts";
import { noteAlonePlan, tracksPlan } from "./wave5.ts";

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const onsetOf = (e: Pick<NEvent, "onset">): number => e.onset[0] / e.onset[1];
const shown = (d: string): string => d.replace(/^b/, "♭").replace(/^#/, "♯");
const noteShown = (n: string): string => n.replace(/b/g, "♭").replace(/#/g, "♯");
const keyOf = (trial: Trial<unknown>): KeySpec | null => {
  const k = trial.params.key as KeySpec | undefined;
  return k && typeof k.tonic === "string" && typeof k.mode === "string" ? k : null;
};
const cueBarsOf = (trial: Trial<unknown>): number => Math.max(0, Number(trial.params.cueBars ?? 0));
const barsOf = (trial: Trial<unknown>): number => Math.max(1, Number(trial.params.bars ?? 1));
const pcOfName = (name: string): number => tonicPc({ tonic: name, mode: "major" });
const RAT = 2880;
const rat = (x: number): [number, number] => [Math.round(x * RAT), RAT];

/** A listening offer after the answer: what the button says and what it plays. */
export interface Listen {
  label: string;
  plan: AudioPlan;
}

// --- words ---------------------------------------------------------------------------------------

const APPLIED_ID = /^(V|vii[o°]?)7?\/(.+)$/;
const KEY_MOVE_WORDS: Readonly<Record<string, string>> = {
  "truck-driver": "a lift by a half or a whole step",
  none: "no key change",
  relative: "a move to the relative minor",
  "dominant-pivot": "a move to the dominant through a shared chord",
};
const PUSH_WORDS: Readonly<Record<string, string>> = {
  anticipation: "a kick pushed ahead of the beat",
  "offbeat-8th": "off-beat eighths",
  "offbeat-16th": "off-beat sixteenths",
  "two-per-bar": "two pushes a bar",
};
const DIVISION_WORDS: Readonly<Record<string, string>> = {
  eighths: "Eighths: two to the beat",
  triplets: "Triplets: three to the beat",
  sixteenths: "Sixteenths: four to the beat",
};
const QUALITIES = new Set([
  "maj",
  "min",
  "dim",
  "aug",
  "7",
  "maj7",
  "m7",
  "m7b5",
  "dim7",
  "mMaj7",
  "6",
  "m6",
]);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "V/V" as the learner reads the chord that is played: "V7/V"; a borrowed chord keeps its numeral ("♭VI"). */
export function outsideRn(id: string): string {
  const m = APPLIED_ID.exec(id);
  if (m && m[1] === "V") return rnDisplay(`V7/${m[2]}`);
  return rnDisplay(id);
}

/**
 * The learner's word for a choice of a Wave 6 family, or null when another table names it: the chord from outside
 * the key ("V7/V · leans to V", "♭VI · borrowed"), the hats' division, a chord quality where a quality is picked
 * by name.
 */
export function stageFOptionLabel(generator: string, id: string): string | null {
  if (generator === "harmony-chromatic") {
    const m = APPLIED_ID.exec(id);
    if (m) return `${outsideRn(id)} · leans to ${rnDisplay(m[2] as string)}`;
    if (/^b?[IViv]+[o°]?$/.test(id)) return `${rnDisplay(id)} · borrowed`;
    return null;
  }
  if (generator === "harmony-modulation") return id === "none" ? "No key change" : null;
  if (generator === "rhythm-subdivision") return DIVISION_WORDS[id] ?? null;
  if (generator === "chord-quality" && QUALITIES.has(id)) return cap(qualityLabel(id as ChordQuality).long);
  return null;
}

/** A level's category in plain words for a Wave 6 family (the level picker, "what a level adds"), or null. */
export function stageFCategoryLabel(generator: string, id: string): string | null {
  if (generator === "harmony-chromatic")
    return APPLIED_ID.test(id) || /^b?[IViv]+[o°]?$/.test(id) ? outsideRn(id) : null;
  if (generator === "harmony-modulation") return KEY_MOVE_WORDS[id] ?? null;
  if (generator === "rhythm-syncopation") return PUSH_WORDS[id] ?? null;
  if (generator === "rhythm-subdivision") return DIVISION_WORDS[id]?.split(":")[0]?.toLowerCase() ?? null;
  if (generator === "chord-quality" && QUALITIES.has(id)) return qualityLabel(id as ChordQuality).long;
  if (generator === "rhythm-echo" || generator === "rhythm-dictation" || generator === "rhythm-read") {
    if (id === "compound") return "6/8: two beats, each in three";
    if (id === "triplets") return "triplets";
    if (id === "syncopation") return "syncopation";
    if (id === "swing") return "swung eighths";
  }
  return null;
}

// --- seventh-chord quality ---------------------------------------------------------------------------

export interface SeventhFacts {
  quality: ChordQuality;
  /** "dominant seventh". */
  name: string;
  /** The two notes that tell the quality, as sizes above the root and as note names ("M3", "F♯"). */
  third: { interval: string; name: string } | null;
  seventh: { interval: string; name: string } | null;
  chord: ChordId;
}

const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const SIZE_WORDS: Readonly<Record<string, string>> = {
  M3: "a major 3rd",
  m3: "a minor 3rd",
  M7: "a major 7th",
  m7: "a minor 7th",
  d7: "a diminished 7th",
};

/** The lone seventh chord of a quality trial, read from its notes: its name and its 3rd and 7th. */
export function seventhFactsOf(trial: Trial<unknown>): SeventhFacts | null {
  const slots = chordSlotsOf(trial);
  if (slots.length !== 1) return null;
  const read = slots[0]?.reading?.chord;
  const rootPc = trial.params.rootPc;
  const asked = (trial.expected as Answer).qualities?.[0];
  // The chord as read from its notes; a rootless or inverted voicing is named from its root and its quality.
  let chord: ChordId | undefined = read;
  if (typeof rootPc === "number" && asked && (!read || read.rootPc !== rootPc || read.quality !== asked)) {
    const root = read && read.rootPc === rootPc ? read.root : (PC_NAMES[mod(rootPc, 12)] as string);
    try {
      chord = seventhChord(root, asked as never);
    } catch {
      chord = undefined;
    }
  }
  if (!chord) return null;
  const q = seventhQualityOf(chord);
  if (!q) return null;
  const g = guideTones(chord);
  const tone = (t: typeof g.third) => (t ? { interval: t.interval, name: noteShown(t.name) } : null);
  return { quality: q, name: seventhInfo(q).name, third: tone(g.third), seventh: tone(g.seventh), chord };
}

/**
 * "Which notes make it dominant": the 3rd and the 7th above the root, in the course's interval words, with the
 * note names when that lens is shown ("A major 3rd (F♯) under a minor 7th (C): that pair makes it a dominant
 * seventh.").
 */
export function seventhLine(facts: SeventhFacts, opts: { noteNames?: boolean } = {}): string {
  const part = (t: SeventhFacts["third"]): string =>
    t ? `${SIZE_WORDS[t.interval] ?? t.interval}${opts.noteNames ? ` (${t.name})` : ""}` : "";
  const third = part(facts.third);
  const seventh = part(facts.seventh);
  const tail =
    facts.quality === "m7b5"
      ? ", over a lowered 5th"
      : facts.quality === "dim7"
        ? ": minor 3rds all the way up"
        : "";
  return `${cap(third)} under ${seventh}${tail}: that pair makes it a ${facts.name}.`;
}

/** The quality a chord is most easily taken for: the learner's own wrong pick, else its contrast in the family. */
export function nearQualityOf(
  trial: Trial<unknown>,
  def: Pick<FamilyDef, "categories"> | null,
  got: Answer | null,
): ChordQuality | null {
  const want = (trial.expected as Answer).qualities?.[0];
  if (!want) return null;
  const picked = got?.qualities?.[0];
  if (picked && picked !== want) return picked as ChordQuality;
  const contrast = def?.categories.find((c) => c.id === want)?.contrastOf?.[0];
  return contrast && QUALITIES.has(contrast) ? (contrast as ChordQuality) : null;
}

const chordEvents = (notes: readonly number[], at: number, sound: string, dur = 1.3) =>
  notes.map((note) => ({ at, dur, value: { s: sound, note, gain: 0.55 } }));

/** The near miss on the same voicing, then the chord itself. Null when the voicing cannot take that quality. */
function qualityNear(trial: Trial<unknown>, near: ChordQuality): Listen | null {
  const midis = trial.params.midis;
  const rootPc = trial.params.rootPc;
  if (!Array.isArray(midis) || typeof rootPc !== "number") return null;
  const its = [...(midis as number[])];
  const other = revoice(its, rootPc, near);
  if (!other || other.every((m, i) => m === its[i])) return null;
  const sound = chordSlotsOf(trial)[0]?.sounds.chords ?? "piano";
  return {
    label: `Against a ${qualityLabel(near).long}`,
    plan: {
      events: [...chordEvents(other, 0, sound), ...chordEvents(its, 1.9, sound)],
      durationSec: 3.4,
      preload: [sound],
    },
  };
}

/** The 3rd and the 7th by themselves, then the whole chord: the two notes that tell a seventh chord's quality. */
export function guideTonePlan(trial: Trial<unknown>): AudioPlan | null {
  const facts = seventhFactsOf(trial);
  const slot = chordSlotsOf(trial)[0];
  if (!facts || !slot) return null;
  const g = guideTones(facts.chord);
  const pcs = [g.third?.pc, g.seventh?.pc].filter((p): p is NonNullable<typeof p> => p !== undefined);
  const pair = slot.midis.filter((m) => (pcs as number[]).includes(mod(m, 12)));
  if (pair.length < 2) return null;
  const sound = slot.sounds.chords;
  return {
    events: [...chordEvents(pair, 0, sound), ...chordEvents(slot.midis, 1.8, sound)],
    durationSec: 3.3,
    preload: [sound],
  };
}

// --- chromatic degrees ---------------------------------------------------------------------------------

const isFet = (trial: Trial<unknown>): boolean =>
  Array.isArray(trial.params.resolutionTargets) && trial.params.mode !== "sing";

/** The chromatic degree an FET trial asks for in a major key (♯4, ♭7, ♯5 …), with where it leans; else null. */
export function chromaticAskedOf(trial: Trial<unknown>) {
  const key = keyOf(trial);
  const d = (trial.expected as Answer).degrees;
  if (!isFet(trial) || !key || key.mode !== "major" || !d || d.length !== 1) return null;
  return chromaticDegree(d[0] as Degree);
}

interface SungTarget {
  midi: number;
  on: number;
  off: number;
}

/**
 * A chromatic degree resolves to the nearest note of the key in the direction it leans (♯4 up to 5, ♭7 down to 6),
 * two notes, instead of the whole walk home: the trial with its way home and its sung targets cut to that lean.
 * Any other trial comes back unchanged; so does one whose way home is already the lean.
 */
export function neighbourResolution<T extends Trial<unknown>>(trial: T): T {
  const d = chromaticAskedOf(trial);
  const targets = trial.params.resolutionTargets as SungTarget[] | undefined;
  const first = targets?.[0];
  if (!d || !targets || !first) return trial;
  const delta = d.raised ? 1 : -1;
  if (targets.length === 2 && targets[1]?.midi === first.midi + delta) return trial;
  const len = first.off - first.on;
  const second = targets[1] ?? { on: first.off, off: first.off + len };
  // The arrival is held a little longer than the leaning note: it is the note of the key.
  const lean: SungTarget[] = [first, { midi: first.midi + delta, on: second.on, off: second.off + len / 2 }];
  const evs = trial.resolution?.events ?? [];
  const e0 = evs[0];
  const e1 = evs[1] ?? e0;
  let resolution = trial.resolution;
  if (trial.resolution && e0 && e1 && e0.midi !== null) {
    // The second note is rewritten, so the literal the generator wrote for it no longer holds.
    const { written: _written, ...rest } = e1;
    const arrival: NEvent = {
      ...rest,
      id: `${e1.id}~lean`,
      midi: e0.midi + delta,
      onset: evs[1] ? e1.onset : rat(onsetOf(e0) + e0.dur[0] / e0.dur[1]),
      dur: rat((e1.dur[0] / e1.dur[1]) * 1.5),
    };
    resolution = { ...trial.resolution, events: [e0, arrival] };
  }
  return {
    ...trial,
    params: { ...trial.params, resolutionTargets: lean, resolutionShape: "lean" },
    ...(resolution ? { resolution } : {}),
  };
}

/** "♯4 leans up to 5", with the chromatic syllables when asked ("fi sol"). */
export function leanText(trial: Trial<unknown>, syllables: boolean): string | null {
  const d = chromaticAskedOf(trial);
  if (!d) return null;
  const to = d.resolvesTo;
  const head = `${d.display} leans ${d.raised ? "up" : "down"} to ${shown(to)}`;
  return syllables ? `${head} · ${d.syllable} ${syllableOf(to)}` : head;
}

/** The labels of a chromatic lean's two sung notes ("♯4 · fi", "5 · sol"), or null for any other trial. */
export function leanLabels(trial: Trial<unknown>, syllables: boolean): string[] | null {
  const d = chromaticAskedOf(trial);
  if (!d || (trial.params.resolutionTargets as unknown[] | undefined)?.length !== 2) return null;
  const to = d.resolvesTo;
  return syllables
    ? [`${d.display} · ${d.syllable}`, `${shown(to)} · ${syllableOf(to)}`]
    : [d.display, shown(to)];
}

/** The degrees of a chromatic lean as they are recorded (♯5 6, never ♭6 6), or null for any other trial. */
export function leanPath(trial: Trial<unknown>): Degree[] | null {
  const d = chromaticAskedOf(trial);
  if (!d || (trial.params.resolutionTargets as unknown[] | undefined)?.length !== 2) return null;
  return [d.degree, d.resolvesTo];
}

const CATEGORY_DEGREE = /^(?:deg\.)?([#bs]?)([1-7])$/;
/** A degree category of a family as a degree ("deg.s4" → "#4", "deg.b7" → "b7"), or null. */
export function categoryDegree(id: string): Degree | null {
  const m = CATEGORY_DEGREE.exec(id);
  if (!m) return null;
  return `${m[1] === "s" ? "#" : (m[1] ?? "")}${m[2]}` as Degree;
}

/** The pad's own spelling of each pitch a major key does not own (the key's usual labels: ♭2 ♭3 ♯4 ♭6 ♭7). */
const PAD_SPELLING: Readonly<Record<number, Degree>> = { 1: "b2", 3: "b3", 6: "#4", 8: "b6", 10: "b7" };

/**
 * The degree pad of a chromatic-degree trial: the level's degrees, one key per pitch. ♯5 and ♭6 are one sound when
 * a note is heard by itself, so the pad offers that pitch once, under the key's usual label, and never shows which
 * spelling was asked; `padAnswer` reads the pick as the asked spelling.
 */
export function chromaticPadSet(degrees: readonly Degree[]): Degree[] {
  const bySemis = new Map<number, Degree>();
  for (const d of degrees) {
    const s = mod(degreeSemitones(d), 12);
    bySemis.set(s, PAD_SPELLING[s] ?? d);
  }
  return [...bySemis.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
}

/** The learner's picks with each one read as the asked spelling where they are the same pitch (♭6 for ♯5). */
export function padAnswer(picked: readonly Degree[], expected: readonly Degree[]): Degree[] {
  return picked.map((d, i) => {
    const want = expected[i];
    return want && mod(degreeSemitones(d), 12) === mod(degreeSemitones(want), 12) ? want : d;
  });
}

/** The note of the key a chromatic degree stands beside (4 for ♯4, 7 for ♭7), then the chromatic note. */
function leanNear(trial: Trial<unknown>): Listen | null {
  const d = chromaticAskedOf(trial);
  const alone = noteAlonePlan(trial);
  const note = alone?.events[0];
  if (!d || !alone || !note || typeof note.value.note !== "number") return null;
  const beside = note.value.note + (d.raised ? -1 : 1);
  const replaced = shown(d.degree.replace(/^[#b]/, ""));
  return {
    label: `Against ${replaced}`,
    plan: {
      events: [
        { at: 0, dur: 1.1, value: { ...note.value, note: beside } },
        { at: 1.4, dur: 1.2, value: note.value },
      ],
      durationSec: 2.8,
      preload: alone.preload,
    },
  };
}

// --- the chord from outside the key ---------------------------------------------------------------------

export interface OutsideNote {
  /** "F♯". */
  name: string;
  /** "♯4". */
  degree: string;
  /** "fi". */
  syllable: string;
}
export interface OutsideChord {
  /** 1-based bar of the passage. */
  bar: number;
  /** Index into the trial's chord slots. */
  index: number;
  kind: "secondary" | "borrowed";
  /** "V7/V", "iv", "♭VI". */
  rn: string;
  /** "D7". */
  symbol: string;
  /** The chord it leans to (an applied chord's target), as a numeral and a symbol. */
  target: { rn: string; symbol: string } | null;
  /** The notes from outside the key, as degrees with their syllables. */
  notes: OutsideNote[];
  /** The key's own chord on the same degree (ii for V7/V, IV for iv, vi for ♭VI): the near miss. */
  twin: { rn: string; chord: ChordId } | null;
}

/** The chord of a passage that steps outside its (major) key, read from the notes with @oak/theory; else null. */
export function outsideChordOf(trial: Trial<unknown>): OutsideChord | null {
  const key = keyOf(trial);
  if (!key || trial.family !== "fam.har.chromatic") return null;
  const slots = chordSlotsOf(trial);
  const scale = new Set<number>(scalePcs(key));
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i] as ChordSlot;
    const chord = s.reading?.chord;
    if (!chord) continue;
    const next = slots[i + 1]?.reading?.chord;
    const kind = outsideChordKind(chord, key, next);
    if (!kind) continue;
    const applied = kind === "borrowed" ? null : appliedReading(chord, key, next);
    const borrowed = kind === "borrowed" ? borrowedReading(chord, key) : null;
    const outside = [...new Set(s.midis.map((m) => mod(m, 12)))].filter((pc) => !scale.has(pc));
    const notes = outside.map((pc) => {
      const l = chromaticLabel(60 + pc, key, { chord });
      return { name: noteShown(l.name), degree: l.display, syllable: l.syllable };
    });
    // The key's own chord on the same scale degree: the root itself where the key owns it (ii for V7/V), else the
    // degree a half step above a lowered root (vi for ♭VI). A seventh for a seventh.
    const order = scalePcs(key) as number[];
    const own0 = order.indexOf(chord.rootPc);
    const rootIndex = own0 >= 0 ? own0 : order.indexOf(mod(chord.rootPc + 1, 12));
    const seventh = seventhQualityOf(chord) !== null;
    const own = rootIndex >= 0 ? (diatonicChords(key, seventh)[rootIndex] ?? null) : null;
    return {
      bar: Math.floor(s.at + 1e-9) + 1,
      index: i,
      kind: kind === "borrowed" ? "borrowed" : "secondary",
      rn: rnDisplay(applied?.rn ?? borrowed?.rn ?? romanText(chord, key, next)),
      symbol: noteShown(toLeadSheet(chord)),
      target: applied ? { rn: rnDisplay(applied.target.rn), symbol: noteShown(applied.target.symbol) } : null,
      notes,
      twin: own ? { rn: rnDisplay(romanText(own, key)), chord: own } : null,
    };
  }
  return null;
}

/**
 * What the chord was, in a sentence: "Bar 3 is V7/V: the dominant of V, a visitor that leans to V. Its ♯4 (fi) is
 * the note from outside the key." Symbols and note names appear when their lenses are shown.
 */
export function outsideLine(
  o: OutsideChord,
  key: KeySpec,
  opts: { chordSymbols?: boolean; noteNames?: boolean; syllables?: boolean } = {},
): string {
  const sym = opts.chordSymbols ? ` (${o.symbol})` : "";
  const note = (n: OutsideNote): string =>
    `${n.degree}${opts.syllables ? ` (${n.syllable})` : ""}${opts.noteNames ? `, ${n.name}` : ""}`;
  const notes =
    o.notes.length === 0
      ? ""
      : o.notes.length === 1
        ? ` Its ${note(o.notes[0] as OutsideNote)} is the note from outside the key.`
        : ` Its ${o.notes.map(note).join(" and ")} are the notes from outside the key.`;
  const what =
    o.kind === "secondary" && o.target
      ? `the dominant of ${o.target.rn}, and it leans to ${o.target.rn}${opts.chordSymbols ? ` (${o.target.symbol})` : ""}`
      : `borrowed from ${keyDisplay({ tonic: key.tonic, mode: "minor" })}${o.twin ? `, where the key's own chord is ${o.twin.rn}` : ""}`;
  return `Bar ${o.bar} is ${o.rn}${sym}: ${what}.${notes}`;
}

/** Each note moved to the nearest note of `chord` (at most a whole step away), so a voicing keeps its shape. */
function toChord(midi: number, chord: ChordId): number {
  const pcs = chordNotes(chord).map(pcOfName);
  let best = midi;
  let bestD = 99;
  for (const pc of pcs) {
    let d = mod(pc - midi, 12);
    if (d > 6) d -= 12;
    if (Math.abs(d) < Math.abs(bestD) || (Math.abs(d) === Math.abs(bestD) && d < bestD)) {
      bestD = d;
      best = midi + d;
    }
  }
  return Math.abs(bestD) <= 2 ? best : midi;
}

/** The passage with the key's own chord in the outside chord's place: the near miss, all inside the key. */
function twinNear(trial: Trial<unknown>): Listen | null {
  const o = outsideChordOf(trial);
  const slot = o ? chordSlotsOf(trial)[o.index] : undefined;
  if (!o?.twin || !slot) return null;
  const cue = cueBarsOf(trial);
  const from = slot.at + cue;
  const to = from + slot.dur;
  const twin = o.twin.chord;
  const events = trial.events.map((e) =>
    e.midi !== null && onsetOf(e) >= from - 1e-9 && onsetOf(e) < to - 1e-9
      ? { ...e, midi: toChord(e.midi, twin) }
      : e,
  );
  return {
    label: `With ${o.twin.rn}, the key's own chord`,
    plan: eventsToAudioPlan(events, trial.cps, { fromBar: cue, bars: barsOf(trial) - cue }),
  };
}

/** The outside chord by itself, then the chord it moves to. */
function outsideAlone(trial: Trial<unknown>): AudioPlan | null {
  const o = outsideChordOf(trial);
  const slots = chordSlotsOf(trial);
  const s = o ? slots[o.index] : undefined;
  if (!o || !s) return null;
  const next = slots[o.index + 1];
  const sound = s.sounds.chords;
  return {
    events: [
      ...chordEvents(s.midis, 0, sound, 1.5),
      ...(next ? chordEvents(next.midis, 1.8, sound, 1.6) : []),
    ],
    durationSec: next ? 3.6 : 1.8,
    preload: [sound],
  };
}

// --- modes -----------------------------------------------------------------------------------------------

/** The scale a mode is heard against: major for Mixolydian and Lydian, natural minor for Dorian and Phrygian. */
const familyOf = (mode: string): ScaleMode | null =>
  mode in MODE_CHARACTERISTIC
    ? (MODE_CHARACTERISTIC[mode as keyof typeof MODE_CHARACTERISTIC].parent as ScaleMode)
    : null;

/** "Dorian: minor with a raised 6 (1 2 ♭3 4 5 6 ♭7).": the one note that makes the colour. Null for major and minor. */
export function modeLine(trial: Trial<unknown>): string | null {
  const key = keyOf(trial);
  if (!key || !(key.mode in MODE_CHARACTERISTIC)) return null;
  const c = MODE_CHARACTERISTIC[key.mode as keyof typeof MODE_CHARACTERISTIC];
  const name = modeColour(key.mode as ScaleMode)?.name ?? cap(key.mode);
  const raised = degreeSemitones(c.tone) > degreeSemitones(c.replaces);
  const scale = (MODE_DEGREES[key.mode as ScaleMode] ?? []).map(shown).join(" ");
  return `${name}: ${c.parent === "major" ? "major" : "natural minor"} with ${raised ? "a raised" : "a lowered"} ${c.tone.replace(/^[#b]/, "")} (${scale}).`;
}

/** The mode a tune is most easily taken for: the learner's wrong pick, else the scale it is compared with. */
export function nearModeOf(
  trial: Trial<unknown>,
  def: Pick<FamilyDef, "categories"> | null,
  got: Answer | null,
): ScaleMode | null {
  const key = keyOf(trial);
  if (!key || !(key.mode in MODE_DEGREES)) return null;
  const picked = got?.choice?.[0];
  if (picked && picked !== key.mode && picked in MODE_DEGREES) return picked as ScaleMode;
  const family = familyOf(key.mode);
  if (family) return family;
  const contrast = def?.categories.find((c) => c.id === key.mode)?.contrastOf?.[0];
  return contrast && contrast in MODE_DEGREES && contrast !== key.mode ? (contrast as ScaleMode) : null;
}

/** The tune of a mode trial moved, degree by degree, into another scale on the same home note. */
function modeNear(trial: Trial<unknown>, to: ScaleMode): Listen | null {
  const key = keyOf(trial);
  const from = key ? (MODE_DEGREES[key.mode as ScaleMode] as readonly Degree[] | undefined) : undefined;
  const dest = MODE_DEGREES[to] as readonly Degree[] | undefined;
  if (!key || !from || !dest || from.length !== dest.length) return null;
  const tonic = tonicPc(key);
  const cue = cueBarsOf(trial);
  const mel = trial.events.filter((e) => e.track === "mel" && e.midi !== null);
  if (mel.length === 0) return null;
  let changed = false;
  const events = mel.map((e) => {
    const rel = mod((e.midi as number) - tonic, 12);
    const i = from.findIndex((d) => mod(degreeSemitones(d), 12) === rel);
    if (i < 0) return e;
    const delta = mod(degreeSemitones(dest[i] as Degree), 12) - rel;
    if (delta !== 0) changed = true;
    return { ...e, midi: (e.midi as number) + delta };
  });
  if (!changed) return null;
  const name = to === "minor" ? "natural minor" : to === "major" ? "major" : (modeColour(to)?.name ?? to);
  return {
    label: `The tune in ${to === "major" || to === "minor" ? name : cap(name)}`,
    plan: eventsToAudioPlan(events, trial.cps, { fromBar: cue, bars: barsOf(trial) - cue }),
  };
}

// --- key changes -----------------------------------------------------------------------------------------

export interface KeySpan {
  /** 1-based, inclusive. */
  fromBar: number;
  toBar: number;
  key: KeySpec;
  /** "A♭ major". */
  label: string;
}
export interface KeyChange {
  from: KeySpec;
  /** Null when the key never moved. */
  to: KeySpec | null;
  /** The first bar of the new key (1-based), or null. */
  bar: number | null;
  /** Semitones up from the old home to the new one (0–11); 0 with no change. */
  semitones: number;
  /** `up-half`, `up-step`, `relative`, `dominant` … (@oak/theory `keyDistance`), or `same`. */
  relation: string;
  /** "up a half step", "to the relative minor"; empty with no change. */
  move: string;
  spans: KeySpan[];
}

const MOVE_WORDS: Readonly<Record<string, string>> = {
  "up-half": "up a half step",
  "up-step": "up a whole step",
  "down-step": "down a whole step",
  dominant: "up a fifth, to the dominant",
  subdominant: "up a fourth, to the subdominant",
  relative: "to the relative minor, a minor third below",
  parallel: "to the parallel key on the same home note",
};

/** A key-change trial read from its params: the two keys, where the new one begins, which way and how far. */
export function keyChangeOf(trial: Trial<unknown>): KeyChange | null {
  const from = keyOf(trial);
  if (!from || trial.family !== "fam.har.modulation" || !("newKey" in trial.params)) return null;
  const bars = barsOf(trial) - cueBarsOf(trial);
  const nk = trial.params.newKey as KeySpec | null;
  const want = (trial.expected as Answer).choice?.[0];
  const bar = nk && want && /^\d+$/.test(want) ? Number(want) : null;
  if (!nk || bar === null)
    return {
      from,
      to: null,
      bar: null,
      semitones: 0,
      relation: "same",
      move: "",
      spans: [{ fromBar: 1, toBar: bars, key: from, label: keyDisplay(from) }],
    };
  const dist = keyDistance(from, nk);
  const s = dist.semitones;
  const move = MOVE_WORDS[dist.relation] ?? (s <= 6 ? `up ${s} half steps` : `down ${12 - s} half steps`);
  return {
    from,
    to: nk,
    bar,
    semitones: s,
    relation: dist.relation,
    move,
    spans: [
      { fromBar: 1, toBar: bar - 1, key: from, label: keyDisplay(from) },
      { fromBar: bar, toBar: bars, key: nk, label: keyDisplay(nk) },
    ],
  };
}

/** The key in force at a bar of a key-change trial (1-based): the old key before the change, the new one from it. */
export function keyAtBar(k: KeyChange, bar: number): KeySpec {
  return k.to && k.bar !== null && bar >= k.bar ? k.to : k.from;
}

/**
 * The answer in context for a passage that changes key: every chord read in the key in force at its bar (its bass
 * degree, its symbol, its numeral), never in the first key. Symbols and numerals as their lenses allow.
 */
export function keyChangeLabels(
  trial: Trial<unknown>,
  shown: { chordSymbols: boolean; romanNumerals: boolean },
): { bar: number; degree: string; symbol: string | null; rn: string | null }[] {
  const k = keyChangeOf(trial);
  if (!k) return [];
  return chordSlotsOf(trial).map((s) => {
    const bar = Math.floor(s.at + 1e-9) + 1;
    const key = keyAtBar(k, bar);
    const chord = s.reading?.chord;
    return {
      bar,
      degree: chromaticLabel(s.bass, key, chord ? { chord } : {}).display,
      symbol: shown.chordSymbols && chord ? noteShown(toLeadSheet(chord)) : null,
      rn: shown.romanNumerals && chord ? rnDisplay(romanText(chord, key)) : null,
    };
  });
}

/** "Home moves at bar 4: G major to A♭ major, up a half step." / "Home never moved: G major all the way." */
export function keyChangeLine(k: KeyChange): string {
  if (!k.to || k.bar === null) return `Home never moved: ${keyDisplay(k.from)} all the way.`;
  return `Home moves at bar ${k.bar}: ${keyDisplay(k.from)} to ${keyDisplay(k.to)}, ${k.move}.`;
}

const homeChord = (key: KeySpec): number[] => {
  const t = tonicIn(key, 55);
  const third = /minor|aeolian|dorian|phrygian/.test(key.mode) ? 3 : 4;
  return [t - 12, t, t + third, t + 7];
};

/** The old home chord, then the new one ("the two homes"); the one home when the key never moved. */
function homesPlan(trial: Trial<unknown>): AudioPlan | null {
  const k = keyChangeOf(trial);
  if (!k) return null;
  const chord = (key: KeySpec, at: number) =>
    homeChord(key).map((note) => ({ at, dur: 1.4, value: { s: "piano", note, gain: 0.5 } }));
  return {
    events: [...chord(k.from, 0), ...(k.to ? chord(k.to, 1.9) : [])],
    durationSec: k.to ? 3.6 : 1.7,
    preload: ["piano"],
  };
}

/** A lift undone: the bars after the change moved back to the old key, so the phrase simply repeats. */
function unliftedNear(trial: Trial<unknown>): Listen | null {
  const k = keyChangeOf(trial);
  if (!k?.to || k.bar === null || (k.relation !== "up-half" && k.relation !== "up-step")) return null;
  const cue = cueBarsOf(trial);
  const from = cue + k.bar - 1;
  const events = trial.events.map((e) =>
    e.midi !== null && onsetOf(e) >= from - 1e-9 ? { ...e, midi: e.midi - k.semitones } : e,
  );
  return {
    label: "Without the lift",
    plan: eventsToAudioPlan(events, trial.cps, { fromBar: cue, bars: barsOf(trial) - cue }),
  };
}

// --- a second question for the ear -------------------------------------------------------------------------

/**
 * A question asked after the answer, for the ear only: it is never recorded and changes no result. After "in which
 * bar": which chord it was (and where it leans); after "where does the new key begin": which way home moved and
 * how far.
 */
export interface FollowUp {
  prompt: string;
  options: { id: string; label: string }[];
  correct: string;
  /** Said once it is answered. */
  answer: string;
}

const MOVE_OPTIONS: readonly { id: string; label: string; from: string }[] = [
  { id: "up-half", label: "Up a half step", from: "truck-driver" },
  { id: "up-step", label: "Up a whole step", from: "truck-driver" },
  { id: "relative", label: "To the relative minor", from: "relative" },
  { id: "dominant", label: "Up a fifth, to the dominant", from: "dominant-pivot" },
];

export function followUpOf(
  trial: Trial<unknown>,
  def: Pick<FamilyDef, "levels" | "generator">,
): FollowUp | null {
  const level = def.levels[Math.max(0, Math.min(def.levels.length, trial.level) - 1)];
  const cats = new Set([...(level?.categories ?? []), trial.category]);
  if (def.generator === "harmony-modulation") {
    const k = keyChangeOf(trial);
    if (!k?.to) return null;
    const options = MOVE_OPTIONS.filter((o) => cats.has(o.from) || o.id === k.relation).map(
      ({ id, label }) => ({ id, label }),
    );
    if (options.length < 2 || !options.some((o) => o.id === k.relation)) return null;
    return {
      prompt: "Which way did home move, and how far?",
      options,
      correct: k.relation,
      answer: `${keyDisplay(k.from)} to ${keyDisplay(k.to)}: ${k.move}.`,
    };
  }
  if (def.generator === "harmony-chromatic") {
    // Only after the "which bar" question: the "which chord" trial has asked it already.
    const o = outsideChordOf(trial);
    if (!o || trial.params.ui !== "bar-buttons") return null;
    const ids = [...cats].filter((c) => stageFCategoryLabel("harmony-chromatic", c) !== null);
    if (ids.length < 2 || !ids.includes(trial.category)) return null;
    return {
      prompt: `Which chord was it in bar ${o.bar}?`,
      options: ids.map((id) => ({ id, label: stageFOptionLabel("harmony-chromatic", id) ?? outsideRn(id) })),
      correct: trial.category,
      answer: o.target
        ? `${o.rn}: it leans to ${o.target.rn}.`
        : `${o.rn}: borrowed from the parallel minor.`,
    };
  }
  return null;
}

// --- rhythm II ------------------------------------------------------------------------------------------------

const COUNT_16 = ["", "e", "&", "a"] as const;

/** The count of a sixteenth-note cell in 4/4 ("the & of 4", "beat 2"). */
export function cellCount(cell: number, stepsPerBar = 16): string {
  const per = stepsPerBar / 4;
  const beat = Math.floor((cell % stepsPerBar) / per) + 1;
  const part = per === 4 ? COUNT_16[cell % 4] : per === 2 ? ["", "&"][cell % 2] : "";
  return part ? `the ${part} of ${beat}` : `beat ${beat}`;
}

export interface ClickCells {
  spec: Extract<AnswerSpec, { ui: "grid" }>;
  /** The cells to mark, as the grid's own step ids ("14"). */
  expected: string[];
}

/**
 * A "click the cell" trial (find the push) on the rhythm grid: one row of cells for the loop, grouped by the beat,
 * instead of a button per cell. A loop of one bar heard twice is one bar of cells.
 */
export function clickCellsOf(trial: Trial<unknown>): ClickCells | null {
  const p = trial.params;
  if (p.ui !== "click-cell") return null;
  const per = Number(p.stepsPerBar ?? 16);
  if (per !== 8 && per !== 16) return null;
  const ids = ((trial.expected as Answer).choice ?? []).map((c) => Number(String(c).replace(/^c/, "")));
  if (ids.length === 0 || ids.some((n) => !Number.isInteger(n))) return null;
  const bars = Math.max(1, Math.floor(Math.max(...ids) / per) + 1);
  return {
    spec: { ui: "grid", rows: ["hit"], stepsPerBar: per, bars },
    expected: ids.map(String),
  };
}

/**
 * The cells to mark in counts, for the feedback line ("That's it: the & of 2."), never the grid's own ids ("c6");
 * past the first bar each names its bar ("bar 2, the a of 3").
 */
export function clickCellText(trial: Trial<unknown>): string | null {
  const cells = clickCellsOf(trial);
  if (!cells) return null;
  const per = cells.spec.stepsPerBar;
  return cells.expected
    .map((id) => {
      const c = Number(id);
      return cells.spec.bars > 1 ? `bar ${Math.floor(c / per) + 1}, ${cellCount(c, per)}` : cellCount(c, per);
    })
    .join("; ");
}

/** The grid's marked steps as the family's own answer ("c14"). */
export const clickCellAnswer = (steps: readonly string[]): Answer => ({ choice: steps.map((s) => `c${s}`) });

/** Where the pushed kicks sit, in counts: "The pushed kick is on the & of 4, an eighth ahead of beat 1." */
export function pushLine(trial: Trial<unknown>): string | null {
  const cells = clickCellsOf(trial);
  if (!cells || trial.family !== "fam.rhy.syncopation") return null;
  const per = cells.spec.stepsPerBar;
  const beatLen = per / 4;
  const parts = cells.expected.map((id) => {
    const c = Number(id);
    const gap = beatLen - (c % beatLen);
    const next = (Math.floor((c % per) / beatLen) + 1) % 4;
    const ahead =
      gap === beatLen / 2 ? "an eighth" : gap === beatLen / 4 ? "a sixteenth" : "three sixteenths";
    return `${cellCount(c, per)}, ${ahead} ahead of beat ${next + 1}`;
  });
  return parts.length === 1
    ? `The pushed kick is on ${parts[0]}.`
    : `The pushed kicks are on ${parts.join(" and on ")}.`;
}

/** The groove with every pushed kick moved onto the beat it reaches for: the near miss of a push. */
function onBeatNear(trial: Trial<unknown>): Listen | null {
  if (trial.family !== "fam.rhy.syncopation") return null;
  const beat = 1 / 4;
  const isKick = (e: NEvent) => e.track === "kick" || e.drum === "kick";
  const kicks = trial.events.filter(isKick);
  if (kicks.length === 0) return null;
  const on = new Set(
    kicks.filter((e) => mod(onsetOf(e), beat) < 1e-6).map((e) => Math.round(onsetOf(e) * RAT)),
  );
  let moved = false;
  const events: NEvent[] = [];
  for (const e of trial.events) {
    const t = onsetOf(e);
    if (!isKick(e) || mod(t, beat) < 1e-6) {
      events.push(e);
      continue;
    }
    moved = true;
    const to = (Math.floor(t / beat + 1e-9) + 1) * beat;
    if (on.has(Math.round(to * RAT)) || to >= barsOf(trial) - 1e-9) continue;
    on.add(Math.round(to * RAT));
    events.push({ ...e, onset: rat(to) });
  }
  if (!moved) return null;
  return {
    label: "With the kick on the beat",
    plan: eventsToAudioPlan(events, trial.cps, { bars: barsOf(trial) }),
  };
}

const PER_BEAT: Readonly<Record<string, number>> = { eighths: 2, triplets: 3, sixteenths: 4 };

/** The same groove with the hats dividing the asked beats another way (two, three or four to the beat). */
function divisionNear(
  trial: Trial<unknown>,
  def: Pick<FamilyDef, "categories"> | null,
  got: Answer | null,
): Listen | null {
  if (trial.family !== "fam.rhy.subdivision") return null;
  const want = (trial.expected as Answer).choice?.[0] ?? "";
  const picked = got?.choice?.[0];
  const to =
    picked && picked !== want && PER_BEAT[picked]
      ? picked
      : (def?.categories.find((c) => c.id === want)?.contrastOf?.[0] ??
        (want === "eighths" ? "triplets" : "eighths"));
  const n = PER_BEAT[want];
  const m = PER_BEAT[to];
  if (!n || !m || n === m) return null;
  const beat = 1 / 4;
  const isHat = (e: NEvent) => e.track === "hats" || e.drum === "hatClosed" || e.drum === "hatOpen";
  const hats = trial.events.filter(isHat);
  const perBeat = new Map<number, NEvent[]>();
  for (const e of hats) {
    const b = Math.floor(onsetOf(e) / beat + 1e-9);
    perBeat.set(b, [...(perBeat.get(b) ?? []), e]);
  }
  const events: NEvent[] = trial.events.filter((e) => !isHat(e));
  let changed = false;
  for (const [b, evs] of perBeat) {
    const first = evs[0] as NEvent;
    if (evs.length !== n) {
      events.push(...evs);
      continue;
    }
    changed = true;
    for (let k = 0; k < m; k++)
      events.push({ ...first, id: `${first.id}~${k}`, onset: rat((b + k / m) * beat), dur: rat(beat / m) });
  }
  if (!changed) return null;
  return {
    label: `With ${to} instead`,
    plan: eventsToAudioPlan(events, trial.cps, { bars: barsOf(trial) }),
  };
}

export interface CountMark {
  /** Seconds from the start of the response window. */
  at: number;
  label: string;
  beat: boolean;
}

/**
 * The count under a tap timeline where the beat divides in three: "1 la li 2 la li" in a compound meter, "1 trip
 * let" where a trial in a simple meter taps triplets. Empty for plain duple rhythm (the beat lines say enough).
 */
export function countMarks(trial: Trial<unknown>, spanSec: number): CountMark[] {
  const id = (trial.params.meter as MeterId | undefined) ?? "4/4";
  const meter = METERS[id] ?? METERS["4/4"];
  const compound = meter.tempoUnit === "dottedQuarter";
  const barSec = 1 / trial.cps;
  const targets = (trial.params.tapTargets as number[] | undefined) ?? [];
  const beatSec = barSec / meter.unitsPerBar;
  // A tap a third of the way through a beat: the trial taps triplets.
  const third = (t: number): boolean => {
    const f = mod(t, beatSec) / beatSec;
    return Math.abs(f - 1 / 3) < 0.04 || Math.abs(f - 2 / 3) < 0.04;
  };
  const triplets = !compound && targets.some(third);
  if (!compound && !triplets) return [];
  let grid: ReturnType<typeof beatGrid>;
  try {
    grid = beatGrid(id, { triplets });
  } catch {
    return [];
  }
  const out: CountMark[] = [];
  for (let bar = 0; bar * barSec < spanSec; bar++)
    for (const l of grid.lines) {
      const at = (bar + l.at[0] / l.at[1]) * barSec;
      if (at < spanSec) out.push({ at, label: l.label, beat: l.level === "beat" });
    }
  return out;
}

/** "6/8: two beats to the bar, each in three (1 la li 2 la li)." for a trial in a compound meter, else null. */
export function meterLine(trial: Trial<unknown>): string | null {
  const id = (trial.params.meter as MeterId | undefined) ?? "4/4";
  const meter = METERS[id] as (typeof METERS)[MeterId] | undefined;
  if (meter?.tempoUnit !== "dottedQuarter") return null;
  const words = ["no", "one", "two", "three", "four"][meter.unitsPerBar] ?? String(meter.unitsPerBar);
  const count = beatGrid(id)
    .lines.map((l) => l.label)
    .join(" ");
  return `${id}: ${words} beats to the bar, each in three (${count}).`;
}

// --- alone, and against the near miss ------------------------------------------------------------------------

/** Wave 6 families with their own "alone" (the rest keep Wave 5's: the note, the tune, the hats). */
export function wave6Alone(trial: Trial<unknown>): Listen | null {
  const plan = (label: string, p: AudioPlan | null): Listen | null => (p ? { label, plan: p } : null);
  switch (trial.family) {
    case "fam.chd.quality-7th":
      return (
        plan("The 3rd and 7th alone", guideTonePlan(trial)) ??
        plan("The chord, note by note", arpeggioPlan(trial))
      );
    case "fam.har.chromatic":
      return plan("The chord, then where it goes", outsideAlone(trial));
    case "fam.har.modulation":
      return plan(keyChangeOf(trial)?.to ? "The two homes" : "Home", homesPlan(trial));
    case "fam.rhy.syncopation":
      return plan("Kick alone", tracksPlan(trial, ["kick"]));
    case "fam.rhy.subdivision":
      return plan("Hats alone", tracksPlan(trial, ["hats", "hatClosed", "hatOpen"]));
    default:
      return null;
  }
}

/**
 * The thing against its near miss (contrast is how the ear learns the edge): a seventh chord against the quality it
 * is taken for, a chromatic degree against the note of the key beside it, the outside chord against the key's own,
 * a mode's tune in the scale it is compared with, a lift undone, a push put back on the beat, the hats divided
 * another way. The learner's own wrong pick is the near miss when there is one. Null when a trial has none.
 */
export function nearMissOf(
  trial: Trial<unknown>,
  def: Pick<FamilyDef, "categories"> | null,
  got: Answer | null,
): Listen | null {
  switch (trial.family) {
    case "fam.chd.quality-7th":
    case "fam.chd.quality-triad": {
      const near = nearQualityOf(trial, def, got);
      return near ? qualityNear(trial, near) : null;
    }
    case "fam.deg.fet-chromatic":
      return leanNear(trial);
    case "fam.har.chromatic":
      return twinNear(trial);
    case "fam.key.mode": {
      const near = nearModeOf(trial, def, got);
      return near ? modeNear(trial, near) : null;
    }
    case "fam.har.modulation":
      return unliftedNear(trial);
    case "fam.rhy.syncopation":
      return onBeatNear(trial);
    case "fam.rhy.subdivision":
      return divisionNear(trial, def, got);
    default:
      return null;
  }
}

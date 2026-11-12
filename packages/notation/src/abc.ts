// NotationModel → ABC text for abcjs 6.7.2 (promoted from spikes/s4-notation/abc.ts).
// - One `!class=oak-e{n}!` decoration per element (several classes allowed in its value), placed after
//   the tuplet marker and before the chord brackets; tied pieces repeat it; rests carry none.
// - Accidentals against the key signature and earlier accidentals in the same bar, staff and octave
//   (naturals included); a note tied in over the bar line is not restated. Courtesy accidentals: the first
//   note of a letter and octave after a bar that altered it, and a note whose letter is altered in another
//   octave of the same bar, are written out (abcjs has no parenthesised form: ABCJS_LIMITS).
// - Theoretical keys (more than seven accidentals) get an explicit signature (`K:C exp ^^f ^c …`).
// - Key changes (`score.keyChanges`): `[K:…]` at the bar line, in every pitched voice.
// - Annotation lines (degree, solfège, name): one `w:` line per kind under every pitched staff, or stacked
//   `"^…"` texts over the notes.
// - Spaces at beam-group boundaries, `(p:q:r` tuplets, `-` ties, `z` rests, `x` invisible rests.
import type { CodeRange, KeySpec, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { barBeat } from "./build.ts";
import { type NoteAnnotation, noteAnnotations } from "./options.ts";
import { keySig } from "./theory-port.ts";
import type { AbcOptions, AbcResult, IdMapEntry, NoteItem, Score, Staff, Voice } from "./types.ts";

const ACC: Record<number, string> = { [-2]: "__", [-1]: "_", 0: "=", 1: "^", 2: "^^" };

/** "C4" → C, "C5" → c, "C6" → c', "C3" → C, (ABC octave marks). */
export function abcPitchLetter(letter: string, oct: number): string {
  return oct >= 5
    ? letter.toLowerCase() + "'".repeat(oct - 5)
    : letter.toUpperCase() + ",".repeat(Math.max(0, 4 - oct));
}
/** Written value → ABC length suffix with `L:1/16`: quarter "4", sixteenth "", 32nd "/2", dotted 16th "3/2". */
export function abcLength(w: NoteItem["written"]): string {
  const sixteenths = R.mul(R.mul([16, w.base], [2 ** (w.dots + 1) - 1, 2 ** w.dots]), [1, 1]);
  const v: Rat = [sixteenths[0], sixteenths[1]];
  if (v[1] === 1) return v[0] === 1 ? "" : `${v[0]}`;
  return `${v[0] === 1 ? "" : v[0]}/${v[1]}`;
}
const tempoUnitAbc = { quarter: "1/4", dottedQuarter: "3/8", eighth: "1/8" } as const;

interface Ctx {
  score: Score;
  prefix: string;
  sig: Record<string, number>;
  /** Accidental token per (staff, bar, voice, item, pitch). */
  acc: Map<string, string>;
  /** Annotation texts by `n` (empty without `score.annotations`). */
  ann: Map<number, NoteAnnotation>;
}

/** The annotation lines of a score, in order (degree, solfège, name): only the kinds asked for. */
function annotationKinds(score: Score): ("degree" | "solfege" | "noteName")[] {
  const a = score.annotations;
  if (!a) return [];
  const kinds: ("degree" | "solfege" | "noteName")[] = [];
  if (a.degree && score.key) kinds.push("degree");
  if (a.solfege && score.key) kinds.push("solfege");
  if (a.noteName) kinds.push("noteName");
  return kinds;
}
function annotationTexts(a: NoteAnnotation | undefined, score: Score): string[] {
  return annotationKinds(score).map((k) => a?.[k] ?? "");
}
/** A lyric syllable: spaces (a chord's members) become `~`, abcjs's lyric specials are dropped. */
function syllable(text: string): string {
  const t = text
    .replace(/[-_*|]/g, "")
    .trim()
    .replace(/\s+/g, "~");
  return t === "" ? "*" : t;
}
/** One `w:` line per annotation kind for a voice's bars `from` … `to` (tie continuations take `*`). */
function annotationLines(ctx: Ctx, voice: Voice, from: number, to: number): string[] {
  return annotationKinds(ctx.score).map((kind) => {
    const parts: string[] = [];
    for (let bi = from; bi < to; bi++) {
      const toks: string[] = [];
      for (const it of voice.bars[bi]?.items ?? []) {
        if (it.kind === "rest") continue;
        toks.push(it.tieFromPrev || it.n === null ? "*" : syllable(ctx.ann.get(it.n)?.[kind] ?? ""));
      }
      parts.push(toks.join(" "));
    }
    return `w:${parts.join(" | ")}`;
  });
}

/**
 * Bar-scoped accidentals per staff, in time order across its voices: an accidental holds for the rest of the
 * bar in its octave; the key signature holds in every octave. Courtesy accidentals are added for the first
 * note of a letter and octave that the previous bar altered, and for a note whose letter carries another
 * alteration in a different octave of the same bar.
 */
function accidentals(
  score: Score,
  sigOf: (bi: number, si: number) => Record<string, number>,
): Map<string, string> {
  const out = new Map<string, string>();
  score.staves.forEach((staff, si) => {
    if (staff.clef === "perc") return;
    const nBars = staff.voices[0]?.bars.length ?? 0;
    /** Letter+octave → the alteration an explicit accidental left in effect at the end of the last bar. */
    let carried = new Map<string, number>();
    for (let bi = 0; bi < nBars; bi++) {
      const entries: { onset: Rat; vi: number; ii: number; it: NoteItem; first: boolean }[] = [];
      staff.voices.forEach((v, vi) => {
        v.bars[bi]?.items.forEach((it, ii) => {
          if (it.kind !== "rest") entries.push({ onset: it.onset, vi, ii, it, first: ii === 0 });
        });
      });
      entries.sort((a, b) => R.cmp(a.onset, b.onset) || a.vi - b.vi);
      const sig = sigOf(bi, si);
      const state = new Map<string, number>();
      for (const e of entries) {
        e.it.pitches.forEach((p, pi) => {
          const k = `${p.letter}${p.oct}`;
          const id = `${si}|${bi}|${e.vi}|${e.ii}|${pi}`;
          if (e.it.tieFromPrev && e.first) {
            // Tied in over the bar line: not restated; the courtesy for a later note still applies.
            out.set(id, "");
            return;
          }
          const sigAlt = sig[p.letter] ?? 0;
          const current = state.get(k) ?? sigAlt;
          const prevBar = state.has(k) ? undefined : carried.get(k);
          let otherOctave = false;
          if (!state.has(k))
            for (const [kk, alt] of state)
              if (kk !== k && kk[0] === p.letter && alt !== p.alt) otherOctave = true;
          const courtesy = (prevBar !== undefined && prevBar !== p.alt) || otherOctave;
          if (p.alt === current && !courtesy) {
            out.set(id, "");
            return;
          }
          state.set(k, p.alt);
          out.set(id, ACC[p.alt] ?? "");
        });
      }
      carried = new Map([...state].filter(([k, alt]) => alt !== (sig[k[0] as string] ?? 0)));
    }
  });
  return out;
}

function annotationsAt(list: Score["chords"], onset: Rat): string[] {
  return (list ?? []).filter((a) => R.eq(a.at, onset)).map((a) => a.text.replace(/"/g, "'"));
}

function emitBar(
  ctx: Ctx,
  staff: Staff,
  si: number,
  voice: Voice,
  vi: number,
  bi: number,
  flags: { chords: boolean; romans: boolean; swing: boolean; above: boolean },
): string {
  const bar = voice.bars[bi];
  if (!bar) return "";
  let out = "";
  bar.items.forEach((it, ii) => {
    if (ii > 0) out += it.breakBefore ? " " : "";
    if (it.tupletStart) out += `(${it.tupletStart.p}:${it.tupletStart.q}:${it.tupletStart.r}`;
    if (flags.swing && bi === 0 && ii === 0 && ctx.score.swingText) out += `"^${ctx.score.swingText}"`;
    if (flags.chords) for (const t of annotationsAt(ctx.score.chords, it.onset)) out += `"${t}"`;
    if (flags.romans) for (const t of annotationsAt(ctx.score.romans, it.onset)) out += `"_${t}"`;
    if (flags.above && it.n !== null && !it.tieFromPrev && it.kind !== "rest")
      for (const t of annotationTexts(ctx.ann.get(it.n), ctx.score))
        if (t) out += `"^${t.replace(/"/g, "'")}"`;
    const len = abcLength(it.written);
    if (it.kind === "rest") {
      out += `${it.hidden ? "x" : "z"}${len}`;
      return;
    }
    out += `!class=${ctx.prefix}${it.n}!`;
    const tok = (p: SpelledPitch, pi: number): string => {
      const head = staff.clef === "perc" ? ((it.drums?.[pi] ?? it.drum)?.head ?? "normal") : "normal";
      const acc = ctx.acc.get(`${si}|${bi}|${vi}|${ii}|${pi}`) ?? "";
      return `${head === "x" && it.kind === "chord" ? "!style=x!" : ""}${acc}${abcPitchLetter(p.letter, p.oct)}`;
    };
    if (it.kind === "chord") out += `[${it.pitches.map(tok).join("")}]${len}`;
    else {
      if (it.drum?.head === "x") out += "!style=x!";
      if (it.drum?.s === "oh" && !it.tieFromPrev) out += "!open!";
      out += `${tok(it.pitches[0] as SpelledPitch, 0)}${len}`;
    }
    if (it.tieToNext) out += "-";
  });
  return out;
}

function lyricLine(voice: Voice, from: number, to: number): string | null {
  const parts: string[] = [];
  let any = false;
  for (let bi = from; bi < to; bi++) {
    const toks: string[] = [];
    for (const it of voice.bars[bi]?.items ?? []) {
      if (it.kind === "rest") continue;
      if (it.lyric && !it.tieFromPrev) {
        toks.push(it.lyric.replace(/[\s-_*~|]/g, ""));
        any = true;
      } else toks.push("*");
    }
    parts.push(toks.join(" "));
  }
  return any ? `w:${parts.join(" | ")}` : null;
}

export function toAbc(score: Score, opts: AbcOptions = {}): AbcResult {
  const prefix = opts.classPrefix ?? "oak-e";
  const perLine = Math.max(1, opts.barsPerLine ?? 4);
  const ks = keySig(score.key);
  const ann = new Map<number, NoteAnnotation>();
  if (score.annotations) for (const a of noteAnnotations(score, score.annotations)) ann.set(a.n, a);
  // A key change (`score.keyChanges`) puts `[K:…]` at its bar line in every pitched voice; notes are written
  // against the signature in force in their bar.
  const barCycle = (bi: number) => score.staves[0]?.voices[0]?.bars[bi]?.index ?? score.startBar + bi;
  // A staff with its own key plan (`Staff.key`, two tracks in different keys) keeps it; the others follow the score.
  const planOf = (si: number) => {
    const st = score.staves[si];
    return st && st.key !== undefined
      ? { key: st.key, keyChanges: st.keyChanges ?? [] }
      : { key: score.key, keyChanges: score.keyChanges ?? [] };
  };
  const changeAtOf = score.staves.map(
    (_s, si) => new Map(planOf(si).keyChanges.map((c) => [c.bar, c.key] as const)),
  );
  const sigOfBar = (bi: number, si: number) => {
    const plan = planOf(si);
    let key = plan.key;
    for (const c of plan.keyChanges) if (c.bar <= barCycle(bi)) key = c.key;
    return key === score.key ? ks.sig : keySig(key).sig;
  };
  const kTextOf = (key: KeySpec | null) => {
    const k = keySig(key);
    return k.notes.length > 7 ? explicitKey(k.sig) : k.abcK;
  };
  const ctx: Ctx = { score, prefix, sig: ks.sig, acc: accidentals(score, sigOfBar), ann };
  const above = score.annotations?.position === "above";
  const pitchedStaves = score.staves.filter((s) => s.clef !== "perc");
  const voices = score.staves.flatMap((s, si) => s.voices.map((v, vi) => ({ s, si, v, vi })));
  const multi = voices.length > 1;
  const header: string[] = ["X:1"];
  if (score.title) header.push(`T:${score.title.replace(/\n/g, " ")}`);
  header.push(`M:${score.meter.num}/${score.meter.den}`, "L:1/16");
  if (score.tempoBpm) header.push(`Q:${tempoUnitAbc[score.meter.tempoUnit]}=${Math.round(score.tempoBpm)}`);
  // Annotation lines read in the sans face abcjs uses for texts over the notes (its lyric default is bold
  // Times, where ♭ and ♯ set wide: "B ♭ 2").
  if (annotationKinds(score).length && !above) header.push("%%vocalfont Helvetica 12");
  const clefOf = (s: Staff) =>
    s.clef === "perc"
      ? `clef=perc${s.lines === 1 ? " stafflines=1" : ""}`
      : s.clef === "bass"
        ? "clef=bass"
        : "clef=treble";
  const onlyPerc = pitchedStaves.length === 0;
  const kText = onlyPerc ? "C" : ks.notes.length > 7 ? explicitKey(ks.sig) : ks.abcK;
  if (multi) {
    const tok = (s: Staff) =>
      s.voices.length > 1 ? `(${s.voices.map((v) => v.id).join(" ")})` : (s.voices[0]?.id ?? s.id);
    const parts: string[] = [];
    const rh = score.staves.find((s) => s.id === "RH");
    const lh = score.staves.find((s) => s.id === "LH");
    for (const s of score.staves) {
      if (s.id === "LH" && rh) continue;
      if (s.id === "RH" && lh) parts.push(`{${tok(s)} ${tok(lh)}}`);
      else parts.push(tok(s));
    }
    header.push(`%%score ${parts.join(" ")}`);
    for (const { s, v, vi } of voices) {
      const stem = s.voices.length > 1 ? (vi === 0 ? " stem=up" : " stem=down") : "";
      header.push(`V:${v.id} ${clefOf(s)}${stem}`);
    }
    header.push(`K:${kText}`);
  } else {
    const s = score.staves[0];
    header.push(`K:${kText}${s && s.clef !== "treble" ? ` ${clefOf(s)}` : ""}`);
  }
  const nBars = score.staves[0]?.voices[0]?.bars.length ?? 0;
  const lines: string[] = [];
  const topStaff = 0;
  const romanStaff = score.staves.reduce((acc, s, i) => (s.clef !== "perc" ? i : acc), 0);
  for (let from = 0; from < nBars; from += perLine) {
    const to = Math.min(nBars, from + perLine);
    for (const { s, si, v, vi } of voices) {
      if (multi) lines.push(`V:${v.id}`);
      let body = "";
      if (multi && from === 0 && s.clef === "perc" && ks.notes.length) body += `[K:C ${clefOf(s)}] `;
      if (multi && from === 0 && s.clef !== "perc" && s.key !== undefined) body += `[K:${kTextOf(s.key)}] `;
      for (let bi = from; bi < to; bi++) {
        const flags = {
          chords: si === topStaff && vi === 0,
          romans: si === romanStaff && vi === 0,
          swing: si === 0 && vi === 0,
          above: above && vi === 0 && s.clef !== "perc",
        };
        const changeAt = changeAtOf[si] as Map<number, KeySpec | null>;
        const change = bi > 0 && s.clef !== "perc" ? changeAt.get(barCycle(bi)) : undefined;
        if (change) body += `[K:${kTextOf(change)}] `;
        body += emitBar(ctx, s, si, v, vi, bi, flags);
        // A key change is preceded by a double barline, as engravers mark it.
        const nextChanges = bi + 1 < nBars && s.clef !== "perc" && changeAt.has(barCycle(bi + 1));
        body += bi === nBars - 1 && opts.finalBar !== false ? " |]" : nextChanges ? " ||" : " |";
        if (bi < to - 1) body += " ";
      }
      lines.push(body);
      if (si === 0 && vi === 0) {
        const w = lyricLine(v, from, to);
        if (w) lines.push(w);
      }
      if (vi === 0 && s.clef !== "perc" && !above) lines.push(...annotationLines(ctx, v, from, to));
    }
  }
  const abc = `${header.join("\n")}\n${lines.join("\n")}\n`;

  // id map
  const idMap: IdMapEntry[] = [];
  const byEvent = new Map<string, number>();
  for (const s of score.staves) {
    for (const v of s.voices) {
      for (const b of v.bars) {
        for (const it of b.items) {
          if (it.n === null) continue;
          const existing = idMap[it.n];
          if (existing) {
            existing.dur = R.add(existing.dur, it.dur);
            continue;
          }
          const { bar, beat } = barBeat(score, it.onset);
          idMap[it.n] = {
            n: it.n,
            eventIds: it.eventIds,
            locs: dedupeLocs(it.locs ?? []),
            pitches: it.drums
              ? it.drums.map((d) => d.s)
              : it.drum
                ? [it.drum.s]
                : it.pitches.map((p) => p.name),
            bar,
            beat,
            onset: it.onset,
            dur: it.dur,
          };
          for (const id of it.eventIds) byEvent.set(id, it.n);
        }
      }
    }
  }
  return { abc, idMap, byEvent };
}

/** An explicit key signature (abcjs draws K:G# as four flats): `C exp ^^f ^c ^g ^d ^a ^e ^b`. */
function explicitKey(sig: Record<string, number>): string {
  const sharps = "FCGDAEB".split("").filter((l) => (sig[l] ?? 0) > 0);
  const flats = "BEADGCF".split("").filter((l) => (sig[l] ?? 0) < 0);
  const tok = (l: string) => `${ACC[sig[l] ?? 0]}${l.toLowerCase()}`;
  return `C exp ${[...sharps, ...flats].map(tok).join(" ")}`;
}

function dedupeLocs(locs: CodeRange[]): CodeRange[] {
  const byKey = new Map<string, CodeRange>();
  for (const l of locs) byKey.set(`${l.from}:${l.to}`, l);
  return [...byKey.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

// NotationModel → ABC text for abcjs 6.7.2 (promoted from spikes/s4-notation/abc.ts).
// - One `!class=oak-e{n}!` decoration per element (several classes allowed in its value), placed after
//   the tuplet marker and before the chord brackets; tied pieces repeat it; rests carry none.
// - Accidentals against the key signature and earlier accidentals in the same bar, staff and octave
//   (naturals included); a note tied in over the bar line is not restated; an accidental another voice of the
//   staff wrote earlier in the bar is restated in this voice. Courtesy accidentals: the first
//   note of a letter and octave after a bar that altered it, and a note whose letter is altered in another
//   octave of the same bar, are written out (abcjs has no parenthesised form: ABCJS_LIMITS).
// - Theoretical keys (more than seven accidentals) get an explicit signature (`K:C exp ^^f ^c …`).
// - Key changes (`score.keyChanges`): `[K:…]` after a double barline, in every pitched voice (abcjs draws the
//   cancelling naturals of the old signature before the new one, and a change that starts a system as a courtesy
//   signature at the end of the system before); a change to a key with the same signature (C major to A minor) is
//   not marked at all (Wave 6); a change inside a bar
//   (`beat` > 1) is written before the item at its beat (the build cut every voice there), and the accidentals of
//   that bar start again under the new signature (a letter altered earlier in the bar is restated).
// - Chord symbols over the top staff, Roman numerals (`"_…"`) under the bottom pitched staff; a lead sheet numbers
//   the first bar of each system (`%%barnumbers 0` with `%%setbarnb`, so a pickup bar is bar 0).
// - Annotation lines (degree, solfège, name): one `w:` line per kind under every voice of every pitched staff
//   (c5: a staff's first voice is padded with blank lines so a later voice's lines and the numerals stay clear), or
//   stacked `"^…"` texts over the notes (first voice).
// - Section marks (Wave 5, `score.sections`): an inline part label `[P:Chorus]` at the start of the section's first
//   bar on the top staff's first voice, and a double barline `||` closing the bar before it in every voice.
// - Spaces at beam-group boundaries, `(p:q:r` tuplets, `-` ties, `z` rests, `x` invisible rests.
import type { CodeRange, KeySpec, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { barBeat, changeAt } from "./build.ts";
import { type NoteAnnotation, noteAnnotations } from "./options.ts";
import { keySig } from "./theory-port.ts";
import type { AbcOptions, AbcResult, IdMapEntry, KeyChange, NoteItem, Score, Staff, Voice } from "./types.ts";

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
  midBar: (bi: number, si: number) => { at: Rat; sig: Record<string, number> }[],
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
      let sig = sigOf(bi, si);
      let state = new Map<string, number>();
      /** Letter+octave → the voice whose accidental set `state` there. */
      const owner = new Map<string, number>();
      const changes = midBar(bi, si);
      for (const e of entries) {
        // A key change inside the bar: its signature holds from here; what an accidental altered before it is
        // restated where it differs from the new signature.
        while (changes.length && R.lte((changes[0] as { at: Rat }).at, e.onset)) {
          const ch = changes.shift() as { at: Rat; sig: Record<string, number> };
          const before = state;
          sig = ch.sig;
          state = new Map();
          carried = new Map([...carried, ...before].filter(([k, alt]) => alt !== (sig[k[0] as string] ?? 0)));
        }
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
          // Two voices on one staff: an accidental another voice wrote earlier in the bar is restated (engraving
          // convention; a reader of the second part must not have to find it in the first).
          const otherVoice = state.has(k) && owner.get(k) !== e.vi && p.alt !== sigAlt;
          if (p.alt === current && !courtesy && !otherVoice) {
            out.set(id, "");
            return;
          }
          state.set(k, p.alt);
          owner.set(k, e.vi);
          out.set(id, ACC[p.alt] ?? "");
        });
      }
      carried = new Map([...state].filter(([k, alt]) => alt !== (sig[k[0] as string] ?? 0)));
    }
  });
  return out;
}

/** Whether a voice has a note (not only rests) in bars `from` … `to`. */
function sounds(voice: Voice, from: number, to: number): boolean {
  for (let bi = from; bi < to; bi++) if (voice.bars[bi]?.items.some((it) => it.kind !== "rest")) return true;
  return false;
}
/**
 * A blank lyric line for a voice's bars (`~`, a space abcjs still gives a line's height), used to reserve the room
 * a later voice's lines need under the staff (c5). The workbench's own lens lines pad the same way.
 */
export function padLine(voice: Voice, from: number, to: number): string {
  const parts: string[] = [];
  for (let bi = from; bi < to; bi++)
    parts.push(
      (voice.bars[bi]?.items ?? [])
        .filter((it) => it.kind !== "rest")
        .map(() => "~")
        .join(" "),
    );
  return `w:${parts.join(" | ")}`;
}

function annotationsAt(list: Score["chords"], onset: Rat): string[] {
  return (list ?? []).filter((a) => R.eq(a.drawnAt ?? a.at, onset)).map((a) => a.text.replace(/"/g, "'"));
}

/**
 * A chord symbol as written into the ABC. abcjs reads a "/" in a chord symbol as the start of a bass note and drops
 * what follows when it is not one (`translateChord`): "C6/9" was drawn "C6". A slash that does not start a bass note
 * is written as the division slash "∕", which looks the same and which abcjs leaves alone.
 */
export function abcChordText(text: string): string {
  return text.replace(/\/(?![A-G](?:[#b♯♭])?(?:$|\n))/g, "∕");
}

function emitBar(
  ctx: Ctx,
  staff: Staff,
  si: number,
  voice: Voice,
  vi: number,
  bi: number,
  flags: { chords: boolean; romans: boolean; above: boolean },
  keysAt: { at: Rat; text: string }[] = [],
): string {
  const bar = voice.bars[bi];
  if (!bar) return "";
  let out = "";
  bar.items.forEach((it, ii) => {
    const change = ii > 0 ? keysAt.find((k) => R.eq(k.at, it.onset)) : undefined;
    if (change) out += ` [K:${change.text}] `;
    else if (ii > 0) out += it.breakBefore ? " " : "";
    if (it.tupletStart) out += `(${it.tupletStart.p}:${it.tupletStart.q}:${it.tupletStart.r}`;
    if (flags.chords)
      for (const t of annotationsAt(ctx.score.chords, it.onset)) out += `"${abcChordText(t)}"`;
    // Wave 7: a bracket's text over the note or rest that starts its span (`ABCJS_LIMITS` "rhythm-bracket").
    if (flags.chords)
      for (const b of ctx.score.brackets ?? [])
        if (R.eq(b.drawnAt ?? b.at, it.onset)) out += `"^${b.text.replace(/"/g, "'")}"`;
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
    // Wave 7: slash noteheads on the rhythm staff (every tied piece), the accent of a polymeter's cycle start.
    if (ctx.score.slashes && staff.lines === 1) out += "!style=rhythm!";
    if (it.accent && !it.tieFromPrev) out += "!>!";
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
  // Wave 6: a change to a key with the signature already in force (C major to A minor, G major to G Mixolydian's
  // parent, a mode to its relative) is not marked: engravers write no double bar and no signature where nothing on
  // the staff changes. The notes are still spelled, and their labels read, in the new key (`Score.keyChanges`).
  const sameSig = (a: KeySpec | null, b: KeySpec | null) => {
    const x = keySig(a).sig;
    const y = keySig(b).sig;
    return "CDEFGAB".split("").every((l) => (x[l] ?? 0) === (y[l] ?? 0));
  };
  const shownChangesOf = score.staves.map((_s, si) => {
    const plan = planOf(si);
    const sorted = [...plan.keyChanges].sort((a, b) => a.bar - b.bar || (a.beat ?? 1) - (b.beat ?? 1));
    const out: KeyChange[] = [];
    let current = plan.key;
    for (const c of sorted) {
      if (!sameSig(current, c.key)) out.push(c);
      current = c.key;
    }
    return out;
  });
  const changeAtOf = score.staves.map(
    (_s, si) =>
      new Map(
        (shownChangesOf[si] ?? []).filter((c) => (c.beat ?? 1) <= 1).map((c) => [c.bar, c.key] as const),
      ),
  );
  const sigOfBar = (bi: number, si: number) => {
    const plan = planOf(si);
    let key = plan.key;
    for (const c of plan.keyChanges)
      if (c.bar < barCycle(bi) || (c.bar === barCycle(bi) && (c.beat ?? 1) <= 1)) key = c.key;
    return key === score.key ? ks.sig : keySig(key).sig;
  };
  const kTextOf = (key: KeySpec | null) => {
    const k = keySig(key);
    return k.notes.length > 7 ? explicitKey(k.sig) : k.abcK;
  };
  // Changes inside a bar (`beat` > 1), per staff and bar index.
  const midBarOf = (si: number, bi: number): { at: Rat; key: KeySpec | null }[] =>
    (shownChangesOf[si] ?? [])
      .filter((c: KeyChange) => (c.beat ?? 1) > 1 && c.bar === barCycle(bi))
      .map((c) => ({ at: changeAt(c, score.meter.unitsPerBar), key: c.key }));
  const midBarSigs = (bi: number, si: number) =>
    score.staves[si]?.clef === "perc"
      ? []
      : midBarOf(si, bi).map((c) => ({ at: c.at, sig: keySig(c.key).sig }));
  const ctx: Ctx = { score, prefix, sig: ks.sig, acc: accidentals(score, sigOfBar, midBarSigs), ann };
  const above = score.annotations?.position === "above";
  const pitchedStaves = score.staves.filter((s) => s.clef !== "perc");
  const voices = score.staves.flatMap((s, si) => s.voices.map((v, vi) => ({ s, si, v, vi })));
  const multi = voices.length > 1;
  const header: string[] = ["X:1"];
  if (score.title) header.push(`T:${score.title.replace(/\n/g, " ")}`);
  // Wave 7: an additive time signature (`M:2+2+3/8`, drawn as 2+2+3 over 8) prints the grouping where engravers do.
  header.push(`M:${score.groupingText ?? score.meter.num}/${score.meter.den}`, "L:1/16");
  // The tempo line: "Swing 8ths" (contracts §6.10 item 3) as its text, where engravers write the feel, so it never
  // stacks with the first bar's chord symbol; then the tempo.
  const tempo: string[] = [];
  if (score.swingText) tempo.push(`"${score.swingText}"`);
  if (score.tempoBpm) tempo.push(`${tempoUnitAbc[score.meter.tempoUnit]}=${Math.round(score.tempoBpm)}`);
  if (tempo.length) header.push(`Q:${tempo.join(" ")}`);
  // Section labels in the sans face the chord symbols use (abcjs's default is a large serif).
  if (score.sections?.length) header.push("%%partsfont Helvetica 13 bold");
  // Annotation lines read in the sans face abcjs uses for texts over the notes (its lyric default is bold
  // Times, where ♭ and ♯ set wide: "B ♭ 2").
  if (annotationKinds(score).length && !above) header.push("%%vocalfont Helvetica 12");
  // A lead-sheet page that is not the song's end fills its last system to the width (the next page goes on).
  if (score.lead && opts.finalBar === false) header.push("%%stretchlast 1");
  // Bar numbers at the start of each system (not on the first): cycle 0 is bar 0 with a pickup.
  if (opts.barNumbers ?? !!score.lead) {
    const first = score.startBar + (score.pickup || score.pickupNumbering ? 0 : 1);
    header.push("%%barnumbers 0");
    if (first !== 1) header.push(`%%setbarnb ${first}`);
  }
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
    // A single staff with its own key plan (`Staff.key`) shows that signature.
    const own = s && s.clef !== "perc" && s.key !== undefined ? kTextOf(s.key) : kText;
    header.push(`K:${own}${s && s.clef !== "treble" ? ` ${clefOf(s)}` : ""}`);
  }
  const nBars = score.staves[0]?.voices[0]?.bars.length ?? 0;
  const sectionAt = new Map((score.sections ?? []).map((m) => [m.bar, m] as const));
  const lines: string[] = [];
  const topStaff = 0;
  const romanStaff = score.staves.reduce((acc, s, i) => (s.clef !== "perc" ? i : acc), 0);
  // The pickup bar does not count towards the first system's bars.
  const lineStarts: number[] = [];
  for (let from = 0; from < nBars; ) {
    lineStarts.push(from);
    from += from === 0 && score.pickup ? perLine + 1 : perLine;
  }
  for (const [li, from] of lineStarts.entries()) {
    const to = Math.min(nBars, lineStarts[li + 1] ?? nBars);
    for (const { s, si, v, vi } of voices) {
      if (multi) lines.push(`V:${v.id}`);
      let body = "";
      if (multi && from === 0 && s.clef === "perc" && ks.notes.length) body += `[K:C ${clefOf(s)}] `;
      if (multi && from === 0 && s.clef !== "perc" && s.key !== undefined) body += `[K:${kTextOf(s.key)}] `;
      for (let bi = from; bi < to; bi++) {
        const flags = {
          chords: si === topStaff && vi === 0,
          romans: si === romanStaff && vi === 0,
          above: above && vi === 0 && s.clef !== "perc",
        };
        const changeAt = changeAtOf[si] as Map<number, KeySpec | null>;
        const change = bi > 0 && s.clef !== "perc" ? changeAt.get(barCycle(bi)) : undefined;
        if (change) body += `[K:${kTextOf(change)}] `;
        const keysAt =
          s.clef === "perc" ? [] : midBarOf(si, bi).map((c) => ({ at: c.at, text: kTextOf(c.key) }));
        // A section's label stands over its first bar, on the top staff's first voice (an ABC part label).
        const part = si === 0 && vi === 0 ? sectionAt.get(barCycle(bi)) : undefined;
        if (part) body += `[P:${partText(part.text)}]`;
        body += emitBar(ctx, s, si, v, vi, bi, flags, keysAt);
        // A key change is preceded by a double barline, as engravers mark it; so is a new section.
        const nextChanges = bi + 1 < nBars && s.clef !== "perc" && changeAt.has(barCycle(bi + 1));
        const nextSection = bi + 1 < nBars && !!sectionAt.get(barCycle(bi + 1))?.doubleBar;
        body +=
          bi === nBars - 1 && opts.finalBar !== false ? " |]" : nextChanges || nextSection ? " ||" : " |";
        if (bi < to - 1) body += " ";
      }
      lines.push(body);
      let own = 0;
      if (si === 0 && vi === 0) {
        const w = lyricLine(v, from, to);
        if (w) {
          lines.push(w);
          own++;
        }
      }
      if (s.clef !== "perc" && !above) {
        const ann = annotationLines(ctx, v, from, to);
        lines.push(...ann);
        own += ann.length;
        // c5: abcjs keeps room under a staff for one voice's lyric lines and draws a later voice's lines below
        // them, so the numerals and the next staff would cover them. The first voice is padded with blank lines,
        // one per line the later voices of the staff carry in this system.
        if (vi === 0 && own > 0) {
          const later = s.voices.slice(1).filter((w) => sounds(w, from, to)).length;
          for (let k = 0; k < later * annotationKinds(score).length; k++) lines.push(padLine(v, from, to));
        }
      }
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

/** A part label's text: one line, no brackets (they would close the inline field). */
function partText(text: string): string {
  return text
    .replace(/[[\]\n%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// The form map (contracts §2.9 L8, §6.6 CF-T; content/specs/CF.md "The form map"): the learner hears a whole tune,
// cuts its bars into sections on the bar timeline and names each one (A A B A, or verse / chorus / bridge). The
// same strip maps the sections of the learner's own recording (L7, full arrangement), where nothing is graded.
// A map is the first bar of each section and a label per section; the answer sent to the server is exactly that
// (`LadderSubmit.formMap`), graded there by shape with `gradeFormMap`. Pure, so every rule is unit-tested; the
// capstone's CF-T workspace uses the same pieces.
import type { GradeResult } from "@oak/content-kit";
import { formLetters } from "@oak/content-kit";

export interface FormMap {
  /** Full bars of the tune (the pickup bar is not one of them). */
  bars: number;
  /** 1-based first bar of each section, ascending; the first is always 1. */
  cuts: number[];
  /** One label per section; `""` while the learner has not named it. */
  labels: string[];
}

export interface FormSection {
  /** 0-based. */
  index: number;
  label: string;
  /** 1-based inclusive bars. */
  from: number;
  to: number;
  bars: number;
}

/** The letters a key names a section with (the strip's A–H; CF-T's tunes need at most four). */
export const FORM_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
/** The server takes at most 16 sections of at most 24 characters (`LadderSubmit.formMap`). */
export const FORM_MAX_SECTIONS = 16;
export const FORM_LABEL_MAX = 24;

export const emptyFormMap = (bars: number): FormMap => ({
  bars: Math.max(1, Math.round(bars)),
  cuts: [1],
  labels: [""],
});

/**
 * A map that holds what it should: sorted cuts inside the tune starting at bar 1, one label per section. Labels
 * are kept as written (a section the learner named "Verse 2" on their recording stays that).
 */
export function normalizeFormMap(m: FormMap): FormMap {
  const bars = Math.max(1, Math.round(m.bars));
  const pairs = m.cuts
    .map((c, i) => ({ bar: Math.round(c), label: (m.labels[i] ?? "").trim().slice(0, FORM_LABEL_MAX) }))
    .filter((p) => p.bar >= 1 && p.bar <= bars)
    .sort((a, b) => a.bar - b.bar);
  const kept = pairs.filter((p, i) => pairs.findIndex((q) => q.bar === p.bar) === i);
  if (kept[0]?.bar !== 1) kept.unshift({ bar: 1, label: "" });
  const cut = kept.slice(0, FORM_MAX_SECTIONS);
  return { bars, cuts: cut.map((p) => p.bar), labels: cut.map((p) => p.label) };
}

/**
 * A label as it is kept: trimmed, at most 24 characters, a single letter (with its variant digit) as a capital
 * (`a2` → `A2`); a word stays as the learner typed it (the grader compares section names without case).
 */
export function cleanLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ").slice(0, FORM_LABEL_MAX);
  return /^[a-z]\d?$/i.test(t) ? t.toUpperCase() : t;
}

export const hasCut = (m: FormMap, bar: number): boolean => m.cuts.includes(bar);

/**
 * Cuts the strip before `bar`, or joins the two sections that meet there. A new section starts unnamed; joining
 * keeps the left section's name. Bar 1 always starts a section.
 */
export function toggleCut(m: FormMap, bar: number): FormMap {
  if (bar <= 1 || bar > m.bars) return m;
  const at = m.cuts.indexOf(bar);
  if (at > 0)
    return { ...m, cuts: m.cuts.filter((_, i) => i !== at), labels: m.labels.filter((_, i) => i !== at) };
  if (m.cuts.length >= FORM_MAX_SECTIONS) return m;
  const after = m.cuts.findIndex((c) => c > bar);
  const i = after < 0 ? m.cuts.length : after;
  return {
    ...m,
    cuts: [...m.cuts.slice(0, i), bar, ...m.cuts.slice(i)],
    labels: [...m.labels.slice(0, i), "", ...m.labels.slice(i)],
  };
}

export function setLabel(m: FormMap, index: number, label: string): FormMap {
  if (index < 0 || index >= m.cuts.length) return m;
  return { ...m, labels: m.labels.map((l, i) => (i === index ? cleanLabel(label) : l)) };
}

export function sectionsOf(m: FormMap): FormSection[] {
  return m.cuts.map((from, index) => {
    const to = (m.cuts[index + 1] ?? m.bars + 1) - 1;
    return { index, label: m.labels[index] ?? "", from, to, bars: to - from + 1 };
  });
}

/** The section that holds 1-based `bar` (the first for a bar before 1, the last past the end). */
export function sectionIndexAt(m: FormMap, bar: number): number {
  let at = 0;
  for (let i = 0; i < m.cuts.length; i++) if ((m.cuts[i] as number) <= bar) at = i;
  return at;
}

/** The next bar line (a section start) after or before `bar`, or `null` at the end. */
export function stepCut(m: FormMap, bar: number, dir: 1 | -1): number | null {
  if (dir > 0) return m.cuts.find((c) => c > bar) ?? null;
  return [...m.cuts].reverse().find((c) => c < bar) ?? null;
}

export const allNamed = (m: FormMap): boolean => m.labels.every((l) => l.length > 0);

/**
 * The form as the learner would say it: letters by first appearance once every section is named ("AABA"); a
 * section without a name shows as "·". Section words read as letters too (verse chorus verse → "ABA").
 */
export function formLettersOf(m: FormMap): string {
  if (allNamed(m)) return formLetters(m.labels);
  const named = m.labels.filter(Boolean);
  const letters = formLetters(named);
  let k = 0;
  return m.labels.map((l) => (l ? letters[k++] : "·")).join("");
}

/** "A A B A · 8 + 8 + 8 + 8 bars": the labels as written and each section's length. */
export function formSummary(m: FormMap): string {
  const s = sectionsOf(m);
  const lengths = s.map((x) => x.bars);
  const same = lengths.every((b) => b === lengths[0]);
  const names = s.map((x) => x.label || "·").join(" ");
  const len = same
    ? `${s.length} ${s.length === 1 ? "section" : "sections"} of ${lengths[0]} ${lengths[0] === 1 ? "bar" : "bars"}`
    : `${lengths.join(" + ")} bars`;
  return `${names} · ${len}`;
}

/** Why the map cannot be checked yet, in the learner's words; `null` when it can. */
export function formMapProblem(m: FormMap): string | null {
  if (m.cuts.length < 2) return "Cut the tune into sections first: one cut where each new section starts.";
  const unnamed = sectionsOf(m).find((s) => !s.label);
  if (unnamed)
    return `Name section ${unnamed.index + 1} (bars ${unnamed.from}–${unnamed.to}): a letter, or a word like chorus.`;
  return null;
}

/** The answer as the server takes it (`LadderSubmit.formMap`; the `form` answer in `input: "map"`). */
export function formMapAnswer(m: FormMap): { sections: string[]; bars: number[] } {
  return { sections: [...m.labels], bars: [...m.cuts] };
}

export const sameFormMap = (a: FormMap, b: FormMap): boolean =>
  a.bars === b.bars &&
  a.cuts.join(",") === b.cuts.join(",") &&
  a.labels.join("\u0001") === b.labels.join("\u0001");

// --- a check's result on the strip ---------------------------------------------------------------------

export type SectionMark = "ok" | "issue";

/**
 * A form check per section: the sections the grader named (a message's bar falls inside it) are "issue", the rest
 * "ok". A message without a bar (a missing section the learner has not cut) marks nothing; the verdict says it.
 */
export function formMarks(result: GradeResult, m: FormMap): Map<number, SectionMark> {
  const out = new Map<number, SectionMark>();
  if (result.status === "error") return out;
  const bad = new Set<number>();
  for (const msg of result.messages) {
    const bar = msg.where?.bar;
    if (typeof bar === "number" && bar >= 1) bad.add(sectionIndexAt(m, bar));
  }
  for (const s of sectionsOf(m)) out.set(s.index, bad.has(s.index) ? "issue" : "ok");
  return out;
}

/** One calm sentence for a form check (ux §7.11): how many sections are right, never the answer. */
export function formVerdict(r: { passed: boolean; result: GradeResult }, m: FormMap): string {
  if (r.passed) return `The form: that's it, ${formLettersOf(m).split("").join(" ")}.`;
  if (r.result.assist.revealed) return "The form is shown below. This standard won't count as a graded pass.";
  const n = m.cuts.length;
  const right = Math.round(r.result.score * n);
  const share =
    r.result.score > 0 && right > 0
      ? `About ${right} of your ${n} sections ${right === 1 ? "is" : "are"} right.`
      : "No section is right yet.";
  return `The form: not yet. ${share} Listen for where the opening tune comes back, and where something new starts.`;
}

// --- kept between visits --------------------------------------------------------------------------------

const DRAFT_KEY = (id: string) => `oak.transcribe.form.${id}`;

/** The learner's map of a project as this browser last saw it (their cuts and names survive a reload). */
export function readFormDraft(id: string, bars: number): FormMap | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<FormMap>;
    if (!Array.isArray(m.cuts) || !Array.isArray(m.labels)) return null;
    return normalizeFormMap({ bars, cuts: m.cuts as number[], labels: m.labels as string[] });
  } catch {
    return null;
  }
}
export function writeFormDraft(id: string, m: FormMap): void {
  try {
    localStorage.setItem(DRAFT_KEY(id), JSON.stringify({ cuts: m.cuts, labels: m.labels }));
  } catch {
    // a convenience: the project's regions keep the map on the server
  }
}

// --- the map as the project's regions (kept on the server, exported with the project) -------------------

export interface SectionRegion {
  id: string;
  label: string;
  startS: number;
  endS: number;
  kind: "loop" | "section";
}

/** Where the bars sit in source seconds: bar 1 starts at `firstBarS`, each bar lasts `barSec`. */
export interface BarClock {
  firstBarS: number;
  barSec: number;
}

/**
 * The map as `section` regions of the project (what a backup exports and another device reads): one region per
 * section, from its first bar line to the next section's. IDs are stable per first bar (`form-9`).
 */
export function regionsOfFormMap(m: FormMap, clock: BarClock): SectionRegion[] {
  return sectionsOf(m).map((s) => ({
    id: `form-${s.from}`,
    label: s.label,
    startS: round(clock.firstBarS + (s.from - 1) * clock.barSec),
    endS: round(clock.firstBarS + s.to * clock.barSec),
    kind: "section" as const,
  }));
}

/**
 * A map from a project's `section` regions: each region starts a section at the bar line nearest its start (the
 * learner's own recording: sections named from loops need not sit on the lines). Bars before the first region
 * belong to an unnamed first section. `null` when there is no section or no bar grid.
 */
export function formMapOfRegions(
  regions: readonly SectionRegion[],
  clock: BarClock | null,
  bars: number,
): FormMap | null {
  if (!clock || !(clock.barSec > 0) || bars < 1) return null;
  const sections = regions.filter((r) => r.kind === "section");
  if (sections.length === 0) return null;
  const starts = sections
    .map((r) => ({
      bar: Math.round((r.startS - clock.firstBarS) / clock.barSec) + 1,
      label: r.label,
    }))
    .filter((s) => s.bar >= 1 && s.bar <= bars);
  if (starts.length === 0) return null;
  return normalizeFormMap({ bars, cuts: starts.map((s) => s.bar), labels: starts.map((s) => s.label) });
}

/** Whole bars of a recording from bar 1's line to its end (at least one). */
export const barsInRecording = (durationS: number, clock: BarClock): number =>
  Math.max(1, Math.floor((durationS - clock.firstBarS) / clock.barSec + 1e-6));

/**
 * The project's regions with the map written in: the map IS the project's sections (the ones named from loops on
 * the waveform are in it, each starting at its nearest bar line), so every `section` region is replaced by the
 * map's; the learner's loops stay. A map of one unnamed section is no map: the sections are simply removed.
 */
export function withFormRegions<R extends SectionRegion>(
  regions: readonly R[],
  m: FormMap,
  clock: BarClock,
): (R | SectionRegion)[] {
  const others = regions.filter((r) => r.kind !== "section");
  if (m.cuts.length === 1 && !m.labels[0]) return others;
  return [...others, ...regionsOfFormMap(m, clock)];
}

const round = (x: number) => Math.round(x * 1000) / 1000;

// --- the map as text (a comment for the code, the export) -------------------------------------------------

/** "// Form: A (bars 1–8) · A (9–16) · B (17–24) · A (25–32)": a line for the top of the learner's code. */
export function formComment(m: FormMap): string {
  const parts = sectionsOf(m).map(
    (s, i) => `${s.label || "?"} (${i === 0 ? "bars " : ""}${s.from}${s.to > s.from ? `–${s.to}` : ""})`,
  );
  return `// Form: ${parts.join(" · ")}`;
}

/** The code with its `// Form: …` line set: after the tempo line and header comments, replacing an earlier one. */
export function withFormComment(code: string, comment: string): string {
  if (/^\/\/ Form: .*$/m.test(code)) return code.replace(/^\/\/ Form: .*$/m, comment);
  const lines = code.split("\n");
  let at = 0;
  while (at < lines.length && (/^setcp[ms]\(/.test(lines[at] as string) || /^\/\//.test(lines[at] as string)))
    at++;
  return [...lines.slice(0, at), comment, ...lines.slice(at)].join("\n");
}

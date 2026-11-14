// Wave 5 capstone reading (C3–C5, X2; contracts §6.3, §6.6): what the checklist says beyond met / not yet. The
// sections of the piece as the form view reads them (one `arrange()` per labelled track), which contrast axes the
// chorus already differs on, the length read from the code against the brief's seconds, where a section-anchored
// rule points ("in the chorus", "bar 12"), and whether the release would be of the checked version (c1). Pure:
// everything is a function of the rubric, the grader's result and its views.
import type { AnalysisSummary, GradeResult, MeterId, RubricRule, SectionRef } from "@oak/content-kit";
import { contrastAxes, type FormSectionView, type FormView } from "@oak/grader";
import { METERS } from "@oak/theory";
import { type FormViewSection, formProblemOf, formSectionsOf } from "../lib/form-view.ts";
import { sectionRefAnchor } from "./anchors.ts";
import type { DeviceRow } from "./devices.ts";
import { type ArrangeLine, arrangeLines, clock } from "./piece.ts";
import type { FoundItem } from "./wave6.ts";

export { type ArrangeLine, arrangeLines };

// --- sections ------------------------------------------------------------------------------------

/** The piece's sections for the strip above the Workbench, or why there are none. */
export interface PieceForm {
  sections: FormViewSection[];
  totalBars: number;
  /** The arranged tracks disagree: the grader's sentence. */
  problem: string | null;
  /** "A B A B" by first appearance; `null` without sections. */
  letters: string | null;
  /**
   * How the learner's section names read, when they read as something else than they meant (`verseChords`,
   * `chordsV`, a verse const reused in the chorus): one sentence saying what to write. `null` when the names read.
   */
  hint: string | null;
}

export function pieceForm(
  view: FormView | null,
  code: string | null = null,
  rules: readonly RubricRule[] = [],
): PieceForm {
  const sections = formSectionsOf(view);
  const problem = formProblemOf(view);
  return {
    sections,
    totalBars: view?.totalBars ?? 0,
    problem,
    letters: sections.length > 0 ? sections.map((s) => s.letter).join(" ") : null,
    // Only where names matter: a rubric that reads sections, or parts that disagree about them.
    hint:
      code && (problem || rubricUsesSections(rules))
        ? sectionNamingHint(code, { problem, labels: sections.map((s) => s.label), rules })
        : null,
  };
}

// --- section names (contracts §6.3 item 2) -----------------------------------------------------------

/** The grader's reading of a section const's name: `melChorus2` → chorus (§6.3 item 2). */
export function sectionLabelOf(identifier: string): string | null {
  if (identifier === "silence") return null;
  const m = /^[a-z][a-z0-9]*?([A-Z][A-Za-z0-9]*)$/.exec(identifier);
  const tag = (m ? (m[1] as string) : identifier).toLowerCase();
  return tag.replace(/\d+$/, "") || tag;
}

/** The section words a rubric asks for: the `form` pattern's words, the sections `contrast` and `section` name. */
function wantedSections(rules: readonly RubricRule[]): string[] {
  const out = new Set<string>();
  const ref = (r: unknown) => {
    if (r && typeof r === "object" && "section" in r && typeof r.section === "string")
      out.add(r.section.toLowerCase());
  };
  for (const r of rules) {
    if (r.rule === "form" && typeof r.pattern === "string")
      for (const w of r.pattern.toLowerCase().split(/\s+/))
        if (/^[a-z]{2,}$/.test(w)) out.add(w.replace(/\d+$/, ""));
    if (r.rule === "contrast") {
      ref(r.a);
      ref(r.b);
    }
    if ("section" in r) ref(r.section);
  }
  for (const w of ["verse", "chorus"]) if (out.size === 0) out.add(w);
  return [...out];
}

const SECTION_WORDS = [
  "verse",
  "chorus",
  "bridge",
  "intro",
  "outro",
  "prechorus",
  "pre",
  "hook",
  "break",
  "solo",
];

/**
 * What to write when the section names read as something the learner did not mean (contracts §6.3 item 2: a
 * section is named `<role><Section>`, the role first). Checked in order: a const of one section reused in another
 * (the parts then disagree), the section written first (`verseChords` reads as a section called "chords"), a name
 * with no section in it (`tune`), and a shortened section (`chordsV` reads as "v" where the brief asks for a verse).
 */
export function sectionNamingHint(
  code: string,
  o: { problem: string | null; labels: readonly string[]; rules: readonly RubricRule[] },
): string | null {
  const lines = arrangeLines(code);
  if (lines.length === 0) return null;
  const want = wantedSections(o.rules);
  // A const reused in another section: "section 2 is a verse in mel and a chorus elsewhere".
  const odd = o.problem
    ? /section (\d+) is an? (\S+) in (\S+) and an? (\S+) elsewhere/.exec(o.problem)
    : null;
  if (odd) {
    const [, at, , track, other] = odd as unknown as [string, string, string, string, string];
    const name = lines.find((l) => l.track === track)?.sections[Number(at) - 1]?.name ?? null;
    const label = name ? sectionLabelOf(name) : null;
    const startsWithSection = name
      ? SECTION_WORDS.some((w) => name.startsWith(w) && /[A-Z]/.test(name.charAt(w.length)))
      : false;
    if (
      name &&
      label &&
      !startsWithSection &&
      SECTION_WORDS.includes(label) &&
      SECTION_WORDS.includes(other)
    ) {
      const role = name.slice(0, name.length - label.length);
      const reuse = `${role}${other.charAt(0).toUpperCase()}${other.slice(1)}`;
      return `\`${track}\` plays \`${name}\` in section ${at}, where the other parts play their ${other}. To play the same notes there, name them for the ${other} too: \`const ${reuse} = ${name}\`.`;
    }
  }
  const names = [
    ...new Set(
      lines.flatMap((l) => l.sections.map((s) => s.name)).filter((n): n is string => !!n && n !== "silence"),
    ),
  ];
  const sectionFirst = names.find((n) =>
    SECTION_WORDS.some((w) => n.startsWith(w) && /[A-Z]/.test(n.charAt(w.length))),
  );
  if (sectionFirst) {
    const w = SECTION_WORDS.find(
      (x) => sectionFirst.startsWith(x) && /[A-Z]/.test(sectionFirst.charAt(x.length)),
    ) as string;
    const role = sectionFirst.slice(w.length);
    const fixed = `${role.charAt(0).toLowerCase()}${role.slice(1)}${w.charAt(0).toUpperCase()}${w.slice(1)}`;
    return `Oak reads a section's name from the end of its const, after the part: \`${sectionFirst}\` reads as a section called “${sectionLabelOf(sectionFirst)}”. Put the part first: \`${fixed}\`.`;
  }
  const bare = names.find((n) => !/^[a-z][a-z0-9]*?[A-Z]/.test(n));
  if (bare) {
    const track = lines.find((l) => l.sections.some((s) => s.name === bare))?.track ?? "mel";
    const [w1 = "verse", w2 = "chorus"] = want;
    const cap = (w: string) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`;
    return `Oak reads a section's name from the end of its const: \`${bare}\` names no section. Name each one for its part, then its section: \`${track}${cap(w1)}\`, \`${track}${cap(w2)}\`.`;
  }
  const short = names.find((n) => {
    const label = sectionLabelOf(n);
    return !!label && !want.includes(label) && want.some((w) => w.startsWith(label) && w !== label);
  });
  if (short) {
    const label = sectionLabelOf(short) as string;
    const full = want.find((w) => w.startsWith(label)) as string;
    const fixed = `${short.slice(0, short.length - label.length)}${full.charAt(0).toUpperCase()}${full.slice(1)}`;
    return `Oak reads \`${short}\` as a section called “${label}”, and the brief asks for a ${full}. Spell it out: \`${fixed}\`.`;
  }
  return null;
}

/**
 * A rubric reads sections (form, contrast, a rule scoped to a named section): the workspace shows the form strip.
 * A rule scoped to a bar window (C5's "bar 12", `section: { bars }`) reads bars, not sections: a 12-bar blues
 * written as one line is never asked for a verse and a chorus.
 */
export function rubricUsesSections(rules: readonly RubricRule[]): boolean {
  return rules.some(
    (r) =>
      r.rule === "form" ||
      r.rule === "contrast" ||
      r.rule === "key-change" ||
      ("section" in r &&
        r.section !== undefined &&
        r.section !== null &&
        !(typeof r.section === "object" && "bars" in r.section)),
  );
}

const SECTION_ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth"];

/** "the chorus", "the second verse", "bars 12–12": a section reference in words. */
export function sectionRefText(ref: SectionRef): string {
  if (ref === "last") return "the last section";
  if ("bars" in ref)
    return ref.bars[0] === ref.bars[1] ? `bar ${ref.bars[0]}` : `bars ${ref.bars[0]}–${ref.bars[1]}`;
  const name = ref.section.toLowerCase();
  if (ref.nth === undefined) return `the ${name}`;
  if (ref.nth === -1) return `the last ${name}`;
  return `the ${SECTION_ORDINAL[ref.nth] ?? `${ref.nth}th`} ${name}`;
}

// --- contrast ------------------------------------------------------------------------------------

/** The words the checklist uses for a contrast axis (the rubric's and the form view's). */
export const AXIS_LABEL: Record<string, string> = {
  pitch: "melody height",
  density: "density",
  harmony: "chords",
  register: "register",
  energy: "energy",
  instrumentation: "instruments",
  loudness: "loudness",
  "harmonic-rhythm": "chord rhythm",
};
export const axisLabel = (axis: string): string => AXIS_LABEL[axis] ?? axis.replace(/-/g, " ");

export interface ContrastFinding {
  /** Every axis the rule counts, in the rule's order, with whether the chorus already differs on it. */
  axes: { axis: string; label: string; found: boolean }[];
  found: number;
  need: number;
  /** "the chorus", "the verse". */
  a: string;
  b: string;
}

/** The form-view section a section reference names (the first verse, the last chorus…). */
function viewSection(view: FormView | null, ref: SectionRef): FormSectionView | null {
  if (view?.kind !== "sections") return null;
  if (ref === "last") return view.sections.at(-1) ?? null;
  if ("bars" in ref) return null;
  const want = ref.section.toLowerCase();
  const matches = view.sections.filter((s) => s.tag === want || s.label === want);
  return (
    (ref.nth === undefined
      ? matches[0]
      : ref.nth < 0
        ? matches[matches.length + ref.nth]
        : matches[ref.nth - 1]) ?? null
  );
}

/** The numerals of each bar of a section (1-based bars of the analysis), for "the chords differ". */
function numeralsOf(slots: AnalysisSummary["slots"], s: FormSectionView): string {
  const out: string[] = [];
  for (let b = s.startBar + 1; b <= s.startBar + s.bars; b++)
    out.push(slots.find((x) => x.bar === b)?.rn ?? "-");
  return out.join(" ");
}

/**
 * Which axes the two sections differ on. A rule not met names them in its detail line ("… (it differs only in
 * density): …"), and those are the grader's own; a met rule says only how many, so the axes are read from the form
 * view's section features (the same thresholds) and the analysis' numerals.
 */
export function contrastFinding(
  rule: RubricRule,
  result: GradeResult | null,
  view: FormView | null = null,
  analysis: Pick<AnalysisSummary, "slots"> | null = null,
): ContrastFinding | null {
  if (rule.rule !== "contrast") return null;
  const r = result?.status === "error" ? undefined : result?.rubric?.find((x) => x.ruleId === rule.id);
  const detail = typeof r?.diag?.params.detail === "string" ? r.diag.params.detail : "";
  let named: Set<string>;
  if (r && !r.ok) {
    const m = /differs? only in ([a-z ,-]+?)\)/.exec(detail);
    named = new Set((m?.[1] ?? "").split(/,\s*/).map((x) => x.trim()));
  } else {
    const a = viewSection(view, rule.a);
    const b = viewSection(view, rule.b);
    named = new Set<string>(a && b ? contrastAxes(a.features, b.features) : []);
    if (a && b && analysis && numeralsOf(analysis.slots, a) !== numeralsOf(analysis.slots, b))
      named.add("harmony");
  }
  const axes = rule.axes.map((axis) => ({ axis, label: axisLabel(axis), found: named.has(axis) }));
  const lit = axes.filter((x) => x.found).length;
  return {
    axes,
    found: r?.ok ? Math.max(lit, r.value ?? rule.minAxes) : lit,
    need: rule.minAxes,
    a: sectionRefText(rule.a),
    b: sectionRefText(rule.b),
  };
}

/** "Differs on 1 of 2 needed: density. Try melody height, chords, register or energy." */
export function contrastText(f: ContrastFinding): string {
  const have = f.axes.filter((a) => a.found).map((a) => a.label);
  const rest = f.axes.filter((a) => !a.found).map((a) => a.label);
  const list = (xs: string[]) =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
  const head =
    f.found === 0
      ? `No difference yet between ${f.a} and ${f.b}`
      : `Differs on ${f.found} of ${f.need} needed${have.length ? `: ${have.join(", ")}` : ""}`;
  return f.found >= f.need || rest.length === 0 ? `${head}.` : `${head}. Try ${list(rest)}.`;
}

// --- length --------------------------------------------------------------------------------------

export interface DurationFinding {
  seconds: number;
  min: number;
  bars: number;
  bpm: number | null;
  /** Whole bars to add at this tempo to reach `min` (0 when long enough). */
  moreBars: number;
}

/** The length read from the code (the `arrange()` total at the code's tempo, never played; contracts §6.4). */
export function durationFinding(
  rule: RubricRule,
  piece: { bars: number; bpm: number | null; durationSec: number | null; meter: MeterId },
): DurationFinding | null {
  if (rule.rule !== "duration-sec") return null;
  const beats = METERS[piece.meter]?.unitsPerBar ?? 4;
  const barSec = piece.bpm && piece.bpm > 0 ? (60 / piece.bpm) * beats : null;
  const seconds = piece.durationSec ?? (barSec ? piece.bars * barSec : 0);
  const short = rule.min - seconds;
  return {
    seconds,
    min: rule.min,
    bars: piece.bars,
    bpm: piece.bpm,
    moreBars: short > 1e-9 && barSec ? Math.ceil(short / barSec - 1e-9) : 0,
  };
}

/** "1:16 of at least 1:30 (32 bars at 100 BPM). 8 more bars at this tempo." */
export function durationText(f: DurationFinding): string {
  const at = f.bpm ? ` (${f.bars} bars at ${Math.round(f.bpm)} BPM)` : ` (${f.bars} bars)`;
  const head = `${clock(f.seconds)} of at least ${clock(f.min)}${at}.`;
  if (f.moreBars === 0) return head;
  return `${head} ${f.moreBars} more ${f.moreBars === 1 ? "bar" : "bars"} at this tempo, or a slower tempo.`;
}

// --- row extras ----------------------------------------------------------------------------------

/** What a checklist row shows under its label beyond the rubric's own detail. */
export type RowExtra =
  | { kind: "contrast"; finding: ContrastFinding }
  | { kind: "duration"; finding: DurationFinding }
  | { kind: "section"; text: string }
  /** A line under the rule's own detail (how the section names read). */
  | { kind: "note"; text: string }
  /** Said instead of the rule's detail: the rule cannot read the piece until the parts agree on the sections. */
  | { kind: "unread"; text: string }
  /** Wave 6 (wave6.ts): what a rule found, each with the bars to look at (C6's colour note, C7's chords and lift). */
  | { kind: "found"; items: FoundItem[]; note?: string }
  /** Wave 6: CF-A's device counter, one row per device with the bars where the song has it. */
  | { kind: "devices"; rows: DeviceRow[]; found: number; need: number };

/** The rules that read the sections (and so cannot be read while the arranged parts disagree). */
const READS_SECTIONS = new Set(["form", "contrast", "key-change", "duration-sec", "groove-lock"]);

/**
 * The extras of every rule that has one: contrast axes, the length, and the section a section-anchored rule
 * reads ("Read in the chorus (bars 9–16)").
 */
export function rowExtras(
  rules: readonly RubricRule[],
  result: GradeResult | null,
  piece: {
    bars: number;
    bpm: number | null;
    durationSec: number | null;
    meter: MeterId;
    form: PieceForm | null;
    view?: FormView | null;
    analysis?: Pick<AnalysisSummary, "slots"> | null;
  },
): Record<string, RowExtra> {
  const out: Record<string, RowExtra> = {};
  const usable = result !== null && result.status !== "error";
  const problem = piece.form?.problem ?? null;
  const hint = piece.form?.hint ?? null;
  for (const rule of rules) {
    if (!usable) continue;
    const r = result.rubric?.find((x) => x.ruleId === rule.id);
    const sectioned = READS_SECTIONS.has(rule.rule) || ("section" in rule && rule.section !== undefined);
    if (problem && sectioned && r && !r.ok) {
      // The parts disagree about the sections: the rule has nothing to read yet. Its own number (a contrast of 0
      // axes, a length from one track's loop) would send the learner after the wrong fix. The form row says what
      // to write; the others keep the grader's line.
      if (rule.rule === "duration-sec")
        out[rule.id] = {
          kind: "unread",
          text: "Read from the sections once every arranged part agrees on them (see Form).",
        };
      else out[rule.id] = { kind: "note", text: rule.rule === "form" ? (hint ?? "") : "" };
      continue;
    }
    if (hint && rule.rule === "form" && r && !r.ok) {
      out[rule.id] = { kind: "note", text: hint };
      continue;
    }
    // A section the rule names is not in the piece under that name (`chordsV` is a "v"): nothing to compare yet.
    if (hint && r && !r.ok && namesMissingSection(rule, piece.form?.sections ?? [])) {
      out[rule.id] = { kind: "note", text: "" };
      continue;
    }
    const c = contrastFinding(rule, result, piece.view ?? null, piece.analysis ?? null);
    if (c) {
      out[rule.id] = { kind: "contrast", finding: c };
      continue;
    }
    const d = durationFinding(rule, piece);
    if (d) {
      out[rule.id] = { kind: "duration", finding: d };
      continue;
    }
    const ref = "section" in rule ? (rule.section as SectionRef | undefined) : undefined;
    if (ref) {
      const a = piece.form ? sectionRefAnchor(ref, piece.form.sections, piece.form.totalBars) : null;
      out[rule.id] = {
        kind: "section",
        text: a
          ? `Read in ${a.label ? `the ${a.label.toLowerCase()}` : sectionRefText(ref)} (${a.from === a.to ? `bar ${a.from}` : `bars ${a.from}–${a.to}`}).`
          : `Read in ${sectionRefText(ref)}, which the piece doesn't have yet.`,
      };
    }
  }
  return out;
}

/** The rule reads a named section (`contrast` a/b, a `section` ref) the piece has none of. */
function namesMissingSection(rule: RubricRule, sections: readonly FormViewSection[]): boolean {
  const refs: unknown[] = [];
  if (rule.rule === "contrast") refs.push(rule.a, rule.b);
  if ("section" in rule) refs.push(rule.section);
  return refs.some((ref) => {
    if (!ref || typeof ref !== "object" || !("section" in ref) || typeof ref.section !== "string")
      return false;
    const want = ref.section.toLowerCase();
    return !sections.some((s) => s.tag === want || s.label === want);
  });
}

// --- release honesty (c1) ------------------------------------------------------------------------

export type ReleaseGate =
  | { kind: "ready" }
  /** Every requirement met on the code in the editor, but not checked as this version: Check first. */
  | { kind: "check-again" }
  | { kind: "not-ready" };

/**
 * Whether "Release" is offered (contracts §6.6 "Release", decision 45): the first release must be of the code its
 * last passing check graded. A draft edited after that check says "Check again before you release"; the server's
 * `draftChangedSinceCheck` says the same for a draft edited in another sitting.
 */
export function releaseGate(o: {
  /** Every required rule met on the live check of the code now in the editor. */
  liveReady: boolean;
  /** The code the last official check (this sitting) passed, when it passed. */
  checkedPassingCode: string | null;
  code: string;
  /** A check was recorded in this sitting (passing or not). */
  checkedHere: boolean;
  /** `CapstoneState.draftChangedSinceCheck` (undefined: an older server). */
  serverChanged: boolean | undefined;
  /** The server's last recorded check passed (`CapstoneState.lastResult`). */
  serverPassed: boolean;
  /** The editor's code differs from the draft the workspace opened with. */
  editedSinceLoad: boolean;
  /** A revision of a released track is not re-checked. */
  released: boolean;
}): ReleaseGate {
  if (!o.liveReady) return { kind: "not-ready" };
  if (o.released) return { kind: "ready" };
  if (o.checkedPassingCode !== null)
    return o.checkedPassingCode === o.code ? { kind: "ready" } : { kind: "check-again" };
  if (o.checkedHere) return { kind: "check-again" };
  return o.serverChanged === false && o.serverPassed && !o.editedSinceLoad
    ? { kind: "ready" }
    : { kind: "check-again" };
}

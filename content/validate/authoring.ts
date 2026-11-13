// AUTHORING §5, §7 and §9 as checks: the voice rules (no exclamation marks, no hype words, prompt and
// concept-card length), the term rules (a term is bolded once, in the pass text of the step that
// declares it, and is not used in any prompt, hint or prose before that), and the test-shape rules that
// make a step's feedback trustworthy (the unchanged starter fails with `code.unchanged`; a Make has a
// sketch that fails with `rubric.unmet`). Pure functions over the definitions: shared by content:check,
// the lesson suite and the checkpoint/capstone checks.
import {
  type Exercise,
  flattenExercise,
  type LessonDef,
  type Matcher,
  type RubricRule,
  stripMarkers,
  type TermEntry,
} from "@oak/content-kit";
import { registries } from "../index.ts";
import { termById } from "../terms.ts";

const WORDS_PROMPT = 60;
const WORDS_CONCEPT = 120;

/** Hype, filler and blame (AUTHORING §5). Matched as whole words, case-insensitively. */
const BANNED: readonly [RegExp, string][] = [
  [/\bsimply\b/i, '"simply" (if it were simple, nobody would need telling)'],
  [/\bobviously\b/i, '"obviously"'],
  [/\b(easy|easily)\b/i, '"easy" (it is not easy for everyone)'],
  // "Amazing Grace" is a hymn title (U07.L09), not praise.
  [
    /\bgreat job\b|\bawesome\b|\bamazing\b(?! grace)|\bwell done\b/i,
    "generic praise (name what the learner did)",
  ],
  [/\boops\b|\bwrong!/i, "blame"],
  [/\blet['’]s\b/i, '"let\'s" (write to one adult: second person)'],
  [/\byou should\b/i, '"you should"'],
  [/\bdon['’]t worry\b/i, '"don\'t worry"'],
  [/\bdive\b|\bjourney\b|\bmagic(al)?\b/i, "hype"],
];
const EMOJI = /\p{Extended_Pictographic}/u;

/** Prose without inline code, JSX tags, MDX comments or markdown emphasis. */
export function plain(md: string): string {
  return md
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/`[^`]*`/g, " CODE ")
    .replace(/<\/?[A-Z][^>]*>/g, " ")
    .replace(/[*_]{1,2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const wordCount = (md: string) =>
  plain(md)
    .split(" ")
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** The raw MDX inside each `<Step id>`, split into the prose and the `<OnPass>` text. */
export function mdxSteps(source: string): Map<string, { prose: string; onPass: string }> {
  const out = new Map<string, { prose: string; onPass: string }>();
  for (const m of source.matchAll(/<Step id="(S\d+)">([\s\S]*?)<\/Step>/g)) {
    const body = m[2] as string;
    const onPass = [...body.matchAll(/<OnPass>([\s\S]*?)<\/OnPass>/g)].map((x) => x[1]).join("\n");
    out.set(m[1] as string, { prose: body.replace(/<OnPass>[\s\S]*?<\/OnPass>/g, ""), onPass });
  }
  return out;
}

interface Text {
  where: string;
  text: string;
  /** Shown before the learner answers (prompts, hints, prose), as opposed to pass text. */
  before: boolean;
}
const hintTexts = (e: Exercise): string[] =>
  (e.hints ?? []).flatMap((h) => (typeof h === "object" ? [h.text] : []));
const ruleLabels = (rules: readonly RubricRule[]): string[] => rules.map((r) => r.label);

/** Every learner-facing string of an exercise (code excluded). */
export function exerciseTexts(e: Exercise, where: string): Text[] {
  const out: Text[] = [];
  const add = (w: string, text: string | undefined, before = true) => {
    if (text) out.push({ where: `${where}${w}`, text, before });
  };
  for (const x of flattenExercise(e)) {
    const at = x === e ? "" : `/${x.id}`;
    add(`${at} prompt`, x.prompt);
    for (const [i, h] of hintTexts(x).entries()) add(`${at} hint ${i + 1}`, h);
    for (const [code, text] of Object.entries(x.feedbackText ?? {}))
      add(`${at} feedback ${code}`, text as string, false);
    if (x.kind === "predict") for (const c of x.choices ?? []) add(`${at} choice ${c.id}`, c.label);
    if (x.kind === "listen") for (const [i, it] of x.items.entries()) add(`${at} item ${i + 1}`, it.caption);
    if (x.kind === "run-investigate")
      x.questions.forEach((q, i) => {
        add(`${at} question ${i + 1}`, q.prompt);
        if (q.q === "choice") for (const o of q.options) add(`${at} question ${i + 1} option`, o.label);
      });
    if ("answer" in x && (x.answer.ui === "choice" || x.answer.ui === "slot-choice"))
      for (const o of x.answer.options) add(`${at} option ${o.id}`, o.label);
    // Wave 4: slot labels, the widgets of staged dictation, the parts of a by-ear transcription.
    if ("answer" in x && x.answer.ui === "slot-choice")
      for (const [i, l] of (x.answer.labels ?? []).entries()) add(`${at} slot ${i + 1}`, l);
    if (x.kind === "dictation") {
      for (const [stage, ui] of Object.entries(x.stageAnswers ?? {}))
        if (ui && (ui.ui === "choice" || ui.ui === "slot-choice"))
          for (const o of ui.options) add(`${at} ${stage} option ${o.id}`, o.label);
      for (const [i, p] of (x.byEar?.parts ?? []).entries()) add(`${at} part ${i + 1}`, p.label);
    }
    if ("rubric" in x) for (const l of ruleLabels(x.rubric)) add(`${at} rubric`, l);
    if (x.kind === "compose-brief") add(`${at} brief`, x.brief);
  }
  return out;
}

/** Voice rules over a list of texts (prompts additionally get the 60-word limit). */
export function voiceIssues(texts: readonly Text[]): string[] {
  const issues: string[] = [];
  for (const t of texts) {
    const p = plain(t.text);
    if (p.includes("!")) issues.push(`${t.where}: no exclamation marks ("${p.slice(0, 50)}")`);
    if (EMOJI.test(t.text)) issues.push(`${t.where}: no emoji`);
    for (const [re, why] of BANNED) if (re.test(p)) issues.push(`${t.where}: avoid ${why}`);
    if (/ prompt$/.test(t.where) && wordCount(t.text) > WORDS_PROMPT)
      issues.push(`${t.where}: ${wordCount(t.text)} words; a prompt has at most ${WORDS_PROMPT}`);
  }
  return issues;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * The word as it appears in running text, with a plural. Word edges are Unicode-aware, so a term that ends in
 * a non-ASCII letter ("line cliché") is still found.
 */
const termRe = (t: TermEntry) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t.term)}(s|es)?(?![\\p{L}\\p{N}])`, "iu");

/** Terms of later lessons (in the default order) that this text uses: advice, since many are everyday words. */
function laterTerms(lessonId: string): TermEntry[] {
  const order = registries.syllabus.defaultOrder as readonly string[];
  const here = order.indexOf(lessonId);
  if (here < 0) return [];
  return registries.terms.filter((t) => order.indexOf(t.introducedBy) > here);
}

export interface AuthoringResult {
  issues: string[];
  warnings: string[];
}

/** AUTHORING §5 (voice), §7 (terms) and §9 (test shape) for one lesson. */
export function lessonAuthoring(def: LessonDef, mdxSource: string | null, sample = false): AuthoringResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const mdx = mdxSteps(mdxSource ?? "");
  const stepIndex = new Map(def.steps.map((s, i) => [s.id as string, i] as const));

  // Every learner-facing text, tagged with its step index.
  const texts: (Text & { i: number })[] = [];
  def.steps.forEach((s, i) => {
    texts.push({ where: `${s.id} title`, text: s.title, before: true, i });
    if (s.exercise) for (const t of exerciseTexts(s.exercise, s.id)) texts.push({ ...t, i });
    const m = mdx.get(s.id);
    if (m) {
      texts.push({ where: `${s.id} prose`, text: m.prose, before: true, i });
      if (m.onPass) texts.push({ where: `${s.id} pass text`, text: m.onPass, before: false, i });
    }
    if (s.kind === "concept" && m && wordCount(m.prose) > WORDS_CONCEPT)
      issues.push(`${s.id}: the concept card has ${wordCount(m.prose)} words; at most ${WORDS_CONCEPT}`);
  });
  issues.push(...voiceIssues(texts));

  // Terms: bold once, in the pass text of the declaring step; never used before it.
  for (const decl of def.terms) {
    const t = termById.get(decl.id);
    const at = stepIndex.get(decl.step);
    if (!t || at === undefined) continue;
    const re = termRe(t);
    // A bold that is another term this lesson declares ("**half cadence**" beside "**cadence**") is that
    // term's bold, not this one's.
    const others = def.terms
      .filter((d) => d.id !== decl.id)
      .flatMap((d) => {
        const o = termById.get(d.id);
        return o && o.term.length > t.term.length ? [termRe(o)] : [];
      });
    const own = (b: string) => re.test(b) && !others.some((o) => o.test(b));
    const bold = [...(mdxSource ?? "").matchAll(/\*\*([^*]+)\*\*/g)].filter((m) => own(m[1] as string));
    const inPass = [...(mdx.get(decl.step)?.onPass ?? "").matchAll(/\*\*([^*]+)\*\*/g)].some((m) =>
      own(m[1] as string),
    );
    if (!sample && (!inPass || bold.length !== 1))
      issues.push(
        `${decl.id}: bold "**${t.term}**" exactly once, in the <OnPass> of ${decl.step} (found ${bold.length} bold use${bold.length === 1 ? "" : "s"}${inPass ? "" : ", none in that pass text"})`,
      );
    // (The gate sample predates this rule: its S5 prose shows the <Term> component before the pass text.)
    for (const x of sample ? [] : texts)
      if ((x.i < at || (x.i === at && x.before)) && re.test(plain(x.text)))
        issues.push(`${x.where}: uses "${t.term}" before ${decl.step} introduces it`);
  }
  if (!sample)
    for (const t of laterTerms(def.id))
      for (const x of texts)
        if (termRe(t).test(plain(x.text)))
          warnings.push(
            `${x.where}: "${t.term}" is a term of ${t.introducedBy}; say it another way unless it is plain English here`,
          );

  // Feedback in words the learner has: before U03.L02 the grader's melody feedback names scale degrees
  // and solfège ("you have 5 (sol)"), so note-name steps override it.
  const order = registries.syllabus.defaultOrder as readonly string[];
  const at = order.indexOf(def.id);
  const beforeDegrees = !sample && at >= 0 && at < order.indexOf("U03.L02");
  // Singing is on numbers until U03.L08 introduces syllables (contracts §8.3): before it, no syllable labels
  // and no catalog text that names syllables.
  const beforeSyllables = !sample && at >= 0 && at < order.indexOf("U03.L08");
  issues.push(...labelIssues(def, { beforeDegrees, beforeSyllables }));
  // Test shape.
  for (const s of def.steps) {
    if (!s.exercise) continue;
    for (const e of flattenExercise(s.exercise)) {
      issues.push(...testShapeIssues(e, `${s.id}/${e.id}`));
      if (beforeDegrees) issues.push(...degreeWordIssues(e, `${s.id}/${e.id}`));
      if (beforeSyllables) issues.push(...syllableWordIssues(e, `${s.id}/${e.id}`));
      issues.push(...singIssues(e, `${s.id}/${e.id}`, { lesson: def.id, beforeSyllables }));
    }
    if (s.kind === "make" && (s.minutes < 2 || s.minutes > 3))
      warnings.push(`${s.id}: a Make is budgeted at 2.5–3 expert minutes (found ${s.minutes})`);
    const make = s.exercise;
    if (make.kind === "code-make") {
      const starter = stripMarkers(make.code.starter).code;
      if (!make.tests.some((t) => "code" in t.response && t.response.code === starter))
        warnings.push(
          `${s.id}: no test grades the Make starter itself; say whether it passes (it already plays and nearly meets the rule)`,
        );
    }
  }
  return { issues, warnings };
}

/** The unchanged starter fails with `code.unchanged`; a Make has a sketch that fails with `rubric.unmet`. */
export function testShapeIssues(e: Exercise, where: string): string[] {
  const issues: string[] = [];
  if (e.kind === "code-modify" || e.kind === "error-hunt") {
    const starter = stripMarkers(e.code.starter).code;
    const t = e.tests.find((x) => "code" in x.response && x.response.code === starter);
    if (t?.expect !== "fail" || !(t.feedback ?? []).includes("code.unchanged"))
      issues.push(`${where}: needs a test with the unchanged starter that fails with code.unchanged`);
  }
  if (e.kind === "code-make") {
    if (!e.tests.some((t) => t.expect === "fail" && (t.feedback ?? []).includes("rubric.unmet")))
      issues.push(`${where}: needs a sketch that breaks the required rule and fails with rubric.unmet`);
  }
  if (e.kind === "sing") {
    if (!e.fallback) issues.push(`${where}: a sing exercise declares a fallback`);
    if (e.tol.cents !== "learner") issues.push(`${where}: sing tolerance is cents: 'learner'`);
  }
  if (e.kind === "tap" && e.tol.windowMs !== "auto")
    issues.push(`${where}: tap tolerance is windowMs: 'auto'`);
  return issues;
}

/** Degree and syllable labels on the roll and staff only once they are taught (AUTHORING §6, contracts §8.3). */
export function labelIssues(
  def: LessonDef,
  o: { beforeDegrees: boolean; beforeSyllables: boolean },
): string[] {
  const issues: string[] = [];
  for (const s of def.steps)
    for (const [panel, labels] of [
      ["roll", s.ui.rollLabels],
      ["staff", s.ui.staffLabels],
    ] as const) {
      if (o.beforeDegrees && (labels === "degree" || labels === "degree+solfege"))
        issues.push(`${s.id}: ${panel} labels "${labels}" before U03.L02 teaches degrees`);
      else if (o.beforeSyllables && labels === "degree+solfege")
        issues.push(`${s.id}: ${panel} labels "${labels}" before U03.L08 teaches the syllables`);
    }
  return issues;
}

/**
 * The catalog codes whose text names solfège syllables (`{gotSyl}`, `{tonicSyl}`): overridden in
 * `feedbackText` before U03.L08 on every step that can earn them.
 */
export const SYLLABLE_WORDED_CODES = { pitched: "melody.wrong-degree", sing: "sing.drift" } as const;

/**
 * Before U03.L08: a step graded on pitch rewords `melody.wrong-degree`; a sung phrase (any mode but a
 * single `pitch` target, where nothing can drift) rewords `sing.drift`.
 */
export function syllableWordIssues(e: Exercise, where: string): string[] {
  if (e.kind === "sing")
    return e.mode === "pitch" || e.feedbackText?.[SYLLABLE_WORDED_CODES.sing]
      ? []
      : [
          `${where}: before U03.L08 the grader's ${SYLLABLE_WORDED_CODES.sing} text names a syllable; override it in feedbackText (numbers only)`,
        ];
  const m = "matcher" in e ? e.matcher : undefined;
  // Graded on pitch, and about pitched notes (a drum step's events matcher also names a pitch mode).
  const notes = "reference" in e && e.reference?.solutions.some((c) => /\b(?:n|note)\(/.test(c));
  if (!m || !isPitched(m) || !notes || e.feedbackText?.[SYLLABLE_WORDED_CODES.pitched]) return [];
  return [
    `${where}: before U03.L08 the grader's ${SYLLABLE_WORDED_CODES.pitched} text names syllables ("5 (sol)"); override it in feedbackText with numbers only (see U03.L02 S4)`,
  ];
}
const isPitched = (m: Matcher): boolean =>
  (m.m === "events" && m.pitch !== undefined) || m.m === "melody" || (m.m === "all" && m.of.some(isPitched));

/** Sung labels and the lenient first sing (contracts §8.1 item 8, §8.3). */
export function singIssues(
  e: Exercise,
  where: string,
  o: { lesson: string; beforeSyllables: boolean },
): string[] {
  if (e.kind !== "sing") return [];
  const issues: string[] = [];
  if (o.beforeSyllables && e.labels === "syllables")
    issues.push(`${where}: sung on syllables before U03.L08 teaches them; use labels "numbers"`);
  if (e.tol.lenient && o.lesson !== "U00.L02")
    issues.push(`${where}: the lenient ±100¢ sing is U00.L02's first note only (contracts §8.1 item 8)`);
  return issues;
}

/** The catalog codes whose text speaks in degrees and solfège (packages/grader/src/feedback/catalog.ts). */
export const DEGREE_WORDED_CODES = [
  "melody.wrong-degree",
  "melody.missing-note",
  "melody.extra-note",
] as const;

/** A pitched code step graded on pitch before U03.L02 must reword the degree-worded feedback codes. */
export function degreeWordIssues(e: Exercise, where: string): string[] {
  if (!("matcher" in e) || !e.matcher || !("code" in e) || typeof e.code !== "object") return [];
  const m = e.matcher;
  const pitched = (m.m === "events" && m.pitch !== undefined) || m.m === "melody";
  if (!pitched || !/\bnote\(/.test(e.code.starter)) return [];
  const missing = DEGREE_WORDED_CODES.filter((c) => !e.feedbackText?.[c]);
  return missing.length
    ? [
        `${where}: before U03.L02 the grader's ${missing.join(", ")} text names degrees and solfège; override it in feedbackText (see U02.L01 S5)`,
      ]
    : [];
}

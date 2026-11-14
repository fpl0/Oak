// Review schemas (contracts §10.6). Each is defined once here: as zod (the server's validation and
// the Review sheet's type), and as a strict JSON Schema (the `submit_*` tool input on the API
// backend, `--json-schema` on the CLI backend).
//
// A strict JSON Schema cannot express counts, word limits or tuple lengths, so `validate*`
// checks those. A violation is returned as `problems` the model can read and fix once.
import { z } from "zod";
import type { IntroducedTerms, ReviewSource } from "./domain.ts";
import { arrangeProblems, proseProblems, type ReviewLintContext, tryKeyProblem } from "./lint/review.ts";
import { formatLintIssues, lintStrict } from "./lint/strict.ts";
import { countWords } from "./markup.ts";
import type { StructuredCheck } from "./types.ts";

export type ReviewKind = "capstone" | "transcription";

export const LAYERS = ["drums", "bass", "chords", "melody", "form"] as const;

const Bars = z.tuple([z.number().int(), z.number().int()]);

export const CapstoneReviewSchema = z.strictObject({
  strengths: z.array(z.strictObject({ text: z.string(), bars: Bars })),
  revisions: z.array(
    z.strictObject({
      title: z.string(),
      bars: Bars,
      why: z.string(),
      tryCode: z.string(),
      skills: z.array(z.string()),
    }),
  ),
  listeningQuestion: z.string(),
  linerNote: z.string(),
});
export type CapstoneReview = z.infer<typeof CapstoneReviewSchema>;

export const TranscriptionReviewSchema = z.strictObject({
  strengths: z.array(z.strictObject({ text: z.string(), bars: Bars, layer: z.enum(LAYERS) })),
  revisions: z.array(
    z.strictObject({
      title: z.string(),
      bars: Bars,
      layer: z.enum(LAYERS),
      why: z.string(),
      listenFor: z.string(),
    }),
  ),
  plausibilityFlags: z.array(z.strictObject({ bars: Bars, issue: z.string() })),
  listeningQuestion: z.string(),
  linerNote: z.string(),
});
export type TranscriptionReview = z.infer<typeof TranscriptionReviewSchema>;

export type ReviewValue = CapstoneReview | TranscriptionReview;

/**
 * The third kind (contracts §10.2, §10.10): a listening note on a saved sketch, or a comment on one. It is
 * streamed prose, not a tool call, so the schema is checked after the turn: 2–3 sentences, at least one concrete
 * bar, degree, chord or rhythm (2–3 sentences asked, 1–4 kept), at most one question, no verdict and no claim to have heard audio. A note that
 * fails it is still shown (it was already streamed) but is not kept as a tutor note.
 */
export const ListeningNoteSchema = z.strictObject({ text: z.string().min(1).max(1_200) });
export type ListeningNote = z.infer<typeof ListeningNoteSchema>;

export const REVIEW_LIMITS = {
  strengths: [2, 3],
  strengthWords: 40,
  titleWords: 8,
  whyWords: 50,
  tryCodeLines: 12,
  skills: 3,
  listenForWords: 30,
  flags: 3,
  flagWords: 30,
  questionWords: 30,
  linerNoteWords: 60,
} as const;

// --- JSON Schemas ------------------------------------------------------------------------------
// Strict form: every object closed, every property required, no numeric or length bounds.

type JsonSchema = Readonly<Record<string, unknown>>;

const str = (description: string): JsonSchema => ({ type: "string", description });
const bars: JsonSchema = {
  type: "array",
  items: { type: "integer" },
  description: "Exactly two integers [first_bar, last_bar], 1-based and inclusive.",
};
const layer: JsonSchema = { type: "string", enum: [...LAYERS] };

function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

const listeningQuestion = str(
  "Exactly one question, at most 30 words, answerable by listening to the learner's own track.",
);
const linerNote = str(
  "At most 60 words, third person, ready to print as liner notes. Never says pass or fail.",
);

export const CAPSTONE_REVIEW_JSON_SCHEMA: JsonSchema = obj({
  strengths: {
    type: "array",
    description: "Exactly 2 or 3 strengths, each anchored to bars.",
    items: obj({ text: str("At most 40 words. Specific, never generic praise."), bars }),
  },
  revisions: {
    type: "array",
    description: "Exactly the number of revisions that oak_context asks for (1 or 2).",
    items: obj({
      title: str("At most 8 words."),
      bars,
      why: str("At most 50 words: the musical reason."),
      tryCode: str("At most 12 lines of Strudel in Oak's dialect that the learner can preview."),
      skills: {
        type: "array",
        items: { type: "string" },
        description: "At most 3 skill IDs from the syllabus.",
      },
    }),
  },
  listeningQuestion,
  linerNote,
});

export const TRANSCRIPTION_REVIEW_JSON_SCHEMA: JsonSchema = obj({
  strengths: {
    type: "array",
    description: "Exactly 2 or 3 strengths, each anchored to bars and a layer.",
    items: obj({ text: str("At most 40 words."), bars, layer }),
  },
  revisions: {
    type: "array",
    description: "Exactly the number of revisions that oak_context asks for (1 or 2).",
    items: obj({
      title: str("At most 8 words."),
      bars,
      layer,
      why: str("At most 50 words."),
      listenFor: str("At most 30 words: what to listen for. Never the answer."),
    }),
  },
  plausibilityFlags: {
    type: "array",
    description:
      'Zero to 3 places where the transcription contradicts itself, e.g. "bass and chord disagree in bar 5".',
    items: obj({ bars, issue: str("At most 30 words.") }),
  },
  listeningQuestion,
  linerNote,
});

// --- validation --------------------------------------------------------------------------------

export interface ReviewRules {
  /** 1 for C0-C4 and X1; 2 from C5 on (see `revisionCountFor`). */
  revisions: 1 | 2;
  /** Length of the piece when known: bar anchors must lie inside it. */
  totalBars?: number | null;
  /**
   * Wave 6 (d2): the piece's keys and the learner's vocabulary, for the review lint (lint/review.ts): try-it code
   * in the piece's key and in STYLE's arrange() form, prose inside the introduced terms. Absent: not checked.
   */
  lint?: ReviewLintContext | null;
  /** 3 when the review must give exactly three strengths, the strongest first (the Core Finale's single). */
  strengths?: 2 | 3 | undefined;
}

/**
 * Strengths a capstone's review must give, when fixed: CF-A, the learner's album single, gets three, the first
 * naming what is strongest in the song (wave6 tutor task; contracts §10.6 allows two or three everywhere).
 */
export function strengthsWantedFor(capstoneId: string | null | undefined): 3 | undefined {
  return capstoneId === "CF-A" ? 3 : undefined;
}

/**
 * The rules a review of this piece is held to: its revision count and length, the keys its try-it code may be in
 * (the key plan's keys, else the piece's key) and the terms its prose may use.
 */
export function reviewRulesOf(
  review: Pick<ReviewSource, "revisions" | "totalBars" | "facts" | "strengthsWanted">,
  terms: IntroducedTerms | null,
  subjectId?: string | null,
): ReviewRules {
  const plan = review.facts?.keyPlan ?? [];
  const keys =
    plan.length > 0 ? [...new Set(plan.map((k) => k.key))] : review.facts?.key ? [review.facts.key] : [];
  // Only the whole list can say a term is NOT met: `recent` alone drops early terms (contracts §10.8), so without
  // `all` the vocabulary is unknown and only names the course never uses are refused.
  const introduced = terms?.all !== undefined ? new Set(terms.all) : null;
  return {
    revisions: review.revisions,
    totalBars: review.totalBars,
    lint: { keys, introduced },
    strengths: review.strengthsWanted ?? strengthsWantedFor(subjectId),
  };
}

/** Capstones that get one revision; every later capstone gets two (contracts §10.6). */
const ONE_REVISION = new Set(["C0", "C1", "C2", "C3", "C4", "X1"]);

export function revisionCountFor(capstoneId: string): 1 | 2 {
  return ONE_REVISION.has(capstoneId) ? 1 : 2;
}

/** Verdict language: "this passes", "would fail the check", "a passing grade" (not "passing tone", "passes through"). */
export const VERDICT =
  /\b(?:(?:you|it|this|that|the (?:piece|track|draft|song|transcription|loop))\s+(?:would\s+|will\s+|should\s+|now\s+)?(?:pass(?:es|ed)?|fail(?:s|ed)?)\b(?!\s+(?:through|over|under|by|from|to|into))|\b(?:pass(?:es|ed)?|fail(?:s|ed)?)\s+(?:the|Oak's|this)\s+(?:check(?:er)?|rubric|capstone|test|grade)\b|\b(?:passing|failing)\s+grade\b)/i;

/** "I heard", "it sounds like" said as if the tutor listened: the tutor reads code, never audio (§10.11). */
const HEARD = /\b(?:I\s+(?:heard|hear|listened)|(?:I|we)\s+can\s+hear)\b/i;
const CITES =
  /\[\[(?:deg|chord|rn|bars|note):|\bbars?\s+\d|\bbeat\s+\d|\bdegree\s+[b#]?\d|\b(?:rhythm|syncopat\w*|offbeat|downbeat|backbeat)\b/i;

export function validateListeningNote(raw: unknown): StructuredCheck<ListeningNote> {
  const parsed = ListeningNoteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: zodProblems(parsed.error) };
  const text = parsed.data.text.trim();
  const problems: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+(?=\S)/).filter((x) => /\w/.test(x)).length;
  // The persona asks for 2 or 3 sentences; one short sentence or a fourth is tolerated, a paragraph is not a note.
  if (sentences < 1 || sentences > 4) problems.push(`text: ${sentences} sentences, a note has 2 or 3`);
  if (!CITES.test(text)) problems.push("text: cite at least one concrete bar, degree, chord or rhythm");
  if ((text.match(/\?/g) ?? []).length > 1) problems.push("text: at most one question");
  if (VERDICT.test(text)) problems.push("text: do not say or imply pass or fail");
  if (HEARD.test(text)) problems.push("text: the tutor reads code and score, never audio");
  return problems.length === 0 ? { ok: true, value: { text } } : { ok: false, problems };
}

function zodProblems(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "review"}: ${i.message}`);
}

class Checker {
  readonly problems: string[] = [];
  constructor(private readonly rules: ReviewRules) {}

  words(path: string, text: string, max: number): void {
    const n = countWords(text);
    if (n === 0) this.problems.push(`${path}: must not be empty`);
    else if (n > max) this.problems.push(`${path}: ${n} words, the limit is ${max}`);
  }

  count(path: string, n: number, min: number, max: number): void {
    if (n >= min && n <= max) return;
    const want = min === max ? `exactly ${min}` : `${min} to ${max}`;
    this.problems.push(`${path}: need ${want}, got ${n}`);
  }

  bars(path: string, [from, to]: [number, number]): void {
    const total = this.rules.totalBars ?? null;
    if (from < 1 || to < from)
      this.problems.push(`${path}: bars must be [first, last] with 1 <= first <= last`);
    else if (total !== null && to > total)
      this.problems.push(`${path}: bar ${to} is past the end (${total} bars)`);
  }

  /** Wave 6 (d2): harmony names stay inside the learner's vocabulary. Not checked without the lint context. */
  prose(path: string, text: string): void {
    const lint = this.rules.lint;
    if (!lint) return;
    for (const p of proseProblems(text, lint.introduced)) this.problems.push(`${path}: ${p}`);
  }

  /** Wave 6 (d2): try-it code in the piece's key and in STYLE's arrange() form. */
  tryCode(path: string, code: string): void {
    for (const p of arrangeProblems(code)) this.problems.push(`${path}: ${p}`);
    const keys = this.rules.lint?.keys ?? [];
    const key = keys.length > 0 ? tryKeyProblem(code, keys) : null;
    if (key !== null) this.problems.push(`${path}: ${key}`);
  }

  /** Contracts §10.6: a review never states or implies pass or fail. */
  verdict(path: string, text: string): void {
    if (VERDICT.test(text))
      this.problems.push(`${path}: do not say or imply pass or fail; Oak's checker decides`);
  }

  common(review: { listeningQuestion: string; linerNote: string }): void {
    this.verdict("listeningQuestion", review.listeningQuestion);
    this.verdict("linerNote", review.linerNote);
    const q = review.listeningQuestion.trim();
    this.words("listeningQuestion", q, REVIEW_LIMITS.questionWords);
    if ((q.match(/\?/g) ?? []).length !== 1 || !q.endsWith("?")) {
      this.problems.push("listeningQuestion: must be exactly one question ending in '?'");
    }
    this.prose("listeningQuestion", review.listeningQuestion);
    this.prose("linerNote", review.linerNote);
    this.words("linerNote", review.linerNote, REVIEW_LIMITS.linerNoteWords);
    if (/\byou(?:r|rs|'re|'ve|'ll)?\b/i.test(review.linerNote)) {
      this.problems.push("linerNote: write in the third person (no 'you')");
    }
  }
}

export function validateCapstoneReview(raw: unknown, rules: ReviewRules): StructuredCheck<CapstoneReview> {
  const parsed = CapstoneReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: zodProblems(parsed.error) };
  const r = parsed.data;
  const c = new Checker(rules);
  const [minS, maxS] = rules.strengths === 3 ? [3, 3] : REVIEW_LIMITS.strengths;
  c.count("strengths", r.strengths.length, minS, maxS);
  r.strengths.forEach((s, i) => {
    c.words(`strengths[${i}].text`, s.text, REVIEW_LIMITS.strengthWords);
    c.verdict(`strengths[${i}].text`, s.text);
    c.prose(`strengths[${i}].text`, s.text);
    c.bars(`strengths[${i}].bars`, s.bars);
  });
  c.count("revisions", r.revisions.length, rules.revisions, rules.revisions);
  r.revisions.forEach((rev, i) => {
    const at = `revisions[${i}]`;
    c.words(`${at}.title`, rev.title, REVIEW_LIMITS.titleWords);
    c.words(`${at}.why`, rev.why, REVIEW_LIMITS.whyWords);
    c.verdict(`${at}.why`, rev.why);
    c.prose(`${at}.title`, rev.title);
    c.prose(`${at}.why`, rev.why);
    c.bars(`${at}.bars`, rev.bars);
    if (rev.skills.length > REVIEW_LIMITS.skills)
      c.problems.push(`${at}.skills: at most ${REVIEW_LIMITS.skills}`);
    const lines = rev.tryCode.replace(/\s+$/, "").split("\n").length;
    if (rev.tryCode.trim() === "") c.problems.push(`${at}.tryCode: must not be empty`);
    else if (lines > REVIEW_LIMITS.tryCodeLines) {
      c.problems.push(`${at}.tryCode: ${lines} lines, the limit is ${REVIEW_LIMITS.tryCodeLines}`);
    }
    // tryCode is code the learner did not type: it gets the same strict profile as a card.
    for (const line of formatLintIssues(lintStrict(rev.tryCode))) c.problems.push(`${at}.tryCode: ${line}`);
    c.tryCode(`${at}.tryCode`, rev.tryCode);
  });
  c.common(r);
  return c.problems.length === 0 ? { ok: true, value: r } : { ok: false, problems: c.problems };
}

export function validateTranscriptionReview(
  raw: unknown,
  rules: ReviewRules,
): StructuredCheck<TranscriptionReview> {
  const parsed = TranscriptionReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: zodProblems(parsed.error) };
  const r = parsed.data;
  const c = new Checker(rules);
  const [minS, maxS] = rules.strengths === 3 ? [3, 3] : REVIEW_LIMITS.strengths;
  c.count("strengths", r.strengths.length, minS, maxS);
  r.strengths.forEach((s, i) => {
    c.words(`strengths[${i}].text`, s.text, REVIEW_LIMITS.strengthWords);
    c.verdict(`strengths[${i}].text`, s.text);
    c.prose(`strengths[${i}].text`, s.text);
    c.bars(`strengths[${i}].bars`, s.bars);
  });
  c.count("revisions", r.revisions.length, rules.revisions, rules.revisions);
  r.revisions.forEach((rev, i) => {
    const at = `revisions[${i}]`;
    c.words(`${at}.title`, rev.title, REVIEW_LIMITS.titleWords);
    c.words(`${at}.why`, rev.why, REVIEW_LIMITS.whyWords);
    c.verdict(`${at}.why`, rev.why);
    c.prose(`${at}.title`, rev.title);
    c.prose(`${at}.why`, rev.why);
    c.prose(`${at}.listenFor`, rev.listenFor);
    c.words(`${at}.listenFor`, rev.listenFor, REVIEW_LIMITS.listenForWords);
    c.bars(`${at}.bars`, rev.bars);
  });
  c.count("plausibilityFlags", r.plausibilityFlags.length, 0, REVIEW_LIMITS.flags);
  r.plausibilityFlags.forEach((f, i) => {
    c.prose(`plausibilityFlags[${i}].issue`, f.issue);
    c.words(`plausibilityFlags[${i}].issue`, f.issue, REVIEW_LIMITS.flagWords);
    c.bars(`plausibilityFlags[${i}].bars`, f.bars);
  });
  c.common(r);
  return c.problems.length === 0 ? { ok: true, value: r } : { ok: false, problems: c.problems };
}

export function validateReview(
  kind: ReviewKind,
  raw: unknown,
  rules: ReviewRules,
): StructuredCheck<ReviewValue> {
  return kind === "capstone" ? validateCapstoneReview(raw, rules) : validateTranscriptionReview(raw, rules);
}

export function reviewJsonSchema(kind: ReviewKind): JsonSchema {
  return kind === "capstone" ? CAPSTONE_REVIEW_JSON_SCHEMA : TRANSCRIPTION_REVIEW_JSON_SCHEMA;
}

/** The one-line hand-off the chat conversation is told (contracts §10.2 "Seeding"). */
export function reviewSummaryLine(subjectId: string, review: ReviewValue): string {
  const titles = review.revisions.map((r) => `'${r.title.trim()}'`).join(", ");
  return `review of ${subjectId} submitted: revision ${titles}`;
}

/** What a review leaves behind as a tutor note: its revision titles and its listening question. */
export function reviewNoteText(review: ReviewValue): string {
  const titles = review.revisions.map((r) => r.title.trim()).join("; ");
  return `Review suggested: ${titles}. Listening question: ${review.listeningQuestion.trim()}`;
}

// The feedback catalog (exercises §2.6 plus the additions of contracts §5.7, plus the codes the matcher
// library emits). Every diagnostic the grader produces has exactly one entry here, so a message is
// always the same text for the same finding. An exercise may override the text, never the code.
import type { Diagnostic, FeedbackId, GradeResult, Loc, Md, Severity } from "@oak/content-kit";
import type { FeedbackTemplate } from "../types.ts";

type Sev = FeedbackTemplate["severity"];
const E: Sev = "error";
const W: Sev = "warn";
const I: Sev = "info";
const P: Sev = "praise";

const entries: [string, Sev, string][] = [
  // --- evaluation
  ["eval.syntax", E, "Line {line}: {detail}. Check brackets, commas and quotes."],
  ["eval.mini-parse", E, "Line {line}: the pattern string can't be read ({detail})."],
  [
    "eval.timeout",
    E,
    "Your code ran over {ms} ms, which usually means an endless loop or a huge pattern like `.fast(10000)`.",
  ],
  ["eval.too-many-events", E, "That's {n} notes in {bars} bars, which is too many to check. Simplify it."],
  ["eval.too-much-work", E, "This pattern does too much work to check. Simplify it."],
  ["eval.runtime", E, "{fn} failed: {detail}"],
  ["eval.query", E, "{fn} failed: {detail}"],
  ["eval.not-a-pattern", E, "The code doesn't end in a pattern, so nothing would play."],
  ["eval.silent", E, "Nothing plays in bars 1–{bars}."],
  ["eval.crashed", E, "The checker stopped unexpectedly. Run it again."],
  ["eval.truncated", I, "This piece is longer than {bars} bars; only the first {bars} were checked."],
  // --- code (lint and constraints)
  [
    "code.single-quoted-pattern",
    W,
    "'{text}' uses single quotes, so it's plain text, not a pattern. Use \"{text}\".",
  ],
  [
    "code.n-without-scale",
    E,
    '`n("…")` gives numbers, not pitches. Add `.scale("{key}")`, where 0 = degree 1.',
  ],
  [
    "code.label-duplicate",
    { graded: W, studio: I, content: E },
    '"{label}:" is used twice; the second line replaces the first.',
  ],
  [
    "code.unlabelled-line",
    { graded: W, studio: I, content: E },
    "This line has no label, so it does not play next to the labelled parts.",
  ],
  ["code.bare-value", E, 'Values with no sound control. Use `note("…")` or `s("…")`.'],
  ["code.no-pitch", W, "`{s}` needs a pitch: add `note(…)` or `n(…).scale(…)`."],
  ["code.unknown-chord", E, '"{sym}" isn\'t a Strudel chord name. Write "{suggest}".'],
  ["code.lowercase-chord-root", E, 'Chord roots are capitals: "{suggest}".'],
  [
    "code.locked-tool",
    { graded: E, studio: I, content: E },
    "`{tool}` unlocks in {lesson}. For now, use the tools you have.",
  ],
  // The lint reports a sound as `{name}` with a `{reason}` ("unlocks in U03.L02", or why a bank is unknown).
  ["code.locked-sound", { graded: E, studio: I, content: E }, 'The sound "{name}" {reason}.'],
  ["code.locked-scale", { graded: E, studio: I, content: E }, 'The scale "{tool}" unlocks in {lesson}.'],
  ["code.locked-chord", { graded: E, studio: I, content: E }, 'The chord "{tool}" unlocks in {lesson}.'],
  [
    "code.locked-mini",
    { graded: E, studio: I, content: E },
    "The mini-notation `{tool}` unlocks in {lesson}.",
  ],
  ["code.preview-tool", I, "`{tool}` is only being previewed here."],
  ["code.uncatalogued", { graded: W, studio: W, content: E }, "`{name}` is not in Oak's toolbox{why}."],
  [
    "code.dollar-label",
    { graded: I, studio: I, content: E },
    "`$:` works, but naming the line (`mel:`, `bass:`) lets Oak check each part.",
  ],
  ["code.label-unknown", W, "`{label}:` isn't one of the usual labels; Oak will guess its role."],
  [
    "code.label-solo-prefix",
    E,
    "`{label}:` starts with a capital S, which solos the line. Use a lower-case name.",
  ],
  [
    "code.muted-label",
    I,
    "`{label}:` is muted in the code (the `_`), so the checker doesn't hear it either.",
  ],
  ["code.chord-not-in-dict", E, '"{sym}" {problem} in the `{dict}` dictionary. {fix}'],
  ["code.slash-chord", E, 'No `/` inside `chord("…")`: put the bass note in the `bass:` track.'],
  ["code.scale-no-octave", W, '"{scale}" has no octave, so it plays in octave 3. Write "{suggest}".'],
  ["code.scale-spaces", E, 'Scale names use colons, not spaces: write "{suggest}".'],
  [
    "code.chromatic-step",
    W,
    '"{step}" is step {n} with an accidental: the number is the 0-based step, not the degree (♯4 in major is "3#").',
  ],
  ["code.mode-above", E, '`mode("above")` isn\'t used in Oak; use `below`, `root:<note>` or `duck`.'],
  [
    "code.transpose-after-scale",
    W,
    'A key change by `.transpose()` confuses the degrees; use a patterned `.scale("<…>")` instead.',
  ],
  ["code.add-on-control", E, '`.add("…")` with a bare string doesn\'t work here; write `.add(n("…"))`.'],
  [
    "code.nudge-studio-only",
    { graded: E, studio: I, content: E },
    "`nudge` only works in the Studio; use `.late()` here.",
  ],
  [
    "code.swing-convention",
    W,
    "`{fn}(…, {got})`: the second number is the beats per bar ({beats} here), or {double} for 16ths.",
  ],
  [
    "code.swing-fraction-string",
    E,
    'Inside a pattern string write the amount as a decimal (`.33`), not "1/3".',
  ],
  ["code.setcpm-missing", W, "{detail}: start with a tempo line like `setcpm({example})`."],
  ["code.setcpm-form", W, "Tempo line: {detail}."],
  [
    "code.range-spacing",
    E,
    'Strudel reads "{text}" as one word, not a range. Put a space on each side of the dots: "{suggest}".',
  ],
  [
    "code.time-fraction-string",
    E,
    '`.{fn}("{text}")` doesn\'t shift anything; write `.{fn}({text})` without quotes.',
  ],
  [
    "code.arranged-scale-pattern",
    W,
    'A patterned `.scale("<…>")` inside a section restarts with the section; put the key plan after `arrange()`.',
  ],
  ["code.locked-fn", E, "`{fn}()` unlocks in {lesson}. For now use {alt}."],
  ["code.must-use", E, "Use {tool} here."],
  ["code.must-not-use", E, "Solve this without {tool}: {why}"],
  ["code.must-call", E, "Use `{fn}()` here."],
  ["code.must-not-call", E, "Solve this without `{fn}()`: {why}"],
  ["code.arg-mismatch", E, "`{fn}({got})`: this needs {expected}."],
  ["code.mini-uses", E, "Use {opName} (`{op}`)."],
  ["code.mini-avoids", W, "Try it without {opName}."],
  ["code.no-note-names", E, "Write degree numbers here, not note names like `{text}`."],
  ["code.no-randomness", E, "`{fn}` makes this uncheckable. Remove it for this exercise."],
  ["code.unchanged", I, "Nothing changed yet. Edit the highlighted part and Check again."],
  ["code.edit-outside", E, "Only the highlighted part should change."],
  ["code.too-many-changes", W, "You changed {n} tokens; {max} is enough."],
  ["code.labels", E, "Use {min} labeled parts (`name: …`), one per instrument."],
  ["code.tempo", W, "Tempo is {got} BPM; the brief says {expected}: `setcpm({expected}/{beats})`."],
  ["code.tempo-factor", W, "That is {got} BPM: divide by the beats per bar, `setcpm({expected}/{beats})`."],
  ["code.max-chars", W, "That's {n} characters; keep it under {max}."],
  ["code.octave-default", I, '"{note}" has no octave, so it plays in octave 3. Did you mean "{suggest}"?'],
  [
    "code.letter-accidental",
    I,
    '"{note}" plays the right note; Oak writes sharps and flats as # and b: "{suggest}".',
  ],
  ["lint.strict.computed-member", E, "Computed member access isn't allowed in code Oak runs for you."],
  ["lint.strict.this", E, "`this` isn't allowed in code Oak runs for you."],
  ["lint.strict.reserved-string", E, "That string isn't allowed in code Oak runs for you."],
  ["lint.strict.construct", E, "That construct isn't allowed in code Oak runs for you."],
  // --- rhythm
  ["rhythm.missing", E, "Bar {bar}, {beatLabel}: missing hit{role}."],
  ["rhythm.extra", E, "Bar {bar}, {beatLabel}: extra hit{role}."],
  ["rhythm.displaced", W, "Right rhythm, shifted {shiftLabel}. Check where it starts."],
  ["rhythm.subdivision", W, "Your notes move in {got}; this rhythm moves in {expected}."],
  ["rhythm.duration", W, "Bar {bar}, {beatLabel}: {got} long, should be {expected}."],
  ["rhythm.period", W, "Yours repeats every {got} bar(s); the target repeats every {expected}."],
  ["rhythm.role-missing", E, "No {role} part found."],
  ["rhythm.swing-missing", W, "Right rhythm, but {got} where the target is {expected}."],
  [
    "rhythm.pickup-missing",
    W,
    "The phrase starts on the downbeat; it should start with a pickup of {units} beat(s).",
  ],
  // --- melody
  [
    "melody.wrong-degree",
    E,
    "Bar {bar}, {beatLabel}: you have {got} ({gotSyl}); the melody has {exp} ({expSyl}).",
  ],
  ["melody.octave", W, "Bar {bar}, {beatLabel}: right note, an octave {dir}."],
  [
    "melody.index-shift",
    E,
    "Every note is one step {dir}. `n` counts from 0, so degree {deg} is `n({idx})`.",
  ],
  ["melody.transposed", I, "Right tune, but in {gotKey}, not {expKey}."],
  ["melody.missing-note", E, "Bar {bar}, {beatLabel}: note {exp} missing."],
  ["melody.extra-note", E, "Bar {bar}, {beatLabel}: extra note {got}."],
  ["melody.contour-right", I, "The ups and downs are right; check how big each step is."],
  ["melody.rhythm-only", I, "All pitches right; the rhythm differs at the marks."],
  ["melody.ends-on", E, "It ends on {got}; the brief asks for {expected}."],
  ["melody.no-line", E, "No melody line found{track}."],
  // by-ear transcription (Wave 3, DictationEx.byEar)
  ["melody.first-difference", I, "The first difference is in bar {bar}, {beatLabel}: {what}."],
  [
    "melody.rhythm-note",
    W,
    "Bar {bar}, {beatLabel}: {got} is the right note, but it starts at {expAt} in the source.",
  ],
  ["melody.pitch-only", I, "The rhythm is right throughout; only the pitches at the marks differ."],
  [
    "melody.wrong-key",
    E,
    "Right tune, but in {gotKey}. This step wants it as it plays, in {expKey}: move every note {semis} {dir}.",
  ],
  [
    "melody.wrong-octave",
    E,
    "Right notes, an octave {dir} than the source. This step wants the octave you hear.",
  ],
  // --- harmony
  ["harmony.bass", E, "Chord {slot} (bar {bar}): bass is {got}; you should hear {exp}."],
  ["harmony.root", E, "Chord {slot}: root {got}, expected {exp}."],
  ["harmony.quality", E, "Chord {slot}: right root ({root}), but {exp}, not {got}."],
  ["harmony.inversion", W, "Chord {slot}: right chord, but the bass should be its {member}."],
  ["harmony.rn-case", W, "Chord {slot}: {got} → {exp}. Upper case = major, lower = minor."],
  ["harmony.rn", E, "Chord {slot}: {got}, expected {exp}."],
  ["harmony.missing-chord", E, "Bar {bar}, {beatLabel}: a chord change is missing."],
  ["harmony.extra-chord", W, "Bar {bar}, {beatLabel}: no change here."],
  ["harmony.schema-rotation", I, "Right loop ({schema}), but it starts on a different chord."],
  ["harmony.not-in-key", W, "{chord} isn't in {key}. Intended?"],
  ["harmony.pcset", E, "Bar {bar}, {beatLabel}: the chord has {got}; it should have {exp}."],
  ["harmony.no-chords", E, "No chords found{track}."],
  // --- spelling, key signatures
  ["spell.enharmonic", E, "{got} sounds right, but in {context} it's spelled {exp}."],
  ["spell.wrong", E, "{got} → {exp}."],
  ["spell.order", W, "Right notes, wrong order."],
  ["keysig.wrong", E, "{key} has {exp}; you wrote {got}."],
  ["keysig.count", E, "{key} has {n} {kind}: {exp}. You wrote {count}."],
  [
    "keysig.type",
    E,
    "{key} is a {expKind} key: its signature is {exp}. Sharps and flats never mix in a key signature.",
  ],
  [
    "keysig.order",
    E,
    "Right {kind}, written in another order. A signature always reads {order}: here {exp}.",
  ],
  // --- singing and tapping (graded by @oak/pitch; the text lives here)
  // `more` (from @oak/pitch) says why: too much noise around the voice, or only short blips.
  ["sing.no-voice", E, "I couldn't hear singing (input {db} dB).{more}"],
  [
    "sing.clipped",
    W,
    "The mic input is too loud: it hit full scale {n} times, which distorts the pitch. Turn the input down or sing a little further from the mic.",
  ],
  ["sing.bleed", E, "The mic hears the playback; use wired headphones."],
  ["sing.sharp", W, "Note {i} ({exp}): {cents}¢ {dir}."],
  ["sing.flat", W, "Note {i} ({exp}): {cents}¢ {dir}."],
  ["sing.wrong-note", E, "Note {i}: you sang {got}, target {exp}."],
  ["sing.missed", E, "Note {i} ({exp}) wasn't sung."],
  ["sing.octave-jump", I, "Note {i} jumped an octave."],
  ["sing.drift", I, "You drifted {cents}¢ {dir}; re-anchor on {tonicSyl}."],
  ["sing.unstable", I, "Note {i} wobbled ±{cents}¢."],
  ["sing.early", W, "Note {i}: {ms} ms {dir}."],
  ["sing.late", W, "Note {i}: {ms} ms {dir}."],
  // sung degree patterns (the grader judges the pattern; @oak/pitch judged each note)
  ["sing.wrong-degree", E, "Note {i}: you sang {got}; the pattern has {exp} here."],
  ["sing.contour-right", I, "The ups and downs are right; check how far each step goes."],
  [
    "sing.octave-folded",
    I,
    "Note {i}: right degree ({exp}), but the pattern goes {targetDir} to it and you sang it {gotDir}. Counted as right.",
  ],
  ["sing.too-short", E, "You sang {got} of {n} notes; the pattern goes on with {rest}."],
  ["tap.missed", E, "No tap for note {i} of the rhythm."],
  ["tap.extra", W, "Tap {j} was one too many."],
  ["tap.offset", I, "You're consistently {ms} ms {dir}."],
  ["tap.rushing", W, "You sped up {ms} ms over the phrase."],
  ["tap.dragging", W, "You slowed down {ms} ms over the phrase."],
  // --- answers
  ["id.wrong", E, "That was {exp}, not {got}. Listen to both."],
  ["id.partial", W, "Close: {got} is near {exp}."],
  ["id.confusion", I, "You mixed up {a} and {b} {n}×: {tip}"],
  ["id.missing", E, "Answer every slot ({n} left)."],
  [
    "id.interval-quality",
    E,
    "Right size, a {generic}, but {exp} ({expLong}), not {got}. Count the semitones: {semis}.",
  ],
  [
    "id.interval-number",
    E,
    "That was {exp} ({expLong}), not {got}. Count the letter names from the lower note, both ends included.",
  ],
  ["fill.blank-wrong", E, "Blank {blank} isn't right yet."],
  ["fill.blank-empty", E, "Fill in blank {blank}."],
  ["parsons.swap", E, "Two blocks are in the wrong order: check line {slot}."],
  ["parsons.distractor", E, "One block doesn't belong in the answer."],
  ["parsons.missing", E, "{n} block(s) are missing."],
  ["hunt.not-here", E, "The problem isn't here. Listen again and compare."],
  ["hunt.found", P, "Found it."],
  ["investigate.not-here", E, "Not that one. Listen again and compare."],
  ["investigate.wrong", E, "Not quite. Listen again and compare."],
  ["kb.wrong-note", E, "You played {got}; the answer is {exp}."],
  ["kb.missing-note", E, "{exp} is missing."],
  ["kb.extra-note", E, "{got} doesn't belong."],
  ["kb.octave", W, "Right note, wrong octave: {got} instead of {exp}."],
  ["kb.bass", E, "The lowest note should be {exp}, not {got}."],
  ["kb.order", W, "Right notes, wrong order."],
  ["staff.wrong-note", E, "Bar {bar}, {beatLabel}: {got} should be {exp}."],
  ["staff.missing-note", E, "Bar {bar}, {beatLabel}: a note is missing."],
  ["staff.extra-note", E, "Bar {bar}, {beatLabel}: one note too many."],
  ["staff.rhythm", E, "Bar {bar}, {beatLabel}: the rhythm differs."],
  [
    "staff.octave",
    E,
    "{at}: {got} is the right note, an octave too {dir}. {exp} sits seven lines and spaces {dir2}.",
  ],
  ["staff.accidental", E, "{at}: {got} should be {exp}: same line or space, different accidental{why}."],
  ["staff.enharmonic", E, "{at}: {got} sounds right, but in {key} it is written {exp}{why}."],
  ["predict.done", P, "Now listen and compare."],
  // --- form
  ["form.inconsistent-arrange", E, "The tracks disagree about the sections: {detail}."],
  ["form.section-period", W, "`{name}` repeats every {period} bars, so a {bars}-bar section cuts it off."],
  ["form.wrong", E, "The form is {got}; the brief asks for {expected}."],
  ["form.no-sections", E, "No sections found: write one `arrange()` per labelled track."],
  // --- make, rubric, pass
  ["make.beyond-brief", I, "You went past today's brief. Nice."],
  ["make.silent", E, "Nothing plays yet."],
  ["make.unchanged", E, "This is still the starter as it came. Change it to make it yours, then save."],
  ["rubric.unmet", E, "{label}: {detail}"],
  ["rubric.met", P, "{label}: done"],
  ["rubric.unknown", E, "Rule {rule} can't be checked."],
  ["pass.perfect", P, "Exactly right."],
  ["pass.close", P, "Passed. Small things to polish: {n}."],
];

/**
 * How a toolbox entry reads in a message: its code form from the toolbox (`ToolEntry.code`) when the caller
 * has the toolbox, in backticks when it is code (`.transpose("3M")`, `,`) and as written when it is a
 * description ("negative and ≥7 n"); without the toolbox, the last part of the ID in backticks. Never the
 * raw ID ("tb.mini.stack").
 */
export function toolText(id: string, toolCode?: (id: string) => string | null): string {
  const code = toolCode?.(id)?.trim();
  if (!code) return `\`${id.split(".").pop() ?? id}\``;
  return /\s/.test(code) && !/^[.\w$]+\(.*\)$/.test(code) ? code : `\`${code}\``;
}

/** The registry of feedback codes. Source of truth for which `FeedbackId`s exist. */
export const FEEDBACK_CATALOG: Readonly<Record<string, FeedbackTemplate>> = Object.freeze(
  Object.fromEntries(entries.map(([id, severity, template]) => [id, { id, severity, template }])),
);

/** The catalog severity for a profile (`graded` unless said otherwise). */
export function catalogSeverity(id: string, profile: "graded" | "studio" | "content" = "graded"): Severity {
  const sev = FEEDBACK_CATALOG[id]?.severity;
  if (!sev) return "error";
  return typeof sev === "string" ? sev : (sev[profile] ?? sev.graded ?? "error");
}

/** A diagnostic with the catalog's severity. */
export function diag(
  id: FeedbackId,
  params: Record<string, string | number> = {},
  where?: Loc,
  dim?: Diagnostic["dim"],
): Diagnostic {
  return { id, severity: catalogSeverity(id), params, ...(dim ? { dim } : {}), ...(where ? { where } : {}) };
}

/**
 * Renders a diagnostic with its catalog template, or the exercise's override text. Slots come from
 * `params`, then from `where` (`bar`, `beat`, `beatLabel`, `track`, `slot`, `rule`, `blank`). A slot with
 * no value is dropped with its surrounding spaces. Deterministic: same input, same text.
 */
export function renderFeedback(d: Diagnostic, overrides?: Partial<Record<FeedbackId, Md>>): string {
  const template = overrides?.[d.id] ?? FEEDBACK_CATALOG[d.id]?.template ?? `${d.id}`;
  const w = d.where ?? {};
  const slots: Record<string, string | number | undefined> = {
    bar: w.bar === 0 ? "pickup" : w.bar,
    beat: w.beat,
    beatLabel: w.beatLabel,
    track: w.track,
    slot: w.slot,
    rule: w.rule,
    blank: w.blank,
    ...d.params,
  };
  let text = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = slots[k];
    return v === undefined || v === null ? "\uE000" : String(v);
  });
  // "Bar pickup, 3:" reads as "Pickup, 3:".
  text = text.replace(/^Bar pickup/, "Pickup").replace(/\(bar pickup\)/, "(pickup)");
  return text
    .replace(/\s*\(\uE000\)/g, "")
    .replace(/ ?\uE000/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Slots a template may leave out by design (the text reads whole without them): an optional suffix such as
 * `{role}` (" (kick)"), `{why}` or `{more}`. Every other slot must be filled by the diagnostic.
 */
export const OPTIONAL_SLOTS: Readonly<Record<string, readonly string[]>> = {
  "rhythm.missing": ["role"],
  "rhythm.extra": ["role"],
  "melody.no-line": ["track"],
  "harmony.no-chords": ["track"],
  "code.uncatalogued": ["why"],
  "staff.accidental": ["why"],
  "staff.enharmonic": ["why"],
  "sing.no-voice": ["more"],
};

/**
 * The template slots a diagnostic leaves empty (neither `params` nor `where` fills them), minus the
 * entry's optional ones: a non-empty result renders as a sentence with a hole ('"" has no octave').
 */
export function unfilledSlots(d: Diagnostic, overrides?: Partial<Record<FeedbackId, Md>>): string[] {
  const template = overrides?.[d.id] ?? FEEDBACK_CATALOG[d.id]?.template ?? "";
  const w = d.where ?? {};
  const have: Record<string, unknown> = {
    bar: w.bar,
    beat: w.beat,
    beatLabel: w.beatLabel,
    track: w.track,
    slot: w.slot,
    rule: w.rule,
    blank: w.blank,
    ...d.params,
  };
  const optional = new Set(OPTIONAL_SLOTS[d.id] ?? []);
  const out = new Set<string>();
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const k = m[1] as string;
    if (!optional.has(k) && (have[k] === undefined || have[k] === null)) out.add(k);
  }
  return [...out];
}

const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2, praise: 3 };
/** Sorted: severity, bar, beat (contracts §5.7); stable otherwise. */
export function sortDiagnostics(ds: readonly Diagnostic[]): Diagnostic[] {
  return ds
    .map((d, i) => ({ d, i }))
    .sort(
      (a, b) =>
        SEV_ORDER[a.d.severity] - SEV_ORDER[b.d.severity] ||
        (a.d.where?.bar ?? Number.POSITIVE_INFINITY) - (b.d.where?.bar ?? Number.POSITIVE_INFINITY) ||
        (a.d.where?.beat ?? Number.POSITIVE_INFINITY) - (b.d.where?.beat ?? Number.POSITIVE_INFINITY) ||
        a.i - b.i,
    )
    .map((x) => x.d);
}

/** The rendered top three messages, plus an "n more" line (contracts §5.7). */
export function messagesOf(
  ds: readonly Diagnostic[],
  overrides?: Partial<Record<FeedbackId, Md>>,
  max = 3,
): GradeResult["messages"] {
  const sorted = sortDiagnostics(ds);
  const out: GradeResult["messages"] = sorted
    .slice(0, max)
    .map((d) => ({ id: d.id, text: renderFeedback(d, overrides), ...(d.where ? { where: d.where } : {}) }));
  if (sorted.length > max) {
    const rest = sorted.length - max;
    const first = sorted[max] as Diagnostic;
    out.push({ id: first.id, text: `${rest} more` });
  }
  return out;
}

/** Whether every code a list of diagnostics uses is registered. */
export function unknownCodes(ds: readonly Diagnostic[]): string[] {
  return [...new Set(ds.map((d) => d.id).filter((id) => !(id in FEEDBACK_CATALOG)))];
}

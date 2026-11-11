```ts
ange[] }
export interface CodeMakeEx extends ExBase<'code-make'> { code: CodeSpec; bars: [min: number, max: number]; rubric: RubricRule[]; saveAs: 'sketch' }
export interface IdentifyEx extends ExBase<'identify'> { stimulus: Stimulus; cue: Cue; answer: AnswerUi; correct: Answer; partial?: PartialMap }
export interface FactEx extends ExBase<'fact'> { stimulus?: Stimulus; answer: AnswerUi; correct: Answer; spelling: 'strict'|'enharmonic'; order: 'sequence'|'set' }
export interface KeyboardEx extends ExBase<'keyboard'> { answer: Extract<AnswerUi, { ui: 'keyboard' }>; expect: { midi?: number[]; pcs?: number[]; bassPc?: number; sequence?: number[] }; pitchMode: PitchMode }
export interface StaffReadEx extends ExBase<'staff-read'> { source: string; bars: number; answer: AnswerUi; correct?: Answer; reference?: Reference; matcher?: Matcher }
export interface StaffWriteEx extends ExBase<'staff-write'> { answer: Extract<AnswerUi, { ui: 'staff-input' }>; expect: StaffExpect }
export type StaffExpect =
  | { e: 'pitches'; spelled: string[]; order: 'sequence'|'set'; withOctave: boolean }
  | { e: 'rhythm'; reference: Reference }
  | { e: 'key-signature'; key: KeySpec }
  | { e: 'events'; reference: Reference; matcher: Matcher };
export interface TapEx extends ExBase<'tap'> { mode: 'along'|'echo'|'read'; stimulus: Stimulus; cue: Cue; bars: number; target: 'beat' | { track?: TrackRef; drum?: DrumRole[] }; tol: TapTolerance }
export type SingMode = 'pitch'|'degree'|'resolution'|'echo'|'sight'|'bassline';
export interface SingEx extends ExBase<'sing'> { mode: SingMode; stimulus: Stimulus; cue: Cue; target: SingTarget; tol: SingTolerance; showTrace: 'live'|'after'|'never' }
export type SingTarget =
  | { from: 'stimulus'; track?: TrackRef }
  | { from: 'degrees'; degrees: Degree[]; rhythm?: string /* mini, default one per beat */ }
  | { from: 'reference'; reference: Reference; track: TrackRef };
export type DictationStage = 'tonic'|'bass'|'quality'|'rn'|'rhythm'|'pitch';
export interface DictationEx extends ExBase<'dictation'> {
  domain: 'rhythm'|'melody'|'bass'|'harmony'; stimulus: Stimulus; cue: Cue; answer: AnswerUi;
  stages?: DictationStage[]; stageWeights?: number[];
  reference: Reference; matcher: Matcher;
  given?: { rhythm?: boolean; firstNote?: boolean; harmonicRhythm?: boolean };
}
export interface TranscribeStepEx extends ExBase<'transcribe-step'> {
  projectId: string; ladder: 1|2|3|4|5|6|7|8; stimulus: Stimulus; layer: Layer|'form'; bars: [number, number];
  grading: { mode: 'auto'; reference: Reference; matcher: Matcher } | { mode: 'self'; checklist: { id: string; label: Md }[] };
  studio: { minRate: number; transposeSemis?: boolean; overlay: boolean };
}
export interface ComposeBriefEx extends ExBase<'compose-brief'> {
  brief: Md; flavors?: ('pop'|'rock'|'indie'|'jazz'|'soul'|'funk')[]; code: CodeSpec; rubric: RubricRule[];
  minDurationSec?: number; album?: { slot: string }; review: { tutor: 'auto'|'offer'; effort: 'high'|'medium' };
}
export interface ListenEx extends ExBase<'listen'> { items: { code: string; caption: Md; bars: number }[] }

export type Exercise = PredictEx|RunInvestigateEx|CodeModifyEx|CodeFillEx|ParsonsEx|ErrorHuntEx|CodeMakeEx
  |IdentifyEx|FactEx|KeyboardEx|StaffReadEx|StaffWriteEx|TapEx|SingEx|DictationEx|TranscribeStepEx|ComposeBriefEx|ListenEx;

// ---------- tests ----------
export type TestResponse =
  | { code: string } | { blanks: Record<string, string> } | { order: string[] }
  | { answer: Answer } | { taps: number[] /* sec rel. to stimulus start */ }
  | { pitchFixture: string /* tests/fixtures/sing/*.json frames */ } | { staff: string /* note-list DSL 'C4:4 D4:8 …' */ }
  | { click: CodeRange | string };
export interface TestCase { name: string; response: TestResponse; expect: 'pass'|'fail'|'error'; score?: [number, number]; feedback?: FeedbackId[] }
```

### 2.3 Normalized event and result types (`src/grader/types.ts`)
```ts
export type PitchSource = 'note-str'|'note-num'|'freq'|'n-scale'|'voicing'|'n-index'|'none';
export interface NEvent {
  id: string;                 // `${track}:${i}`, i = index after sort (onset, midi)
  track: string;              // '.p' label ('melody', '$0', …) or 'main'
  onset: Rat; dur: Rat;       // from hap.whole (hasOnset only)
  clipDur?: Rat;              // after clip/legato (staccato lessons)
  midi: number | null; cents?: number; pitchSource: PitchSource;
  written?: string;           // literal note string from code (display only)
  chordSymbol?: string;       // chord() value or grader voicing shim tag _oakChord
  drum?: DrumRole; s?: string; bank?: string; sampleN?: number;
  gain: number;               // (gain ?? .8)·(velocity ?? 1)·(postgain ?? 1)
  scaleCtx?: string;          // hap.context.scale
  locs: CodeRange[];          // hap.context.locations
}
export type Dimension = 'pitch'|'rhythm'|'duration'|'contour'|'bass'|'root'|'quality'|'rn'|'inversion'
  |'harmonicRhythm'|'cents'|'timing'|'coverage'|'locate'|'fix'|'order'|'choice'|'spelling'|'constraints'|'rubric'|'stage';
export interface DimScore { score: number; weight: number; n?: number }
export interface Loc {
  code?: CodeRange[]; bar?: number; beat?: number; beatLabel?: string; track?: string;
  noteIds?: string[]; slot?: number; tSec?: number; blank?: string; rule?: string; trial?: number;
}
export interface Diagnostic { id: FeedbackId; severity: 'error'|'warn'|'info'|'praise'; dim?: Dimension; where?: Loc; params: Record<string, string | number> }
export interface GradeResult {
  exerciseId: string; exerciseVersion: number; attemptNo: number; firstAttempt: boolean;
  status: 'pass'|'fail'|'error'|'ungraded';
  score: number;                       // 0..1 raw composite
  adjustedScore: number;               // after assist multiplier (§1.2) = evidence value
  dims: Partial<Record<Dimension, DimScore>>;
  constraints: { id: string; ok: boolean; diag?: Diagnostic }[];
  rubric?: { ruleId: string; required: boolean; ok: boolean; value?: number; target?: number; diag?: Diagnostic }[];
  diagnostics: Diagnostic[];           // sorted: severity, bar, beat
  messages: { id: FeedbackId; text: string; where?: Loc }[];   // rendered top 3 (+ "n more")
  assist: { hints: number; tutorHints: number; extraReplays: number; revealed: boolean };
  modality?: 'normal'|'fallback';
  eval?: { ms: number; cps: number; bpm: number; bars: number; tracks: string[]; logs: { level: 'error'|'warn'|'log'; text: string }[]; truncated: boolean };
  analysis?: AnalysisSummary;          // compose/transcribe only
  overlay?: { answer: { id: string; ok: boolean }[]; missing: NEvent[] };   // roll/staff red-green
}
export interface AnalysisSummary {
  key: { key: KeySpec; r: number }[]; bpm: number; bars: number; durationSec: number;
  roles: Partial<Record<Layer, string>>; slots: { bar: number; beat: number; symbol: string; rn: string }[];
  schemas: { schema: string; bars: [number, number] }[]; cadences: { bar: number; type: CadenceType }[];
  form: string; energy: number[]; devices: string[];   // e.g. 'V/vi→vi bar 6', 'bVII borrowed bar 12'
}
export type CadenceType = 'PAC'|'IAC'|'HC'|'PC'|'DC'|'bVII-I'|'none';
```

### 2.4 Rubric rules (`src/grader/rubric/rules.ts`)
```ts
export type RubricRule = { id: string; label: Md; required: boolean; skills: SkillId[] } & (
  | { rule: 'bars'; min?: number; max?: number }
  | { rule: 'duration-sec'; min: number }
  | { rule: 'tempo-bpm'; min?: number; max?: number }
  | { rule: 'tracks'; min: number; roles?: Layer[] }
  | { rule: 'in-key'; key: KeySpec | 'declared'; minRatio: number; tracks?: TrackRef[] }
  | { rule: 'ends-on-degree'; degrees: Degree[]; track: TrackRef }
  | { rule: 'cadence'; types: CadenceType[]; at: 'last' | 'phrase-ends' | { bar: number } }
  | { rule: 'chord-tones-strong'; minRatio: number; melody: TrackRef; harmony: TrackRef; strength: 'downbeat'|'strong'|'beat' }
  | { rule: 'progression'; schema?: string; rn?: string[]; allowRotation?: boolean; track?: TrackRef }
  | { rule: 'contains-rn'; rn: string[]; min: number; mustResolve?: boolean }   // e.g. ['V/V','V/vi','V/ii','V/IV']
  | { rule: 'range'; track: TrackRef; maxSpan?: number; within?: [string, string] | 'learner-voice' }
  | { rule: 'step-ratio'; track: TrackRef; min: number }
  | { rule: 'motif-repetition'; track: TrackRef; len: number; minRepeats: number; transposed?: boolean }
  | { rule: 'harmonic-rhythm'; changesPerBar: [number, number] }
  | { rule: 'groove-lock'; kick: TrackRef; bass: TrackRef; min: number }
  | { rule: 'swing'; track: TrackRef; ratio: [number, number] }
  | { rule: 'syncopation'; track: TrackRef; min: number }
  | { rule: 'form'; pattern: string; phraseBars?: number }                     // 'AABA', 'A?BAB' (? = any)
  | { rule: 'section-contrast'; a: [number, number]; b: [number, number]; minDelta: number }
  | { rule: 'voice-leading'; track: TrackRef; maxMovePerVoice: number; maxTotal?: number }
  | { rule: 'guide-tones'; track: TrackRef; harmony: TrackRef; minRatio: number }
  | { rule: 'modulation'; to: 'up-step'|'up-half'|'relative'|'dominant'|KeySpec; atBar?: number }
  | { rule: 'mode'; tonic: string; mode: ScaleMode; requireCharacteristic: boolean }
  | { rule: 'blues-form'; variant: 'standard'|'quick-change'|'jazz' }
  | { rule: 'euclid'; track: TrackRef; k: number; n: number; rotationFree: boolean }
  | { rule: 'clave'; track: TrackRef; type: 'son'|'rumba'; direction: '3-2'|'2-3' }
  | { rule: 'polyrhythm'; a: TrackRef; b: TrackRef; ratio: [number, number] }
  | { rule: 'register-separation'; low: TrackRef; high: TrackRef; minGapSemis: number }
  | { rule: 'no-muddy-low'; track: TrackRef }
  | { rule: 'uses'; ast: AstConstraint }
  | { rule: 'custom'; fn: string; params?: Record<string, unknown> } );       // registered in rubric/rules.ts
```
Rule evaluation returns `{ok, value, target}`. Numeric rules give partial credit `min(1, value/target)`. `required` is all-or-nothing for pass.

### 2.5 Authored examples (lesson files)
```ts
// content/lessons/u03/u03.03-degrees.ts (excerpt)
{
  kind: 'code-modify', id: 'end-on-home', version: 1, role: 'check',
  prompt: 'This tune stops on degree 2 and sounds unfinished. Change **one number** so it ends on degree 1 (remember: `n` = degree − 1).',
  skills: [{ skill: 'deg.major.tonic', w: 1 }, { skill: 'code.scale-index', w: 1 }],
  key: { tonic: 'C', mode: 'major' }, bpm: 100,
  code: { starter: 'setcpm(100/4)\n$: n("⟪4 2 3 1 2 0 1 1⟫").scale("C4:major").s("piano")' },
  reference: { solutions: ['setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").scale("C4:major").s("piano")'], bars: 1 },
  matcher: { m: 'rubric', rules: [{ id: 'tonic', label: 'Ends on degree 1', required: true,
             skills: ['deg.major.tonic'], rule: 'ends-on-degree', degrees: ['1'], track: '*' }] },
  constraints: [{ c: 'max-changed-tokens', n: 1 }, { c: 'must-call', fn: 'scale' }],
  target: { audible: false },
  hints: [
    { id: 'h1', level: 'concept', text: 'Which `n` number is degree 1?' },
    { id: 'h2', level: 'locate', text: 'Only the last number matters.', highlight: { code: [{ from: 36, to: 37 }] } },
    { id: 'h3', level: 'bottom-out', text: 'Degree 1 is `n` 0.', patch: '…1 0")' }],
  srs: [{ family: 'deg.index', mode: 'seed' }],
  tests: [
    { name: 'ref', response: { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").scale("C4:major").s("piano")' }, expect: 'pass' },
    { name: 'octave-up tonic', response: { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 7").scale("C4:major").s("piano")' }, expect: 'pass' },
    { name: 'unchanged', response: { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 1").scale("C4:major").s("piano")' }, expect: 'fail', feedback: ['code.unchanged'] },
    { name: 'ends on 5', response: { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 4").scale("C4:major").s("piano")' }, expect: 'fail', feedback: ['melody.ends-on'] },
    { name: 'no scale', response: { code: 'setcpm(100/4)\n$: n("4 2 3 1 2 0 1 0").s("piano")' }, expect: 'fail', feedback: ['code.n-without-scale'] }],
},

// content/lessons/u06/u06.09-bass-first.ts (excerpt)
{
  kind: 'dictation', id: 'loop-1', version: 1, role: 'check', domain: 'harmony',
  prompt: 'Sing the bass, enter its degrees, then name each chord.',
  skills: [{ skill: 'har.bass-degrees.major', w: 1 }, { skill: 'har.rn.diatonic-major', w: 1 }],
  key: { tonic: 'G', mode: 'major' }, bpm: 92,
  stimulus: { src: 'code', bars: 4, loop: true, showCode: false, code:
`setcpm(92/4)
$: note("<[b3,d4,g4] [a3,d4,f#4] [b3,e4,g4] [c4,e4,g4]>").s("rhodes").gain(.5)
$: n("<0 4 5 3>").scale("G2:major").s("ebass")` },
  cue: { context: 'cadence', countInBars: 0, click: false, replays: 6 },
  stages: ['bass', 'quality', 'rn'], stageWeights: [0.4, 0.3, 0.3],
  answer: { ui: 'rn-palette', slots: 4, allow: ['triads'] },
  reference: { solutions: ['/* = stimulus code */'], bars: 4 },
  matcher: { m: 'harmony', level: 'rn', qualityDepth: 'triad', inversion: false, harmonicRhythm: 'given' },
  hints: [{ id: 'h1', level: 'concept', text: 'Sing G (do) first. Is the 2nd bass note higher or lower?' },
          { id: 'h2', level: 'partial', text: 'The bass of chord 2 is degree 5.' }],
  srs: [{ family: 'har.bass', mode: 'seed' }, { family: 'har.progression', mode: 'evidence-only' }],
  tests: [
    { name: 'right', response: { answer: { stages: { bass: ['1','5','6','4'], quality: ['maj','maj','min','maj'], rn: ['I','V','vi','IV'] } } }, expect: 'pass' },
    { name: 'ii for V', response: { answer: { stages: { bass: ['1','2','6','4'], quality: ['maj','min','min','maj'], rn: ['I','ii','vi','IV'] } } }, expect: 'fail', feedback: ['harmony.bass'] }],
}
```

### 2.6 Feedback catalog (`src/grader/feedback/catalog.ts`)
Templates are deterministic, use `{param}` interpolation, and can be overridden per exercise. Severity is shown in brackets.

| id | sev | template |
|---|---|---|
| eval.syntax | E | Line {line}: {detail}. Check brackets, commas and quotes. |
| eval.mini-parse | E | Line {line}: the pattern string can't be read ({detail}). |
| eval.timeout | E | Your code ran over {ms} ms, which usually means an endless loop or a huge pattern like `.fast(10000)`. |
| eval.too-many-events | E | That's {n} notes in {bars} bars, which is too many to check. Simplify it. |
| eval.runtime / eval.query | E | {fn} failed: {detail} |
| eval.silent | E | Nothing plays in bars 1–{bars}. |
| code.single-quoted-pattern | W | '{text}' uses single quotes, so it's plain text, not a pattern. Use "{text}". |
| code.n-without-scale | E | `n("…")` gives numbers, not pitches. Add `.scale("{key}")`, where 0 = degree 1. |
| code.bare-value | E | Values with no sound control. Use `note("…")` or `s("…")`. |
| code.no-pitch | W | `{s}` needs a pitch: add `note(…)` or `n(…).scale(…)`. |
| code.unknown-chord | E | "{sym}" isn't a Strudel chord name. Write "{suggest}" (lead sheet: {display}). |
| code.lowercase-chord-root | E | Chord roots are capitals: "{suggest}". |
| code.locked-fn | E | `{fn}()` unlocks in {lesson}. For now use {alt}. |
| code.must-call / code.must-not-call | E | Use `{fn}()` here. / Solve this without `{fn}()`: {why} |
| code.arg-mismatch | E | `{fn}({got})`: this needs {expected}. |
| code.mini-uses / code.mini-avoids | E/W | Use {opName} (`{op}`). / Try it without {opName}. |
| code.no-note-names | E | Write degree numbers here, not note names like `{text}`. |
| code.no-randomness | E | `{fn}` makes this uncheckable. Remove it for this exercise. |
| code.unchanged | I | Nothing changed yet. Edit the highlighted part and Check again. |
| code.edit-outside / code.too-many-changes | E/W | Only the highlighted part should change. / You changed {n} tokens; {max} is enough. |
| code.labels | E | Use {min} labeled parts (`name: …`), one per instrument. |
| code.tempo | W | Tempo is {got} BPM; the brief says {expected}: `setcpm({expected}/{beats})`. |
| code.octave-default | I | "{note}" has no octave, so it plays in octave 3. Did you mean "{suggest}"? |
| rhythm.missing / rhythm.extra | E | Bar {bar}, {beatLabel}: missing hit{role}. / extra hit{role}. |
| rhythm.displaced | W | Right rhythm, shifted {shiftLabel}. Check where it starts. |
| rhythm.subdivision | W | Your notes move in {got}; this rhythm moves in {expected}. |
| rhythm.duration | W | Bar {bar}, {beatLabel}: {got} long, should be {expected}. |
| rhythm.period | W | Yours repeats every {got} bar(s); the target repeats every {expected}. |
| rhythm.role-missing | E | No {role} part found. |
| melody.wrong-degree | E | Bar {bar}, {beatLabel}: you have {got} ({gotSyl}); the melody has {exp} ({expSyl}). |
| melody.octave | W | Bar {bar}, {beatLabel}: right note, an octave {dir}. |
| melody.index-shift | E | Every note is one step {dir}. `n` counts from 0, so degree {deg} is `n({idx})`. |
| melody.transposed | I | Right tune, but in {gotKey}, not {expKey}. |
| melody.missing-note / melody.extra-note | E | Bar {bar}, {beatLabel}: note {exp} missing. / extra note {got}. |
| melody.contour-right | I | The ups and downs are right; check how big each step is. |
| melody.rhythm-only | I | All pitches right; the rhythm differs at the marks. |
| melody.ends-on | E | It ends on {got}; the brief asks for {expected}. |
| harmony.bass | E | Chord {slot} (bar {bar}): bass is {got}; you should hear {exp}. |
| harmony.root / harmony.quality | E | Chord {slot}: root {got}, expected {exp}. / Right root ({root}), but {exp}, not {got}. |
| harmony.inversion | W | Chord {slot}: right chord, but the bass should be its {member}. |
| harmony.rn-case | W | Chord {slot}: {got} → {exp}. Upper case = major, lower = minor. |
| harmony.missing-chord / harmony.extra-chord | E/W | Bar {bar}, {beatLabel}: a chord change is missing. / no change here. |
| harmony.schema-rotation | I | Right loop ({schema}), but it starts on a different chord. |
| harmony.not-in-key | W | {chord} isn't in {key}. Intended? |
| spell.enharmonic / spell.wrong / spell.order | E/E/W | {got} sounds right, but in {context} it's spelled {exp}. / {got} → {exp}. / Right notes, wrong order. |
| keysig.wrong | E | {key} has {exp}; you wrote {got}. |
| sing.no-voice / sing.bleed | E | I couldn't hear singing (input {db} dB). / The mic hears the playback; use wired headphones. |
| sing.sharp / sing.flat | W | Note {i} ({exp}): {cents}¢ {dir}. |
| sing.wrong-note / sing.missed | E | Note {i}: you sang {got}, target {exp}. / Note {i} ({exp}) wasn't sung. |
| sing.octave-jump / sing.drift / sing.unstable | I | Note {i} jumped an octave. / You drifted {cents}¢ {dir}; re-anchor on {tonicSyl}. / Note {i} wobbled ±{cents}¢. |
| sing.early / sing.late | W | Note {i}: {ms} ms {dir}. |
| tap.missed / tap.extra | E/W | Bar {bar}, {beatLabel}: missed. / extra tap. |
| tap.offset / tap.rushing / tap.dragging | I/W | You're consistently {ms} ms {dir}. / You sped up (slowed down) {ms} ms over the phrase. |
| id.wrong / id.confusion | E/I | That was {exp}, not {got}. Listen to both. / You mixed up {a} and {b} {n}×: {tip} |
| fill.blank-wrong, parsons.swap, parsons.distractor, hunt.not-here, investigate.not-here | E | (blank / block / location-specific) |
| rubric.unmet / rubric.met | E/P | {label}: {detail} / {label}: done |
| pass.perfect / pass.close | P | Exactly right. / Passed; {n} small things to polish. |

---

## 3. Matcher library

### 3.1 Evaluation and normalization (`eval/headless.ts`, `normalize/*`)
```ts
export async function initRealm(): Promise<void>;
export async function evaluateForGrading(code: string, o: { bars: number; maxHaps?: number }): Promise<EvalOutput>;
export interface EvalOutput { ok: boolean; tracks: Record<string, HapJSON[]>; cps: number;
  logs: { level: string; text: string }[]; error?: { kind: 'syntax'|'mini'|'runtime'|'query'|'timeout'; message: string; line?: number; pos?: number } }
export function createGraderClient(spawn: () => Worker, o?: { timeoutMs?: number /*1500*/ }): { grade(code: string, bars: number): Promise<EvalOutput>; dispose(): void };
export function normalize(out: EvalOutput, ctx: { meter: MeterSpec; key?: KeySpec }): { byTrack: Record<string, NEvent[]>; all: NEvent[]; cps: number; bpm: number };
export function valueToMidiSafe(v: unknown, scaleCtx?: string): { midi: number | null; cents?: number; source: PitchSource };
export function drumRole(s: string, bank?: string): DrumRole | null;
export function inferRoles(byTrack: Record<string, NEvent[]>): Partial<Record<Layer, string>>;
export function simultaneities(ev: NEvent[]): { onset: Rat; dur: Rat; midis: number[]; ids: string[] }[];
export function skyline(ev: NEvent[]): NEvent[];           // highest per onset, previous truncated at next onset
export function bassline(ev: NEvent[]): NEvent[];          // lowest per onset
export function sounding(ev: NEvent[], at: Rat): NEvent[];
export function periodOf(ev: NEvent[], maxBars: number): number;
export function position(onset: Rat, meter: MeterSpec): { bar: number; beat: number; label: string };
export const R: { add; sub; mul; div; cmp; eq; floor; frac; toNum; lcdDen; fromFraction };
```

**`initRealm`.** Runs once per worker.
1. `evalScope(core, mini, tonal, stubs)` with:
   - `setcps(v)` / `setcpm(v)` capture cps (v/60 for cpm) and return `silence`;
   - `samples` = async no-op; `sliderWithID(_, v)` = `pure(v)`;
   - `all` / `each` capture their transforms; `hush` = silence.
2. Identity stubs on `Pattern.prototype`: pianoroll, punchcard, spiral, pitchwheel, wordfall, scope, tscope, fscope, spectrum, `_pianoroll`, `_punchcard`, `_scope`, `_spiral`, `_pitchwheel`, `_spectrum`, markcss, color, dough, analyze.
3. `.p` collector copied from repl.mjs: `_`-prefixed/suffixed ids are muted; ids containing `$` get an index (`$0`, `$1`); ids starting with `S` solo. The final result = solo set ∪ all, each `each` transform applied per track, then `all`. Per-track patterns are kept for per-part grading.
4. **Voicing shim (spike-verify):** wrap `Pattern.prototype.voicing` so it first does `fmap(v => typeof v === 'string' ? {chord: v, _oakChord: v} : {...v, _oakChord: v.chord})`. `voicing()` spreads unknown keys back via `.set(rest)`, so the source symbol survives on every voiced note.
5. Before each grade: `resetVoicings()`, `useRNG('legacy')`, clear the p-map and captured cps (default 0.5).

**Querying.**
- Use `pattern.query(new State(new TimeSpan(Fraction(0), Fraction(bars)), {_cps: cps}))`, not `queryArc`, so errors throw. Wrap console.* to capture `[tonal]`, `[voicing]`, `[mini]`, `[query]` lines.
- Keep only `h.whole && h.hasOnset()`. Drop continuous haps.
- Abort above `maxHaps` (20k). Bars are capped at 64.
- Serialize to JSON-safe `HapJSON` (Rats, value, locations) before `postMessage`.

**Pitch precedence (`valueToMidiSafe`):**
1. Number value → MIDI.
2. Object value:
   - numeric `freq` → `freqToMidi`, rounded, cents kept;
   - string `note` → normalize `s→#`, `f→b`, uppercase letter, default octave 3, then Strudel `noteToMidi` (never `tonal` for octave-less notes);
   - numeric `note` → as is;
   - in both note cases add `12·octave` if an `octave` key exists.
3. `n` with `scaleCtx` cannot remain (`scale()` converts it to `note`). `n` without note and without scale → `null`, source `n-index`.
4. A bare string that `isNote` → MIDI, flagged `code.bare-value`.
5. `chord` only (no voicing) → `midi null`, `chordSymbol` set.
6. `s` in the drum map → `drum` role, `midi null`. Strip the bank prefix (`RolandTR909_bd` → bd). Map: bd → kick, sd → snare, cp → clap, rim/rm → rim, hh → hatClosed, oh → hatOpen, lt/mt/ht → tom, cr → crash, rd → ride, sh → shaker, others → perc.

**Pre-eval lint (`ast/lint.ts`, acorn ecma2022):**
- Syntax errors → `eval.syntax` with `.loc`.
- Single-quoted strings passed to note/n/s/chord/struct/scale with spaces → `code.single-quoted-pattern`.
- Chord literals inside `chord(...)`: tokenize by mini separators and check each symbol against the Strudel iReal key set → `code.unknown-chord` (suggestion from the table in §3.9) or `code.lowercase-chord-root`.
- Calls to locked toolbox functions → `code.locked-fn`. This is also a CM6 lint; the grader repeats it.
- `n(...)` chains with no `.scale` and a pitched `s` → `code.n-without-scale` (pre-emptive; confirmed post-eval by source `n-index`).

**AST constraints (`ast/constraints.ts`):**
- Callee names come from `CallExpression` (Identifier or MemberExpression `.property.name`).
- Mini ops come from parsing every double-quoted/backtick literal with `@strudel/mini`'s `mini2ast` (spike-verify the export), falling back to a tokenizer regex per op.
- `max-changed-tokens` uses a token-level LCS diff between the starter and the answer.
- `edit-only-regions` diffs outside the `⟪⟫` ranges. The editor already blocks this; the grader re-checks.

### 3.2 Strudel-specific normalization pitfalls (each has a fixed grader rule)
| Pitfall | Grader rule |
|---|---|
| `n` without `.scale()` is a sample index (synths fall back to MIDI 36) | source `n-index`, midi null, `code.n-without-scale` |
| Octave-less notes default to octave 3 (`"c"` = 48); tonal returns null MIDI without an octave and rejects `s`/`f` accidentals | Strudel `noteToMidi` after s/f normalization; `code.octave-default` info when a lesson expects octave 4 |
| `voicing()` spells with flats only (D^7 → Gb) and its octave choice differs between 1.2.6 and main (mode above/root fixed on main) | grade voicings on pc-set + bass + top note only, never exact octaves or spellings; re-spell for display |
| Unknown or lowercase chord symbols, `maj7`, `dim`, `min` → silence plus a `[voicing]` log, no exception | pre-eval lint + log capture → `code.unknown-chord` |
| `queryArc` swallows errors; `scale()` silently drops bad steps | query via `pattern.query(State)`; compare hap count against mini leaf count when a `.scale` step error is logged |
| Fragments: `slow`, `<>` with `@`, `/n` → `part ≠ whole` | count `hasOnset()` haps only; onset/dur from `whole`; notation splits at barlines, grading does not |
| Continuous signals (sine, rand without struct) have no whole | discard; `code.no-randomness` where constrained |
| `octave` control shifts playback but not `note` | +12·octave |
| `freq` → fractional MIDI | round; keep cents for tuning lessons |
| Numeric transpose on note strings picks `Interval.fromSemitones` spellings (Fb, Bbb) | ignore code spellings |
| `$:` labels need `.p`; the unlabeled last expression is ignored once labels exist; `_x` mutes; `S$` solos | own collector; `code.labels` diagnostics; graded tracks per `Reference.tracks` |
| `setcpm` is global; `.cpm()` is a relative speed-up; a per-hap `cps` control changes tempo | capture stubs; grading is in cycles; `code.tempo` only via constraint/rule |
| `setcpm(120)` instead of `setcpm(120/4)` | tempo rule detects ×beats ratio and suggests the fix |
| `rootNotes(oct)` drops other keys; `voicing()` with `n` returns numeric notes | handled by precedence (numeric note) |
| `.bank(b)` produces `${b}_${s}` | strip known bank prefixes for drum roles |
| `clip`/`legato` alter hap.duration | `dur` from whole; `clipDur` stored separately |
| Pattern periods differ (`<C Am F G>` = 4 bars) | query `max(refBars, periodOf(answer) ≤ 16)`; `rhythm.period` when periods differ |
| Random functions are seeded and stable within a version, but brittle across upgrades | forbid in graded exact-match exercises; rubric rules allowed |
| iReal symbol dialect (`^`, `-`, `h`, `o`, `+`) vs lead sheet vs abcjs display vs tonal | one parser `parseChordSymbol` → `ChordId` (§3.9) |
| `.scale("C:major")` tonic defaults to octave 3 | lessons teach `"C4:major"`; grading is unaffected (key-relative) |

### 3.3 Rhythm and meter (`match/rhythm.ts`, `analyze/{syncopation,swing,groove,euclid,meter}.ts`)
```ts
export function onsets(ev: NEvent[], o?: { role?: DrumRole; dedupe?: boolean }): Rat[];
export function matchOnsets(t: Rat[], a: Rat[], tol: Rat): { pairs: [number, number][]; missing: number[]; extra: number[] };
export function rhythmScore(t: NEvent[], a: NEvent[], cfg: Extract<Matcher, { m: 'rhythm' }>, meter: MeterSpec): MatchResult;
export function bestDisplacement(t: Rat[], a: Rat[], period: Rat, grid: Rat): { shift: Rat; f1: number };
export function finestGrid(onsets: Rat[], meter: MeterSpec): Rat;
export function metricWeights(meter: MeterSpec, grid: Rat): number[];
export function syncopation(ev: NEvent[], meter: MeterSpec): { total: number; perBar: number[] };
export function swingRatio(ev: NEvent[], meter: MeterSpec): { ratio: number; x: number; n: number; cls: 'straight'|'light'|'triplet'|'hard' };
export function grooveLock(kick: Rat[], bass: Rat[], tol: Rat): { lock: number; coverage: number; anticipations: Rat[] };
export function euclidMatch(on: Rat[], k: number, n: number, period: Rat): { ok: boolean; rotation?: number };
export function claveType(on: Rat[]): { type: 'son'|'rumba'|'tresillo'|'cinquillo'|'none'; direction?: '3-2'|'2-3' };
export function oddGrouping(ev: NEvent[], meter: MeterSpec): number[];
export function polyRatio(a: Rat[], b: Rat[], period: Rat): [number, number] | null;
export interface MatchResult { score: number; dims: Partial<Record<Dimension, DimScore>>; diagnostics: Diagnostic[]; overlay?: GradeResult['overlay'] }
```

**`matchOnsets`.** With `tol = 0`, matching is exact rational set intersection (`n1·d2 === n2·d1`). Otherwise it uses a two-pointer greedy, which gives maximum cardinality for uniform windows.

**`rhythmScore`.**
1. Onsets are deduplicated per role, or per track for pitched lines.
2. `perRole` scores F1 over the union of roles (T ∪ A), weighted by `max(|T_r|, |A_r|)`. A role absent from the target therefore scores 0 with its own weight, which penalizes extra parts.
3. Durations, for monophonic pitched lines only: effective duration = `min(dur, nextOnset − onset)`; `durAcc` = exact-equal share of matched pairs. `score = F1·(durations ? 0.8 + 0.2·durAcc : 1)`.
4. If F1 < 1: run `bestDisplacement` over shifts `k·grid` (k = ±1..gridPerBar−1, circular over the period). If some shift gives F1 = 1, emit `rhythm.displaced` and set `score = max(score, displacementCredit·1)` (default 0.5).
5. Subdivision mismatch: if the target grid is a triplet and the answer grid binary (or vice versa) → `rhythm.subdivision`.

**`metricWeights`.** Longuet-Higgins and Lee. In 4/4 on a 16th grid: beat 1 = 0, beat 3 = −1, beats 2/4 = −2, 8th off-beats = −3, 16ths = −4. Compound and odd meters derive weights from the grouping.

**`syncopation`.** For each note at weight `wn` followed by a rest or tie at the next stronger position with `wr > wn`, add `wr − wn`.

**`swingRatio`.** For each beat with an onset at the beat start and exactly one inside it, at fraction p of the beat: `ratio = p/(1−p)`; take the median. Then `x = (r−1)/(r+1)`, the Strudel `swingBy` amount (with `swingBy(x, beatsPerBar)` the off-beat sits at `(1+x)/2`). Classes: straight < 1.2 ≤ light < 1.6 ≤ triplet < 2.4 ≤ hard.

**`grooveLock`.**
- `lock` = share of bass onsets within tol of a kick.
- `coverage` = share of kicks with a bass onset.
- `anticipations` = bass onsets one grid step before a kick that has no bass onset.

**`claveType`.** Positions on a 2-bar 8th grid (16 positions):
- son 3-2 {0,3,6,10,12}; rumba 3-2 {0,3,7,10,12};
- son 2-3 {2,4,8,11,14}; rumba 2-3 {2,4,8,11,15};
- tresillo = E(3,8) {0,3,6} per bar; cinquillo = E(5,8) {0,2,3,5,6}.

**`oddGrouping`.** Group starts = onsets with gain ≥ 0.9·max or kick onsets; grouping = successive differences on the eighth grid from the downbeat.

**`polyRatio`.** Per track, evenly spaced onset counts per period (spacing variance 0) → `[a, b]`.

### 3.4 Melody (`match/melody.ts`, `analyze/melodyrules.ts`)
```ts
export interface Note { id: string; midi: number; onset: Rat; dur: Rat }
export function melodyLine(ev: NEvent[], track?: TrackRef): Note[];                 // skyline of the track
export function bestTransposition(t: Note[], a: Note[]): number;
export function alignMelody(t: Note[], a: Note[], cfg: Extract<Matcher, { m: 'melody' }>, key?: KeySpec): MatchResult;
export function parsons(n: Note[], threshCents?: number): string;                   // 'u'|'d'|'r'
export function contourScore(t: string, a: string): number;                         // 1 − lev/maxLen
export function degreeOf(midi: number, key: KeySpec): { deg: Degree; syl: string; step: number };
export function scaleMembership(ev: NEvent[], key: KeySpec): { ratio: number; outside: NEvent[] };
export function range(ev: NEvent[]): { low: number; high: number; span: number };
export function tessitura(ev: NEvent[], r: [number, number]): number;                // duration share inside
export function stepLeap(n: Note[]): { stepRatio: number; maxLeap: number; unrecovered: string[] };
export function endsOn(n: Note[], key: KeySpec): Degree;
export function motifs(n: Note[], len: number): { intervals: number[]; at: Rat[] }[];
export function chordToneRatio(mel: Note[], slots: ChordSlot[], meter: MeterSpec, strength: 'downbeat'|'strong'|'beat'): { ratio: number; misses: Note[] };
export type NctType = 'passing'|'neighbor'|'appoggiatura'|'suspension'|'anticipation'|'escape';
export function classifyNct(mel: Note[], slots: ChordSlot[], meter: MeterSpec): { id: string; type: NctType }[];
export function phrases(ev: NEvent[], meter: MeterSpec, phraseBars?: number): { bars: [number, number] }[];
```

**`alignMelody`.**
1. Map pitch per `PitchMode`:
   - absolute: MIDI;
   - octave-free: pc;
   - key-relative: `(midi − tonicPc_of_each_side) mod 12`, where the learner's tonic comes from `scaleCtx` or the lesson key;
   - transposition-invariant: `k* = mode(t.midi − a.midi)` over onset-equal pairs (fallback: median difference); shift A by k*; emit `melody.transposed` if k* ≢ 0 (mod 12).
2. **Pitch score.** Weighted Levenshtein over pitch order: substitution 1, octave-equivalent 0.5, insert/delete 1. `S_p = 1 − d/max(|T|,|A|)`.
3. **Rhythm score.** Onset F1 with `rhythmTol`.
4. **Joint diagnostics.** Needleman–Wunsch with cost = pitchCost + 0.5·[onset differs]. The backtrace gives per-note `melody.wrong-degree`, `melody.octave`, `melody.missing-note`, `melody.extra-note`, located at the target bar/beat (answer note ids for the overlay).
5. **Index shift.** If ≥ 70% of substitutions are exactly ±1 scale step in the key and there are no other error types → a single `melody.index-shift`, which replaces the per-note messages.
6. If `S_p < 0.8` and contour ≥ 0.8 → `melody.contour-right`. If `S_p = 1` and rhythm < 1 → `melody.rhythm-only`.
7. `score = wPitch·S_p + wRhythm·S_r`. Defaults: 0.7/0.3 when rhythm is given, 0.5/0.5 for full dictation.

**Other analyzers.**
- `chordToneRatio`: melody onsets at metric weight ≥ threshold (downbeat = beat 1; strong = 1 and 3 in 4/4, 1 and 4 in 6/8; beat = all beats). A hit is the onset's pc belonging to the chord sounding at that onset.
- `classifyNct`, rules on approach/departure intervals and metric position for a non-chord tone x:
  - passing: step in, step out, same direction;
  - neighbor: step in, step back;
  - appoggiatura: leap in, step out, strong position;
  - suspension: same pitch held from the previous chord tone, then step down, strong position;
  - anticipation: equals a chord tone of the next chord, weak position;
  - escape: step in, leap out in the opposite direction.
- `stepLeap`: a step is ≤ 2 semitones. A leap > 4 is "recovered" if the next interval is a step in the opposite direction.

### 3.5 Harmony (`match/harmony.ts`, `analyze/{chords,roman,cadence,schema,voiceleading}.ts`, `src/theory/*`)
```ts
export interface ChordId { rootPc: number; root: string; quality: ChordQuality; bassPc: number; bass?: string; ext: string[] }
export interface ChordSlot { span: [Rat, Rat]; chord: ChordId; midis: number[]; ambiguous?: ChordId[] }
export interface RomanNumeral { degree: 1|2|3|4|5|6|7; alt: -1|0|1; quality: ChordQuality; inversion: 0|1|2|3; of?: RomanNumeral /* applied: V7/V */ }
export function parseChordSymbol(sym: string): ChordId | null;     // Strudel/iReal, lead sheet, tonal, abcjs display
export function toStrudelSymbol(c: ChordId): string;  export function toLeadSheet(c: ChordId): string;  export function toAbcChord(c: ChordId): string;
export function identifyChord(midis: number[], o?: { allowRootless?: boolean; bassPc?: number }): (ChordId & { fit: number })[];
export function chordSlots(ev: NEvent[], o?: { tracks?: TrackRef[]; minDur?: Rat }): ChordSlot[];
export function romanOf(c: ChordId, key: KeySpec, next?: ChordId): RomanNumeral;
export function parseRN(rn: string, key: KeySpec): RomanNumeral | null;  export function rnToChord(rn: RomanNumeral, key: KeySpec): ChordId;
export function functionOf(rn: RomanNumeral, key: KeySpec): 'T'|'PD'|'D'|'chromatic';
export function compareSlots(t: ChordSlot[], a: ChordSlot[], cfg: Extract<Matcher, { m: 'harmony' }>, key: KeySpec): MatchResult;
export function cadenceAt(slots: ChordSlot[], mel: Note[] | null, key: KeySpec, endBar: number): CadenceType;
export function schemaMatch(rns: RomanNumeral[], lib?: Schema[]): { schema: string; rotation: number } | null;
export function voiceLeading(a: number[], b: number[]): { total: number; maxMove: number; mapping: [number, number][]; commonTones: number; parallels: ('P5'|'P8')[] };
export function guideToneLine(line: Note[], slots: ChordSlot[]): { ratio: number; maxMove: number };
export function harmonicRhythm(slots: ChordSlot[], bars: number): number[];
export function bluesForm(slots: ChordSlot[], key: KeySpec): { variant: 'standard'|'quick-change'|'jazz'|null; wrongBars: number[] };
export function lowIntervalViolations(slots: ChordSlot[]): { bar: number; low: number; interval: number }[];
```

**`chordSlots`.**
1. If events carry `chordSymbol` (from `chord()` or the voicing shim), slots come from symbol spans. The bass is the lowest sounding MIDI across all pitched tracks at slot start (so a separate bass track sets the inversion).
2. Otherwise, sweep time over sounding events and form segments where the sounding pc-set is constant. Merge equal adjacent segments; drop segments shorter than `minDur` (default 1/8 bar) as passing.
3. Identify with `identifyChord`.

**`identifyChord`.** Template match per candidate root over the interval sets:
- triads: maj {0,4,7}, min {0,3,7}, dim {0,3,6}, aug {0,4,8}, sus4 {0,5,7}, sus2 {0,2,7};
- sevenths and sixths: maj7 {+11}, 7 {+10}, m7 {0,3,7,10}, m7b5 {0,3,6,10}, dim7 {0,3,6,9}, mMaj7 {0,3,7,11}, 6 {0,4,7,9}, m6 {0,3,7,9};
- extensions add 2/5/9 semitones (9/11/13) and alterations; the 5th is optional; the root is optional when `allowRootless` and the bass comes from another track.
- Fit = Σ weights of present chord tones (3rd and 7th 1.5, root 1, 5th 0.5, extensions 0.5) − 1·(non-chord pcs).
- Tie-break: root = bass, then fewer extras, then simpler quality. Ambiguities (C6 ≡ Am7, Cm6 ≡ Aø7) are resolved by bass and kept in `ambiguous`.

**`compareSlots`.**
1. **Align.** Each target slot takes the answer slot with maximal temporal overlap; under 50% overlap → `harmony.missing-chord`. Unmatched answer changes → `harmony.extra-chord` (only when `harmonicRhythm:'graded'`).
2. **Per-slot dimensions:**
   - bass: pc equality;
   - root: pc equality;
   - quality: 1 exact; 0.5 for a same triad family with different 7th/6th (7 vs maj7 vs 6; m7 vs m6), or a same 7th type with a different triad (m7 vs m7b5); 0 otherwise; extensions ignored unless `qualityDepth:'extended'`;
   - inversion: chord member in bass (root/3rd/5th/7th).
3. **RN** is derived (correct iff the root degree vs key and the quality class match). It is reported as its own dimension but not double-counted.
4. **Default weights by `level`:**
   - bass: {bass 1};
   - root: {bass .5, root .5};
   - quality: {bass .35, root .35, quality .30};
   - rn/full: {bass .3, root .3, quality .25, inversion .15 if `inversion`, else renormalized}.
5. Overall = duration-weighted mean over target slots.
6. If the answer RN sequence is a nonzero rotation of the target → `harmony.schema-rotation`.

**`romanOf`** (own implementation; tonal's `Progression` ignores case):
- **Degree.** Diatonic degree whose pc equals the root. Else a chromatic degree with alteration relative to the major scale (major keys) or the natural minor (minor keys). In minor, `V`, `vii°` and `vii°7` from harmonic minor count as diatonic.
- **Case** from quality: upper = maj/aug/dominant; lower = min/dim/half-dim. Suffixes: `°`, `ø7`, `+`, `7`, `maj7`.
- **Figures:** 6, 64 / 65, 43, 42.
- **Applied chords:** a major or dominant chord whose root is a P5 above a diatonic degree x ≠ tonic, and which is non-diatonic as voiced (D7 in C, E/E7, A/A7, B7; C7 = V7/IV because of the dominant-7 quality) → `V(7)/x`. Flag `unresolved` if the next chord is not x.
- **Borrowed in major:** iv, bVI, bVII, bIII, ii°, v. In minor keys, `bVI` ≡ `VI`, `bVII` ≡ `VII` and `bIII` ≡ `III` are accepted on input; minor-key labels are displayed without flats (OMT convention).
- `functionOf`: T = I, vi, iii(weak); PD = ii, IV, (bVI, iv); D = V, vii°.

**`cadenceAt`.** Uses the last two slots before the phrase end (authored phrase bars, or every 4/8 bars):
- V(7) → I with both in root position and melody ending on 1 → PAC;
- V → I otherwise → IAC;
- phrase ends on V → HC;
- IV → I → PC;
- V → vi or bVI → DC;
- bVII → I → `bVII-I`.
Minor keys use the analogous V → i, iv → i.

**Schema library** (`analyze/schema.ts`; matched over cyclic rotations on degree + triad quality):

| schema | RN sequence |
|---|---|
| `axis` | I–V–vi–IV |
| `axis-vi` | vi–IV–I–V |
| `doo-wop` | I–vi–IV–V |
| `three-chord` | I–IV–V–I |
| `puff` | I–iii–IV (OMT naming) |
| `aeolian` | i–VI–III–VII |
| `andalusian` | i–VII–VI–V |
| `mixo` | I–bVII–IV–I |
| `dorian-vamp` | i7–IV7 |
| `blues12` | I7×4, IV7×2, I7×2, V7, IV7, I7, V7 |
| `blues12-qc` | quick change: IV7 in bar 2 |
| `ii-V-I` | ii7–V7–Imaj7 |
| `minor-ii-V-i` | iiø7–V7–i |
| `turnaround` | I–vi–ii–V |
| `iii-VI-ii-V` | iii7–VI7–ii7–V7 |
| `backdoor` | iv7–bVII7–I |
| `rhythm-A` | I–vi–ii–V ×2, I–I7–IV–iv, I–V–I |

**`voiceLeading`.** Pad the smaller chord by doubling its nearest tone. Minimize Σ|Δ| over bijections (≤ 6 voices, so brute force over ≤ 720 permutations). Report `maxMove`, `commonTones`, and parallel P5/P8 between outer voices (info only; no counterpoint track).

**`guideToneLine`.** At each slot change, the line note must be the chord's 3rd or 7th, and successive guide tones must move ≤ 2 semitones.

**`lowIntervalViolations`.** Flags intervals ≤ 4 semitones with the lower note < MIDI 48, P4 below 45, and P5 below 34.

### 3.6 Key, scale and mode (`analyze/key.ts`)
```ts
export function keyEstimate(ev: NEvent[], o?: { window?: [Rat, Rat] }): { key: KeySpec; r: number }[];
export function modeEstimate(ev: NEvent[], tonicPc: number): { mode: ScaleMode; characteristic: boolean; score: number }[];
export function modulations(ev: NEvent[], meter: MeterSpec, windowBars?: number): { bar: number; from: KeySpec; to: KeySpec; pivot?: ChordId }[];
```
- **`keyEstimate`.** Krumhansl–Kessler: Pearson correlation of the duration-weighted pc histogram (bass weighted ×1.5) with the 24 rotated profiles.
  - major `[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]`
  - minor `[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]`
- **`modeEstimate`.** Given a tonic (most weighted pc + final note + downbeat bass), score each of the 7 diatonic modes by coverage of the used pcs. `characteristic = true` if the mode's characteristic tone appears with ≥ 5% duration: Dorian ♮6, Mixolydian b7, Lydian #4, Phrygian b2, Aeolian b6, Locrian b5.
- **`modulations`.** 4-bar windows. A change needs 2 consecutive winning windows with a correlation margin ≥ 0.1. The pivot is the last chord diatonic to both keys.

### 3.7 Form, arrangement and sound (`analyze/{form,energy}.ts`)
```ts
export function sectionsFromAst(code: string): { label: string; bars: number }[] | null;
export function formLabels(ev: NEvent[], bars: number, phraseBars?: number, thresh?: number): string;
export function energyCurve(byTrack: Record<string, NEvent[]>, bars: number): number[];
export function sectionContrast(curve: number[], a: [number, number], b: [number, number]): number;
export function registerSeparation(low: NEvent[], high: NEvent[]): { gap: number; overlapRatio: number };
export function durationSec(bars: number, cps: number): number;          // bars / cps
```
- **`sectionsFromAst`.** Reads `arrange([n, ident], …)` and `"<verse chorus>"`-style slowcats of identifiers, using identifier names as labels.
- **`formLabels`.** Per-bar features: 12-pc duration histogram, 16-step onset occupancy, active-track bitmask, mean register. Phrase vector = mean over `phraseBars` (default 4). Greedy labeling: a phrase gets an existing label if cosine ≥ 0.85, else the next letter → e.g. "AABA".
- **`energyCurve`.** `E_b = 0.4·norm(onsets) + 0.3·norm(activeTracks) + 0.2·norm(mean gain) + 0.1·norm(register span)`; contrast = |mean_A − mean_B|.

### 3.8 Performance graders (`perf/*.ts`)
```ts
export interface PitchFrame { t: number; hz: number; clarity: number; rms: number }   // worklet: 2048 window, 512 hop
export interface SungNote { start: number; end: number; midi: number; centsSpread: number }
export function gradeTaps(taps: number[], targets: number[], tol: TapTolerance, p: LearnerProfile): TapResult;
export function pitchFramesToNotes(f: PitchFrame[], o: { minNoteMs: number; clarity: number; gateDb: number }): SungNote[];
export function gradeSung(f: PitchFrame[], targets: { midi: number; on: number; off: number }[], tol: SingTolerance, mode: SingMode, p: LearnerProfile): MatchResult;
export function calibrateRange(f: PitchFrame[]): { low: number; high: number; comfLow: number; comfHigh: number };
export function calibrateTapLatency(taps: number[], clicks: number[]): number;
export function detectBleed(f: PitchFrame[], playing: { midi: number; on: number; off: number }[]): boolean;
export interface LearnerProfile { rangeLow: number; rangeHigh: number; comfLow: number; comfHigh: number; tapLatencyMs: number;
  singTolCents: 50|35|25; noiseFloorDb: number; headphones: 'wired'|'bluetooth'|'unknown'|'none' }
```

**`gradeTaps`.**
1. τ = taps − tapLatency, with targets in AudioContext seconds (scheduled start + onset/cps).
2. Window `w = 'auto'` → `clamp(0.25·minIOI, 50, 120 ms)·levelFactor`.
3. Coarse offset `b0` = median(τ − nearest target) over pairs closer than 2w.
4. Monotone DP alignment on τ − b0: match cost |e|/w (only if |e| ≤ w); skipping a target or a tap costs 1 each.
5. b = median of matched errors. If |b| > 25 ms → `tap.offset`. If `forgiveOffset`, subtract b.
6. `F1 = 2M/(|T|+|A|)`, `timing = mean(1 − |e|/w)`. Drift = regression slope of e over t; ±30 ms over the phrase → `tap.rushing` / `tap.dragging`.
7. `score = 0.7·F1 + 0.3·timing`.
8. **Free tempo:** initialize the affine map t = a·τ + c from the first and last taps vs targets, run DP, refit by least squares on matches (2 iterations), constrain a ∈ [0.8, 1.25], report the tempo ratio.

**`pitchFramesToNotes`.**
1. Voiced if clarity ≥ 0.9 (0.85 with a low-voice profile) and rms ≥ max(−45 dBFS, noiseFloor + 12 dB).
2. m = 69 + 12·log2(hz/440); median-of-5.
3. Octave-error repair: a jump of 11–13 semitones that returns within 4 frames → fold to the previous octave.
4. New note when deviation > 0.7 semitones from the running median for ≥ 4 frames, or after an unvoiced gap ≥ 6 frames. Drop notes < 100 ms (L1–3) / 70 ms.
5. Note pitch = median of frames in [start + 20%, end − 10%] (skips scoops).

**`gradeSung`.**
- **Timed modes** (sight, pitch, degree with a fixed window): each target window is `[on + min(80 ms, .25·dur), off − .1·dur]` after output/input latency compensation. `coverage` = voiced frames / window frames; estimate = median.
- **Free modes** (echo, resolution, bassline): segment notes, then NW-align against the targets on folded pitch (cost = min(1, |cents|/100)); order only, plus an IOI-ratio correlation as the rhythm dimension.
- **Octave policy.**
  - `per-note` (single-note tasks): fold each error to (−600, 600].
  - `global` (phrases): k* = mode of round((est − target)/12); notes off by ±12 from k* earn 0.5 + `sing.octave-jump`.
  - `exact`: no folding.
- **Drift compensation.** ê = median error over notes with |e| < 100¢. If |ê| ≤ driftCompCents, subtract it; report `sing.drift` if |ê| > 15¢.
- **Per-note credit:**
  - coverage < minCoverage → 0, `sing.missed`;
  - |e| ≤ tol → 1;
  - |e| ≤ 2·tol → 0.5, `sing.sharp`/`sing.flat`;
  - |e| > 70¢ → 0, `sing.wrong-note`, with the sung degree computed;
  - spread > 60¢ → `sing.unstable` (info).
- **Timing credit** (timed modes only): onset error = first voiced frame within 1 semitone of the target in [on − 250, on + 250] ms; credit 1 if ≤ onsetMs, 0.5 if ≤ 2·onsetMs, else 0.
- **Score.**
  - sight: 0.75·pitch + 0.25·timing;
  - echo: 0.85·pitch + 0.15·rhythm;
  - pitch, degree, resolution, bassline: pitch only.
- **Tolerance ladder** (`profile.singTolCents`): 50 → 35 after 3 sessions on distinct days with median |e| < 25¢, then 35 → 25 under the same rule. It never loosens automatically; Settings can loosen it.
- **`detectBleed`.** During playback-only spans, voiced frames within 30¢ of the playing note for > 300 ms → bleed.

### 3.9 Text normalization and chord-symbol dialects (`src/theory/chord-symbols.ts`)
**Normalizers.**
- **Notes**: `/^([A-Ga-g])\s*(##|x|#|♯|sharp|bb|b|♭|flat|♮|natural)?\s*(-?\d)?$/`.
- **Intervals**: `P|M|m|A|d|aug|dim|maj|min` + number, with `b3`-style accepted only where degree answers are allowed.
- **RN**: case-sensitive; `o`/`°` dim, `ø`/`h`/`m7b5` half-dim, `+` aug, figures `6 64 7 65 43 42`, applied `/`, prefixes `b`/`♭`/`#`.
- **Chords**: Unicode `∆ Δ` → `^`; `ø` → `h`; `°` → `o`; `−` → `-`; `♭`/`♯` → `b`/`#`.

| Quality | Strudel canonical (emitted in code) | Also accepted by Strudel | Not accepted (lint suggests canonical) | Lead-sheet display | abcjs chord text |
|---|---|---|---|---|---|
| maj | `C` | `C^`, `CM` | `Cmaj` | C | C |
| min | `C-` | `Cm` | `Cmin` | Cm | Cm |
| dim | `Co` | — | `Cdim` | C° | Co |
| aug | `C+` | `Caug` | — | C+ | C+ |
| sus4 | `Csus` | — | `Csus4` | Csus4 | Csus4 |
| maj7 | `C^7` | `CM7` | `Cmaj7`, `CΔ7` | Cmaj7 | Cmaj7 |
| 7 | `C7` | — | — | C7 | C7 |
| m7 | `C-7` | `Cm7` | `Cmin7` | Cm7 | Cm7 |
| m7b5 | `Ch7` | `C-7b5`, `Cm7b5` | `Cø7` | Cø7 | C07 (renders ø) |
| dim7 | `Co7` | — | `Cdim7` | C°7 | Co7 |
| mMaj7 | `C-^7` | `Cm^7`, `C-M7` | `CmM7` | Cm(maj7) | Cm(maj7) |
| 6 / m6 / 69 | `C6` / `C-6` / `C69` | `Cm6` | — | C6 / Cm6 / C6/9 | same |
| 9 / maj9 / m9 / m11 | `C9` / `C^9` / `C-9` / `C-11` | `CM9`, `Cm9`, `Cm11` | `Cmaj9` | C9 / Cmaj9 / Cm9 / Cm11 | same |
| 7b9 7#9 7#11 7b13 13 7alt ^7#11 7sus | as written | `CM7#11` | — | same | same |

Roots must be uppercase (`tokenizeChord`). Tonal is called only with canonical tonal names (`Cmaj7`, `Cm7`, `Cm7b5`, `Cdim7`, `CmMaj7`), never with `h9`, `-add9` or `ø7`.

### 3.10 Rubric rule → analyzer map
| rule | analyzer |
|---|---|
| bars | `periodOf` |
| duration-sec, tempo-bpm | `durationSec`, captured cps |
| tracks | `inferRoles` |
| in-key | `scaleMembership` |
| ends-on-degree | `endsOn` |
| cadence | `cadenceAt` |
| chord-tones-strong | `chordToneRatio` |
| progression | `schemaMatch`, `romanOf` |
| contains-rn | `romanOf` over slots (+ resolution check) |
| range | `range`, `tessitura` |
| step-ratio | `stepLeap` |
| motif-repetition | `motifs` |
| harmonic-rhythm | `harmonicRhythm` |
| groove-lock | `grooveLock` |
| swing | `swingRatio` |
| syncopation | `syncopation` |
| form | `sectionsFromAst` ∨ `formLabels` |
| section-contrast | `energyCurve` |
| voice-leading | `voiceLeading` |
| guide-tones | `guideToneLine` |
| modulation | `modulations` |
| mode | `modeEstimate` |
| blues-form | `bluesForm` |
| euclid | `euclidMatch` |
| clave | `claveType` |
| polyrhythm | `polyRatio` |
| register-separation | `registerSeparation` |
| no-muddy-low | `lowIntervalViolations` |
| uses | AST constraints |

---

## 4. Drill families (daily SRS practice)

### 4.1 Framework (`src/content/schema/drill.ts`, `src/drills/*`)
```ts
export interface LevelParams {
  categories: string[]; replays: number; instruments: Instrument[] | 'drums';
  keys: 'C'|'≤2acc'|'≤4acc'|'all'; tempo: [number, number]; context?: Cue['context'];
  [k: string]: unknown;               // family-specific (length, leapMax, voicings, windowMs…)
}
export interface DrillFamily<L extends LevelParams = LevelParams, E = Answer> {
  id: FamilyId; title: string;
  kind: 'fact'|'concept'|'perceptual'|'production';
  domain: 'rhythm'|'pitch'|'degree'|'interval'|'chord'|'harmony'|'melody'|'key'|'form'|'jazz'|'sound'|'code';
  skills: SkillWeight[]; categorySkill?: (cat: string) => SkillId;
  unlock: { skill: SkillId; lesson: LessonId; levelGates?: Record<number, SkillId> };   // gate = skill introduced
  levels: L[]; masteryLevel: number;
  trialsPerSet: number; fastRtMs: number; estTrialSec: number;
  retention: 0.85 | 0.9;
  contrastOf?: (cat: string) => string[];               // blocked-intro neighbours
  confusionTips?: Record<string, Md>;                   // 'b6|5': 'b6 leans down to 5…'
  answer: AnswerUi['ui'];
  generate(rng: Rng, level: L, p: LearnerProfile, focus?: string): Trial<E>;
  grade(t: Trial<E>, r: { answer?: Answer; taps?: number[]; frames?: PitchFrame[]; rtMs: number; replays: number }): TrialResult;
  exposure?(rng: Rng, level: L): { code: string; caption: Md; bars: number }[];
}
export interface Trial<E> {
  seed: number; level: number; category: string; params: Record<string, unknown>;
  code: string; events: NEvent[]; cps: number; preload: string[]; cue: Cue; expected: E;
  resolution?: { code: string; events: NEvent[] };      // FET resolution / contrast replay
}
export interface TrialResult { credit: number; correct: boolean; rtMs: number; replays: number; diagnostics: Diagnostic[]; confusion?: [string, string] }
export interface FactDeck { id: DeckId; unlock: { skill: SkillId; lesson: LessonId }; cards: { id: string; gate?: SkillId; prompt: unknown; answer: Answer }[];
  newPerDay: number; fastRtMs: number; answer: AnswerUi['ui'] }
```

**Playback.** The trial's `events` are authoritative. They are played through `OakStrudel.playEvents(events, {cps})`, which calls `superdough()` directly with internal control names, after `OakStrudel.preload(trial.preload)`. Every sound and pitch of the whole set is preloaded before trial 1, so no hap is skipped while loading.

**Shown code.** `code` is shown on "Show me the code" after answering. It uses only early functions (`note`, `n().scale`, `s`, `setcpm`, mini-notation), so it is readable from U1/U3 onward. A CI property test asserts `evaluate(code)` ≡ `events`.

**RNG.** `mulberry32(hash(familyId, setId, trialIndex))`. The seed is stored per trial, which makes trials reproducible for the tutor and for bug reports.

**Sound randomization pools** (`src/drills/pools.ts`):
- `keys1 = ['piano']`
- `keys2 = keys1 + ['rhodes','organ']`
- `keys3 = keys2 + ['cleangtr','jazzgtr','triangle']`
- `bass = ['ebass','upright','sawtooth']` (sawtooth via `.lpf(600)`)
- `lead = ['piano','tenor','horns','cleangtr','square']`
- `kits = [uzu default, RolandTR909, RolandTR808, LinnDrum, AkaiLinn, RolandTR707]`
- `clicks = ['rim','cp','hh']`

**Randomization codes** used in the tables:
| code | meaning |
|---|---|
| K | new key every trial (uniform over 12 tonics; enharmonic spelling with ≤ 6 accidentals; never the same key twice in a row) |
| R | register: stimulus within C3–C6, bass E1–G2, chords E2–C6 under the low-interval limits; sung targets inside comfLow+1 .. comfHigh−1 |
| I | instrument from the level pool |
| V | voicing from `src/drills/voicer.ts`: close/open/drop-2/spread, with random inversion when inversion is not the tested category; Strudel `voicing()` is never used for stimuli |
| T | tempo uniform in the level range ±8% |
| G | velocity jitter ±0.1 |
| D | drum kit pool |
| C | cadence variant: I–IV–V–I, I–V–I, ii–V–I, I–vi–IV–V; minor equivalents |

Constraint: no category more than 2× in a row, and no identical (key, category) pair within a set.

### 4.2 Adaptation (target ≈ 85% success)
1. **Level staircase** (SRS sets; per family, in `family_state.level`):
   - each set draws 25% of trials at level−1 and 75% at the current level;
   - **promote** after two sets with mean credit ≥ 0.90 on two different calendar days;
   - **demote** after a set < 0.60;
   - otherwise stay. Expected accuracy settles in roughly the .75–.90 band.
2. **Blocked → interleaved introduction.** When a level adds categories:
   - first a `listen` block with 3 labeled examples;
   - then 2 "contrast sets" with 50% new categories against `contrastOf(new)` neighbours (new 6 vs 5 and 7; new b7 vs 7);
   - then normal interleaving. The UI states once: "Mixed practice feels harder and works better."
3. **Category weighting.** `a_c = (hits+1)/(n+2)` over the last 30 trials per category; sampling weight ∝ (1 − a_c) + 0.15; every category appears at least once per 2 sets.
4. **Gym (free practice) and in-lesson generator steps.** Kaernbach weighted up-down on continuous difficulty d ∈ [1, L+0.99]: correct → d += 0.10; error → d −= 0.567 (ratio .85/.15). This converges to 85%. Level = floor(d); within-level parameters (tempo, replays, window) interpolate on frac(d).
5. **Replays** follow each level's `replays` limit. Extras count as assist and cap the rating at Hard.
6. **Context fading** is an explicit ladder axis for degree/interval families: full cadence → short cadence → tonic chord → in-loop.

### 4.3 FSRS mapping (`src/srs/*`)
```ts
// schedulers.ts — ts-fsrs 6.0.0, pinned; card JSON stores model name for future migration
export const FACT  = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.90, enableShortTerm: true,
  learningSteps: ['5m'], relearningSteps: ['5m'], enableFuzz: true, maximumInterval: 365 });
export const SKILL = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.85, enableShortTerm: false,
  enableFuzz: true, maximumInterval: 180 });      // perceptual/production families
export const CONCEPT = /* SKILL config with desiredRetention 0.90 */;

// grade-map.ts
export function setRating(s: { meanCredit: number; medianRtMs: number; extraReplays: number; revealed: boolean;
  levelAtOrAboveCard: boolean; meanAbsCents?: number; tolCents?: number }, fam: DrillFamily): Rating {
  if (s.revealed || s.meanCredit < 0.65) return Rating.Again;
  if (s.meanCredit < 0.80 || s.extraReplays > 0) return Rating.Hard;
  const easy = s.meanCredit >= 0.95 && s.medianRtMs <= fam.fastRtMs && s.levelAtOrAboveCard
    && (fam.kind !== 'production' || (s.meanAbsCents ?? 99) <= 0.5 * (s.tolCents ?? 50));
  return easy ? Rating.Easy : Rating.Good;
}
export function factRating(correct: boolean, rtMs: number, hinted: boolean, fastRtMs: number): Rating {
  if (!correct) return Rating.Again;
  if (hinted || rtMs > 3 * fastRtMs) return Rating.Hard;
  return rtMs <= fastRtMs ? Rating.Easy : Rating.Good;
}
```

**Card layout.**
- One FSRS card per family (levels live in `family_state`, not in the card).
- One card per atomic fact (decks).
- One card per concept family.

**Seeding.** An exercise with `srs.mode:'seed'` creates `newCard(now)` on lesson completion. It then immediately reviews the card with `setRating` over that lesson's tagged first attempts (treated as one set). `review-if-due` reviews only if R(now) < 0.90.

**New-card throttles.** Fact decks introduce ≤ `newPerDay` cards per deck (≤ 15 per day overall). Families add at most 2 new per day; overflow waits.

**Mic absent.** Production cards stay due and are skipped without any rating.

### 4.4 Family catalog
Columns: kind (F = fact deck, C = concept, P = perceptual, Pr = production); unlock skill · nominal lesson (unlock binds to the skill, the lesson id is nominal); trials per set; ladder with ★ = masteryLevel; randomization; fastRt in ms. The nominal lesson ids follow the pedagogy unit sequence: u00(3) u01(9) u02(8) u03(10) u04(6) u05(8) u06(12) u07(9) u08(5) u09(5) u10(9) u11(8) u12(6) u13(6) u14(6) u15(6) u16(5) u17(4); tracks jz/rh/ar.

**Rhythm**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| rhy.pulse | Pr | rhy.pulse · u01.01 | tap along | 3×4 bars | L1 four-on-floor 90–110 · L2 backbeat 70–130 · ★L3 syncopated kick 70–140 · L4 sparse hats/bass 60–150 · L5 half-time feel | D T | – |
| rhy.echo | Pr | rhy.echo · u01.04 | tap echo (locked click) | 5 | L1 1 bar quarters/8ths · L2 + rests · L3 + 16th pairs · ★L4 2 bars, dotted-8th+16th · L5 ties/syncopation · L6 triplets, swung 8ths · L7 3/4, 6/8; window ×1.0→×0.6 | D(clicks) T | – |
| rhy.read | Pr | not.rhythm · u01.07 | staff → tap | 4 | as echo ★L4 | T | – |
| rhy.dictation | P | rhy.dictation · u01.09 | grid L1–2 → mini code L3+ → staff L5+ | 4 | L1 1 bar 4ths/8ths, 4 replays · ★L4 2 bars with 16ths, 3 replays · L7 mixed 16th/triplet, 2 replays | T D | – |
| rhy.count | C | rhy.counting · u01.05 | choice "1 e & a" | 8 | L1 8ths · L2 16ths · ★L3 triplets · L4 compound "1 la li" | – | 2500 |
| rhy.meter | P | rhy.meter · u01.08 (L3 gate u13.04, L5 gate rh.06) | choice | 6 | L1 3/4 vs 4/4 drums · L2 melody only + 2/4 · ★L3 6/8 vs 3/4 · L4 12/8 · L5 5/4, 7/8 | T I D | 4000 |
| rhy.subdivision | P | rhy.triplets · u13.05 | choice | 8 | L1 8ths vs triplets · ★L2 + 16ths · L3 mixed within bar | T D | 3000 |
| rhy.syncopation | P | rhy.syncopation · u13.01 | click 16th cell | 6 | L1 anticipation of 1 or 3 · L2 any 8th off-beat · ★L3 16th positions · L4 two per bar | T D | 4000 |
| rhy.swing | P | rhy.swing · u11.07 | choice | 8 | L1 straight vs triplet (hats) · ★L2 straight/light/triplet/hard · L3 full groove · L4 swung vs straight 16ths | T D | 3000 |
| rhy.clave | P | rhy.clave · rh.12 (L1 gate rh.11) | choice | 6 | L1 tresillo/cinquillo/straight · L2 son 3-2 vs 2-3 · ★L3 son vs rumba · L4 in full groove | T D | 4000 |
| rhy.odd-grouping | P | rhy.odd · rh.07 | grouping diagrams | 6 | L1 5/8 2+3 vs 3+2 · ★L2 7/8 three groupings · L3 9/8 · L4 melody only | T D | 5000 |
| rhy.polyrhythm | P/Pr | rhy.poly · rh.09 | choice / tap layer | 6 | L1 3:2 vs 2:3 vs straight · ★L2 + 4:3 · L3 tap the 3 over 2 · L4 5:4, {3 vs 4} polymeter | T D | 4000 |
| rhy.groove-lock | P | bas.kick-lock · u08.04 | choice + bar click | 6 | L1 locked vs independent · ★L2 find the anticipating bass note · L3 funk 16th grooves | T D I | 4000 |

**Pitch**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| pit.compare | P | pit.height · u02.01 | higher/lower/same | 10 | L1 ≥ 4 st · ★L2 1–3 st · L3 different timbres | R I | 1500 |
| pit.match | Pr | pit.match · u00.03 | mic | 5 | L1 comfortable middle, live trace, 50¢ · L2 trace after · ★L3 sing after 1 s silence · L4 random timbre, wider range | R I | – |
| pit.steps | P | pit.half-whole · u02.02 | choice | 8 | L1 asc · ★L2 desc + keyboard/staff images | R I | 2500 |
| pit.keyboard | C | pit.keyboard · u02.03 | keyboard click | 8 | L1 white keys · ★L2 black keys #/b · L3 enharmonics E#, Cb | – | 3000 |
| pit.staff-names | F deck | not.treble · u02.05; not.bass · u05.04 | letter buttons | ≤10 due | cards per (clef, line/space): treble D4–G5, then ledger A3–C6; bass F2–B3, then E2, C4 ledger; newPerDay 6 | – | 2500 |

**Scale degrees** (Functional Ear Trainer method; resolution played after each answer: degrees 2–4 resolve down, 5–7 up, step by step to the tonic)
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| deg.tonic | P/Pr | deg.tonic · u03.01 | 3 candidates or sing | 5 | L1 phrase ends on 1 · L2 ends on 3/5 · ★L3 pop loop · L4 Aeolian loop (gate u10.01) · L5 modal (gate u14.01) | K R I | 4000 |
| deg.fet-major | P | deg.major.135 · u03.04 (L2 gate u03.05, L3 gate u03.06) | degree pad | 8 | L1 {1,3,5}, full cadence, piano, C4–C5, 2 replays · L2 {1..5} · L3 {1..7} · ★L4 {1..7}, C3–C6, keys3 · L5 short cadence, 2-note sequences · L6 tonic chord only, 3-note sequences · L7 degree inside a 4-bar pop loop | K R I C | 2500 |
| deg.fet-minor | P | deg.minor · u10.03 | degree pad | 8 | L1 {1,b3,5} · L2 + {2,4} · ★L3 + {b6,b7} · L4 + {6,7} (Dorian/harmonic) · L5 in minor loops | K R I C | 2500 |
| deg.fet-chromatic | P | deg.chromatic · u15.04 | degree pad + accidentals | 8 | L1 {#4,b7} among diatonic neighbours · ★L2 + {b3,b6} · L3 + {b2,#5,#1} · L4 all 12 | K R I C | 3000 |
| deg.sing | Pr | deg.sing · u03.04 | mic | 6 | mirrors fet-major L1–L4 ★L3; tolerance = learner | K R C | – |
| deg.resolve | Pr | deg.resolve · u03.06 | mic | 5 | L1 2→1, 7→1 · L2 3-2-1, 6-7-1 · ★L3 4-3-2-1, 5-6-7-1 · L4 minor b3-2-1, b6-5 (gate u10.03) | K R C | – |
| deg.index | C | code.scale-index · u03.03 | number / degree pad / text | 8 | L1 C/G/F major: degree ↔ n · ★L2 + note name in key (≤ 4 acc) · L3 minor (`"D:minor"` n5 = Bb) · L4 modes | K | 3500 |

**Intervals**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| int.in-key | P | int.in-key · u04.03 | degree pad ×2 | 8 | L1 1→x asc · L2 x→1 desc · ★L3 any diatonic pair asc · L4 desc · L5 harmonic dyads | K R I C | 3500 |
| int.isolated | P | int.quality · u04.05 | interval names | 8 | L1 asc {M2,M3,P4,P5,P8} · L2 + m2,m3,M6 · L3 + m6,m7,M7,TT · ★L4 desc all · L5 harmonic · L6 compound | R I | 3000 |
| int.spell | C | int.spell · u04.02 | text / staff | 6 | L1 above naturals P/M · L2 all qualities · ★L3 below · L4 accidental roots, double accidentals | – | 5000 |
| int.sing | Pr | int.sing · u04.06 | mic | 5 | L1 M2/M3/P5 up · ★L2 + P4, m3, P8, down · L3 all diatonic | R | – |

**Chords**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| chd.quality-triad | P | chd.triad-quality · u05.01 (L3 gate u05.02) | quality pad | 8 | L1 M vs m close root position · L2 random inversion/register · L3 + dim · ★L4 + aug · L5 open/spread, keys3, arpeggiated | R I V | 2500 |
| chd.quality-7th | P | chd.seventh-quality · u12.01 | quality pad | 8 | L1 maj7 vs 7 · L2 + m7 · L3 + m7b5 · ★L4 + dim7 · L5 + mMaj7, 6, m6 · L6 inversions, rootless | R I V | 3000 |
| chd.inversion | P | chd.inversion · u05.05 (L3 gate u12.05) | choice root/1st/2nd/3rd | 8 | L1 root vs 1st · ★L2 + 2nd · L3 7ths incl. 3rd · L4 spot the inverted chord in a progression | K R I | 3000 |
| chd.spell | C | chd.spell · u05.03 (L3 gate u12.01, L4 gate jz.02) | text / keyboard / staff | 6 | L1 M/m on naturals · ★L2 all triads, all roots · L3 7ths · L4 9/11/13 + alterations | – | 6000 |
| chd.symbols | F deck | chd.symbols · u05.03 (+ gates u12.01, jz.01) | text / choice | ≤10 due | card per quality: Strudel ↔ lead sheet ↔ name (table §3.9); newPerDay 4 | – | 3000 |

**Harmony**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| har.rn | C | har.rn · u06.02 | text / RN palette | 8 | L1 major ≤ 2 acc triads, both directions · ★L2 all major · L3 minor (+ harmonic V) · L4 diatonic 7ths · L5 V/x, borrowed (gates u15, u16) | K | 4000 |
| har.function | C/P | har.function · u06.03 | T/PD/D | 8 | L1 RN → function · ★L2 marked chord in a heard loop · L3 minor · L4 7ths, applied | K I | 3000 |
| har.bass | P | har.bass-degrees · u06.09 | (sing) + degree pad sequence | 4 loops | L1 schema loops, 1 chord/bar, root position · L2 any diatonic roots · ★L3 inversions (I–V6–vi–IV) · L4 2 chords/bar + passing bass · L5 minor/modal (gate u10.04) · L6 bVI/bVII/V of x (gates u15, u16) | K I V T | – |
| har.progression | P | har.dictation · u06.10 | staged bass → quality → RN | 3 | L1 4 diatonic triads · L2 + inversions · ★L3 8 chords with cadence · L4 minor · L5 7ths (gate u12.04) · L6 applied/borrowed; replays 6 → 3 | K I V T | – |
| har.schema | P | har.schema · u06.06 (+ gates) | schema cards | 6 | L1 axis vs three-chord · L2 + axis-vi, doo-wop (u06.07) · ★L3 + blues12 (u11.05) · L4 + aeolian, andalusian (u10.06) · L5 + mixo, dorian-vamp (u14.06) · L6 + ii-V-I (jz.05); full arrangement | K I D T | 5000 |
| har.cadence | P | har.cadence · u06.04 (L2 gate u06.05) | choice | 6 | L1 PAC vs HC · ★L2 + PC, DC · L3 IAC vs PAC · L4 + bVII–I, minor cadences | K I V | 4000 |
| har.chromatic | P | har.applied · u15.06 (L3 gate u16.05) | bar buttons + label | 5 | L1 locate V/V · L2 V/vi, V/ii, V/IV · ★L3 borrowed iv, bVI, bVII · L4 mixed | K I V | – |
| har.modulation | P | har.modulation · u17.04 | yes/no + bar | 4 | L1 truck-driver (+2) · ★L2 relative · L3 dominant via pivot | K I | – |

**Melody, keys, form**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| mel.dictation | P | mel.dictation · u03.09 | degree pad (rhythm given) → code → staff | 3 | L0 contour choice · L1 3–4 notes stepwise {1..5}, rhythm given · L2 5–6 notes {1..6} · L3 1 bar, triad leaps, rhythm dictated · ★L4 2 bars diatonic · L5 non-chord tones, leaps ≤ 6th · L6 4 bars minor · L7 chromatic neighbours, blue notes · L8 jazz arpeggio/guide lines; replays 4/3/2 | K R I T | – |
| mel.echo | Pr | mel.echo · u03.09 | mic | 4 | L1 3 notes stepwise · L2 4–5 notes {1..6} · ★L3 6 notes with triad leaps · L4 2 bars · L5 minor · L6 chromatic | K R I | – |
| mel.sight | Pr | not.sight-sing · u03.10 | staff + mic | 3 | L1 stepwise 1–5 quarters, C/G/F, degree labels · L2 1–6 + 8ths, labels fading · ★L3 ≤ 3 acc, triad leaps, no labels · L4 minor · L5 bass clef / lead sheets · L6 chromatic | K | – |
| mel.nct | P/C | mel.nct · u07.06 | choice | 6 | L1 passing vs neighbour (seen + heard) · ★L2 + appoggiatura, suspension · L3 + anticipation, escape · L4 ear only | K I | 4000 |
| key.signature | F deck | key.sig.major · u03.07; key.sig.minor · u10.08 | text / staff | ≤10 due | 30 keys × 2 directions; newPerDay 4 | – | 3000 |
| key.circle | C | key.circle · u03.08 | text / choice | 8 | L1 dominant/subdominant keys · ★L2 relative · L3 parallel, accidental difference · L4 enharmonic keys | – | 4000 |
| key.scale-spell | C | key.scale · u03.02 (gates u10.07, u11.03, u14.06) | text / staff / keyboard | 4 | L1 major ≤ 2 acc · ★L2 all major · L3 minor forms · L4 pentatonic, blues · L5 modes | – | 12000 |
| key.mode | P | key.tonality · u10.01 (L3+ gate u14.02) | choice | 6 | L1 major vs minor (arrangement) · L2 melody only · L3 Dorian vs Aeolian · ★L4 Mixolydian vs Ionian · L5 + Lydian, Phrygian · L6 all six vamps | K I D | 4000 |
| frm.blues | P/C | frm.blues · u11.05 (L4 gate jz.12) | choice / bar buttons | 6 | L1 "which chord now?" with bar counter · ★L2 no counter: IV arrival bar · L3 quick change vs standard · L4 jazz blues | K I D T | 4000 |
| frm.sections | P | frm.form · u09.03 | form choice + change bar | 3 | L1 AABA vs verse-chorus · ★L2 phrase length 4 vs 8 · L3 subtle contrast | K I D | – |

**Jazz, sound, code**
| id | kind | unlock | UI | n | ladder | rand | fastRt |
|---|---|---|---|---|---|---|---|
| jzz.ii-v | P | jzz.ii-v · jz.05 (L2 gate jz.06) | choice + bars | 6 | L1 ii–V–I vs I–IV–V · L2 major vs minor · ★L3 locate ii–Vs in 8 bars · L4 key of each ii–V in a descending chain | K I V T | 4000 |
| jzz.extension | P | jzz.ext · jz.02 (L2 gate jz.03) | choice | 8 | L1 7/9/13 on dominant · L2 9/b9/#9 · ★L3 maj7/maj7#11/69 · L4 m7/m9/m11 · L5 7alt/13/7b13 | K R I V | 3500 |
| jzz.guide | Pr/P | jzz.guide · jz.07 | mic or degree pad | 4 | L1 which voice moves in V7→I · ★L2 sing the 3rd/7th line over ii–V–I · L3 random keys · L4 turnarounds | K | – |
| jzz.chord-scale | C | jzz.chord-scale · jz.04 | choice / text | 8 | L1 m7 Dorian, 7 Mixolydian, ^7 Ionian · ★L2 + h7 Locrian ♮2, o7 whole-half · L3 + 7alt altered, ^7#11 Lydian, 7#11 Lydian dominant · L4 avoid notes | – | 3500 |
| jzz.subs | P | jzz.tritone · jz.14 (L2 gate jz.15) | choice | 6 | L1 V7–I vs bII7–I · ★L2 + backdoor iv–bVII7–I · L3 inside a standard | K I V | 4000 |
| jzz.voicing | C | jzz.voicings · jz.08 (gates jz.09, jz.10) | choice from staff / note list | 6 | L1 shell · ★L2 rootless A/B · L3 drop-2 | K | 5000 |
| snd.params | P | snd.filter · ar.07 (gates ar.08, ar.09) | "what changed" choice | 6 | L1 cutoff ↑/↓ · L2 + resonance · ★L3 attack vs release · L4 room vs delay · L5 two changes | I | 4000 |
| snd.roles | P | arr.roles · ar.01 | choice | 6 | L1 which layer is bass/pad/lead · ★L2 what masks the bass | I D | 4000 |
| code.mini | C | code.mini · u01.02 | roll choice / write string | 6 | L1 spaces, `*`, `~` · L2 `[ ]` · ★L3 `< >` · L4 `@`, `!` · L5 `(k,n,r)` · L6 `,`, `{ }%n` | – | 5000 |
| code.functions | C | first toolbox unlock · u03.03 | "which code made this?" (3 candidates) | 6 | pool = unlocked functions; one sub-skill per function `code.fn.<name>` | K I | 6000 |

### 4.5 Generator output snippets (shown code = played events)
```js
// deg.fet-major · L3 · A major · rhodes cadence · target degree 6 (n 5)
setcpm(100/4)
$: note("<[[a2,c#4,e4] [d3,a3,d4,f#4] [e3,b3,g#4] [a2,c#4,e4]] ~>").s("rhodes").gain(.55)
$: n("<~ 5>").scale("A3:major").s("piano")
// resolution after answer: n("5 6 7").scale("A3:major")  → 6 7 1

// mel.dictation · L2 · D major · cadence bar 1, fragment bars 2–3
setcpm(84/4)
$: note("<[[d3,f#3,a3] [d3,g3,b3] [c#3,e3,a3] [d3,f#3,a3]] ~ ~>").s("piano").gain(.5)
$: n("<~ [0 1 2 ~] [4 3 1 0]>").scale("D4:major").s("piano")

// har.bass · L1 · C major · axis loop
setcpm(92/4)
$: note("<[e3,g3,c4] [d3,g3,b3] [e3,a3,c4] [c3,f3,a3]>").s("piano").gain(.5)
$: n("<0 4 5 3>").scale("C2:major").s("ebass")

// chd.quality-triad · L4 · C+ in 1st inversion on organ
$: note("[e3,g#3,c4]").s("organ")

// jzz.extension · L2 · Bb7#9 (root, b7, 3, #9)
$: note("[bb2,ab3,d4,c#5]").s("rhodes")

// rhy.swing · L1 · triplet swing on hats
setcpm(120/4)
$: s("hh*8").swingBy(1/3, 4).gain(.6)
$: s("bd ~ sd ~").bank("RolandTR909")

// rhy.clave · L2 · son clave 3-2 (two bars, 8th grid)
setcpm(100/4)
$: s("rim").struct("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>")

// rhy.odd-grouping · L2 · 7/8 as 2+2+3 (eighth = 240/min)
setcpm(240/7)
$: s("hh*7").gain("1 .5 1 .5 1 .5 .5")
$: s("bd ~ sd ~ bd ~ ~")

// rhy.polyrhythm · L1 · 3:2
setcpm(90/4)
$: s("rim*3")
$: s("bd*2")
```

### 4.6 Daily drill planner (`src/drills/planner.ts`)
```
plan(now, budgetSec):            // lesson day: 300 s warm-up; drills-only day: 720 s
  due  = family cards (due ≤ now) ∪ fact decks with due cards ∪ repairQueue families
  prio = 3·inRepair + 2·(1 − R_now) + 1·blockedIntroPending + 0.5·linkedToNextLesson + 0.5·debtSkill
  first = anchor set: 4 trials at level−1 from the highest-R mastered family (evidence w .5, no FSRS)
  order by prio with constraints:
    no two consecutive sets from the same domain; ≤ 2 mic sets/session (0 if mic unavailable);
    a 15–20 s `listen` exposure block after every 2 sets (family.exposure)
    fact decks: one mini-set = up to 10 due cards, interleaved across decks
  stop when Σ(trialsPerSet·estTrialSec) ≥ budget; leftovers stay due (no penalty)
```
**Session sizes.** identify sets ≈ 60 s; dictation ≈ 90 s; sing/tap ≈ 60 s. A lesson-day warm-up holds about 4 sets; a drills-only day about 9.

**Streak day** = ≥ 1 completed set. Weekly freeze tokens and the "extra set repairs yesterday" rule live in the motivation layer.

---

## 5. Mastery model (`src/mastery/*`)

### 5.1 Skill node kinds and thresholds
| kind | examples | τ (mastered) | R source |
|---|---|---|---|
| fact | key signatures, staff names | 0.90 | fact-deck cards (mean R) |
| concept | `code.scale-index`, RN facts, mini-notation | 0.90 | concept-family card |
| perceptual | degree hearing, chord quality, schema ID | 0.85 | family card |
| production | singing degrees, tapping | 0.85 (at the learner's current tolerance) | family card |
| creative | `comp.four-chord-song`, `arr.contrast` | 0.85 over ≥ 2 pieces | mean R of component skills |

Content CI enforces that every non-creative skill links to ≥ 1 card (family/deck/concept family) and every creative skill lists ≥ 2 components.

### 5.2 Quantities
```
Evidence e_i = (s_i ∈ [0,1] adjustedScore, w_i from §1.2, t_i)
decay_i = 0.5^(age_days / 45)
P (performance) = (Σ w_i·decay_i·s_i + 1·0.5) / (Σ w_i·decay_i + 1)          // Bayesian shrinkage to 0.5
D (spread)     = # distinct calendar days in last 60 with an evidence item s ≥ 0.8
R (retention)  = Σ_c ω_c·forgettingCurve(card_c, now) / Σ ω_c                 // scheduler.model.forgettingCurve
M (strength)   = P·R                                                            // "if tested now"; display + planner
familyLevelOK  = for perceptual/production skills tied to a family: family_state.level ≥ masteryLevel
```

### 5.3 Levels (state machine with hysteresis)
| level | condition |
|---|---|
| `new` | not introduced |
| `available` | all prerequisite skills ≥ practiced and the introducing lesson is unlocked |
| `learning` | introduced; P < 0.70 or Σw < 2 |
| `practiced` | P ≥ 0.70 |
| `mastered` | P ≥ τ ∧ D ≥ 2 ∧ familyLevelOK ∧ (skill in a checkpoint range ⇒ checkpoint passed) |
| demotion | mastered → practiced only if P < τ − 0.10; mastery is never revoked by low R (it shows as rusty) |

### 5.4 Skill-map rendering (`skillmap.ts`)
- **Fill by level.**
  - new: outline only;
  - available: outline + accent glow;
  - learning: amber;
  - practiced: teal;
  - mastered: deep green with a gold ring.
- **Fade**: `opacity = 0.3 + 0.7·clamp((R − 0.60)/0.35, 0, 1)`. Full at R ≥ 0.95; 30% at R ≤ 0.60.
- **Markers.**
  - due dot: any linked card due;
  - "rusty": mastered ∧ R < 0.70;
  - "debt": soft-passed weak skill (§5.5).
- **Tooltip example**: "Strength 78% (performance 92%, recall 85%) · last practiced 6 d ago · next review in 3 d · confuses b6 with 5". The confusion part comes from the family's confusion matrix.
- **Unit node** = mean M of its skills. Its progress ring is "endowed": it starts at the share of skills already ≥ practiced from earlier units.

### 5.5 Checkpoints (`gates.ts`, `content/checkpoints.ts`)
**Map.** cp01 U0–U1 · cp02 U2 · cp03 U3 · cp04 U4–U5 · cp05 U6 · cp06 U7–U8 · cp07 U9–U10 · cp08 U11 · cp09 U12–U13 · cp10 U14 · cp11 U15–U16 · cp12 U17 + core review. Advanced tracks get one checkpoint per ~8 lessons (jz-cp1..4, rh-cp1..2, ar-cp1..2).

**Availability.** All lessons in range are complete, and every perceptual/production skill in range has evidence ≥ 0.8 on a calendar day before today. This is the ≥ 2-separate-days rule; checkpoints naturally fall on a later day.

**Composition** (~12 min, 12–20 items):
- ≥ 2 items per core skill;
- mixed kinds (identify, dictation, sing, code-modify, staff-read/write, fact);
- generated fresh from family generators at the skill's masteryLevel, plus 2–3 authored items;
- hints and tutor disabled; tolerance = the learner's current sing/tap tolerance;
- items sampled interleaved.

**Pass.** Weighted score ≥ 0.85 when perceptual/production items carry ≥ 50% of the weight, else ≥ 0.90; **and** every skill's item mean ≥ 0.70.

**On pass:**
- the next range's concept lessons unlock;
- skills in range become eligible for `mastered`;
- the album slot is enabled;
- checkpoint items review linked cards (`review-if-due`);
- tutor debrief offered (medium effort).

**On fail:**
- per-skill breakdown;
- a **repair queue**: 2 sets per failed skill's families at level−1 → level, or regenerated `code-fill`/`identify` variants for concept skills, linked to the lesson's worked example;
- retake once the repair queue is done **and** on the next calendar day; items regenerate.

**Soft pass.** After 2 failed attempts on different days, both ≥ 0.75, "Continue anyway" appears:
- weak skills get `debt` (planner boost);
- the next checkpoint re-includes them;
- lessons unlock.

**Never blocked:** sketchbook and playground (with the unlocked toolbox), capstones of completed units, Transcription Studio/gym, all unlocked drill families, album, tutor chat, lesson replays, can-do ledger.

### 5.6 Toolbox and can-do triggers (`candos.ts`)
- **Toolbox.** A tool unlocks on the first pass of an exercise listing it in `unlocks` (immediate, informative reward). Special case: `voicing` requires the `u05.05/hand-voiced-inversions` check passed at ≥ 0.9 **and** `chd.inversion` ≥ practiced. `rootNotes` (u08.03), `swingBy` (u11.07) and euclid `(k,n)` (rh.13) unlock likewise.
- **Can-do statements** are declarative, e.g. `{ id:'hear-axis', text:'I can hear I–V–vi–IV in real songs', when:{ family:['har.schema',3], skill:['har.schema.axis','mastered'] } }`. They are evaluated after each attempt commit; the ledger stores the first-achieved date.

---

## 6. Validation and tests (content CI, `bun test`)
1. **Exercises** (`content/**/content.test.ts`):
   - every `Reference.solutions[i]` scores 1.0;
   - every `TestCase` matches `expect`, its score range and its feedback ids;
   - code kinds need ≥ 1 pass case and ≥ 2 fail cases;
   - **auto-mutants**: for each reference, 5 single-token mutations (pitch ±1 scale step, rest insertion, onset shift) must fail, which catches vacuous matchers;
   - authored hints' `highlight` ranges must lie inside the code;
   - `⟪⟫`/`⟦⟧` markers must parse.
2. **Families** (`src/drills/families/*.prop.test.ts`, 500 seeds per level):
   - `evaluate(trial.code)` events ≡ `trial.events`;
   - `expected` ≡ analyzer of events (e.g. `degreeOf(target, key)`; `romanOf` per slot; `swingRatio` class);
   - registers within limits; no duplicate (key, category) within a set;
   - level categories ⊆ answer UI set;
   - `grade(expected)` = 1 and `grade(otherCategory)` = 0.
3. **Perf graders**:
   - synthetic sine and voice-like frames (vibrato ±30¢, scoops, octave errors) for `gradeSung`;
   - jittered tap arrays for `gradeTaps`;
   - Playwright fake-mic WAV fixtures for end-to-end sing steps.
4. **Theory**:
   - golden tables for `parseChordSymbol` across all dialect rows, `romanOf` (major/minor/applied/borrowed) and `identifyChord` ambiguities;
   - KK key estimates on PD tunes.
5. **SRS**:
   - `setRating` monotonic in credit;
   - simulated 90-day learner (85% accuracy) keeps the daily due load ≤ budget at the chosen retentions; fail CI if p95 load > 12 min.

**Persistence touchpoints** (server SQLite):
- `attempts(id, exercise_id, version, lesson_id, attempt_no, first_attempt, status, score, adjusted, response_json, result_json, at)`
- `evidence(skill_id, at, day, score, weight, source_kind, source_id)`
- `drill_sets(id, family_id, kind[srs|gym|warmup|repair], level, n, mean_credit, median_rt, rating, at)`
- `drill_trials(set_id, seed, category, params_json, expected, answer, credit, rt_ms, replays)`
- `srs_cards(id, kind[family|fact|concept], ref, card_json, model, due)`
- `srs_revlog(card_id, at, rating, revlog_json, source)`
- `family_state(family_id, level, promo_day, category_stats_json, blocked_remaining, confusion_json)`
- `skill_state(skill_id, P, R, D, level, debt, updated_at)` (cache)
- `checkpoint_runs(cp_id, at, items_json, score, per_skill_json, status)`
- `learner_profile(...)`

---

## 7. Decisions vs research, and items to verify in spikes
- **Deviation 1: FSRS set thresholds** are Again < .65 / Hard < .80 / Good / Easy ≥ .95 + fast, not the research's 70/90. With adaptive difficulty centred near 85%, the 90% cut would grade most sets Hard and inflate review load.
- **Deviation 2: `enableFuzz: true`.** The research reports disagreed; fuzz spreads the load when several families unlock on the same day.
- **Spike-verify (none blocking):**
  1. Unknown keys spread through `...rest` survive `voicing()`, so the `_oakChord` shim works. Fallback: pitch-based `identifyChord` only, which is always computed anyway.
  2. `@strudel/mini` exports `mini2ast`. Fallback: tokenizer regex.
  3. The `.p` collector plus `pattern.query(State)` behaves identically in the Vite worker and the Bun Worker.
  4. Bun Worker `terminate()` reliably kills runaway evaluations. Fallback: `Bun.spawn` + kill, test-only.
  5. ts-fsrs 6.0.0 runs under Bun (engines says Node ≥ 24).
  6. `getOutputTimestamp` mapping precision for tap latency in the target browser. The calibration step absorbs residual error.

### Critical Files for Implementation
- /Users/fpl0/Code/Oak/src/content/schema/exercise.ts
- /Users/fpl0/Code/Oak/src/grader/pipeline.ts (with /Users/fpl0/Code/Oak/src/grader/eval/headless.ts and /Users/fpl0/Code/Oak/src/grader/normalize/events.ts)
- /Users/fpl0/Code/Oak/src/grader/match/harmony.ts (with /Users/fpl0/Code/Oak/src/theory/roman.ts and /Users/fpl0/Code/Oak/src/theory/chord-symbols.ts)
- /Users/fpl0/Code/Oak/src/grader/perf/sing.ts (with /Users/fpl0/Code/Oak/src/grader/perf/tap.ts)
- /Users/fpl0/Code/Oak/src/drills/registry.ts (with /Users/fpl0/Code/Oak/src/srs/grade-map.ts and /Users/fpl0/Code/Oak/src/mastery/model.ts)
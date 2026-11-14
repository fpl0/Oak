// Capstones (contracts §2.4, §2.6, §6.6): the registry the syllabus reads (`capstoneMetas`) and the full
// definitions with briefs and the binding rubrics of §6.6 (`capstones`). A flavour never changes a rubric.
// Prose briefs live in content/core/capstones/<id>/brief.mdx (later waves); the rubric is here, once.
// Rubric conditions that no generic rule of §5.6 expresses are `custom` rules, each named in
// CUSTOM_RUBRIC_FNS so the grader builders know what to register.
import {
  type CanDoId,
  type CapstoneDef,
  type CapstoneId,
  type CapstoneMeta,
  type CapstoneSessionDef,
  CORE_DEVICES,
  type ComposeBriefEx,
  type DeviceName,
  defineCapstone,
  type FormMapCheck,
  type GateSpec,
  type HintLadder,
  type KeySpec,
  type LessonId,
  type Matcher,
  type MeterId,
  type PhraseCheck,
  type RubricRule,
  type SkillRef,
  type SongId,
  type SwingSpec,
  stripMarkers,
  type TestCase,
} from "@oak/content-kit";

type Body = RubricRule extends infer R
  ? R extends RubricRule
    ? Omit<R, "id" | "label" | "required" | "skills">
    : never
  : never;
const req = (id: string, label: string, skills: SkillRef[], body: Body): RubricRule =>
  ({ id, label, required: true, skills, ...body }) as RubricRule;
const opt = (id: string, label: string, skills: SkillRef[], body: Body): RubricRule =>
  ({ id, label, required: false, skills, ...body }) as RubricRule;
const custom = (fn: string, params?: Record<string, unknown>): Body =>
  (params ? { rule: "custom", fn, params } : { rule: "custom", fn }) as Body;

/**
 * The sessions of a capstone (contracts §2.4, §2.6). The last one offers the tutor review (§10.6: every
 * capstone gets one) and releases the piece to the album (Wave 4 `review`, `release`); a learner's draft
 * carries from one session to the next.
 */
type SessionExtra = Pick<CapstoneSessionDef, "starter" | "checks" | "focusRules" | "formMap" | "rubric">;
const S = (
  cap: CapstoneId,
  titles: string[],
  goals: string[],
  extras: (SessionExtra | undefined)[] = [],
): CapstoneSessionDef[] =>
  titles.map((title, i) => ({
    id: `${cap}.S${i + 1}` as CapstoneSessionDef["id"],
    title,
    goal: goals[i] ?? title,
    ...(extras[i] ?? {}),
    ...(i === titles.length - 1 ? { review: true, release: true } : {}),
  }));

const ladder = (concept: string, place: string, partial: string): HintLadder => [
  { text: concept },
  { text: place },
  { text: partial },
  "auto",
];

interface ComposeSpec {
  id: CapstoneId;
  title: string;
  objective: string;
  opensAfter: GateSpec;
  meter: MeterId;
  key?: KeySpec;
  bpm?: [number, number];
  swing?: SwingSpec;
  brief: string;
  starter: string;
  rubric: RubricRule[];
  skills: SkillRef[];
  sessions: [string, string][];
  /** Per session: its own starter (a first session's template), checks, or the rubric rules it works on. */
  sessionExtras?: (SessionExtra | undefined)[];
  canDo: CanDoId[];
  album?: string;
  minDurationSec?: number;
  hints: HintLadder;
  /** Graded by content CI (`bun run content:check <id>`): ≥ 2 passing pieces, ≥ 2 failing ones, the starter. */
  tests?: TestCase[];
}

function compose(c: ComposeSpec): CapstoneDef {
  const brief: ComposeBriefEx = {
    kind: "compose-brief",
    id: "brief",
    version: 1,
    title: c.title,
    prompt: c.brief,
    skills: c.skills.map((skill) => ({ skill, w: 1 })),
    role: "capstone",
    hints: c.hints,
    tests: c.tests ?? [],
    brief: c.brief,
    flavours: ["flavour.pop", "flavour.jazz-soul", "flavour.indie", "flavour.funk"],
    code: { starter: c.starter },
    rubric: c.rubric,
    ...(c.minDurationSec ? { minDurationSec: c.minDurationSec } : {}),
    album: { slot: c.album ?? c.id },
    review: { tutor: "offer" },
  };
  const early = ["C0", "C1", "C2", "C3", "C4", "X1"].includes(c.id);
  return defineCapstone({
    id: c.id,
    title: c.title,
    objective: c.objective,
    sessions: c.sessions.length,
    opensAfter: c.opensAfter,
    kind: "compose",
    version: 1,
    ...(c.key ? { key: c.key } : {}),
    meter: c.meter,
    ...(c.bpm ? { bpm: c.bpm } : {}),
    ...(c.swing ? { swing: c.swing } : {}),
    brief,
    sessionDefs: S(
      c.id,
      c.sessions.map((s) => s[0]),
      c.sessions.map((s) => s[1]),
      c.sessionExtras,
    ),
    reviewRevisions: early ? 1 : 2,
    canDo: c.canDo,
  });
}

interface TranscribeSpec {
  id: CapstoneId;
  title: string;
  objective: string;
  opensAfter: GateSpec;
  meter: MeterId;
  song: SongId[];
  sessions: [string, string][];
  /** Per session: the phrase checks graded against the chosen song's answer key (X1). */
  sessionExtras?: (SessionExtra | undefined)[];
  canDo: CanDoId[];
  inGymSlots?: boolean;
}
function transcribe(t: TranscribeSpec): CapstoneDef {
  return defineCapstone({
    id: t.id,
    title: t.title,
    objective: t.objective,
    sessions: t.sessions.length,
    opensAfter: t.opensAfter,
    ...(t.inGymSlots ? { inGymSlots: true } : {}),
    kind: "transcribe",
    version: 1,
    meter: t.meter,
    song: t.song,
    sessionDefs: S(
      t.id,
      t.sessions.map((s) => s[0]),
      t.sessions.map((s) => s[1]),
      t.sessionExtras,
    ),
    reviewRevisions: t.id === "X1" ? 1 : 2,
    canDo: t.canDo,
  });
}

const backbeat = [
  req("snare-backbeat", "Snare on beats 2 and 4", ["R04"], {
    rule: "onsets",
    track: "@drums",
    drum: "snare",
    contains: [
      [1, 4],
      [3, 4],
    ],
    perBar: true,
  }),
];
const tempo = (min: number, max: number) =>
  req("tempo", `Tempo between ${min} and ${max} BPM`, ["R02"], { rule: "tempo-bpm", min, max });

/** Pass thresholds of the transcription capstones (§6.6), read by the stage exercises when answer keys land. */
export const TRANSCRIBE_PASS = {
  // Contracts 1.6 (decision of 2026-11-13, d18): the chord stages pass at 0.85, like the melody (they were 0.80).
  X1: { melodyPerPhrase: 0.85, chordsPerStage: 0.85, phraseBars: 4 },
  X2: { bass: 0.9, changes: 0.85, melody: 0.85, order: ["bass", "changes", "melody"] },
  // Contracts §6.6 CF-T: melody ≥ 0.90, changes ≥ 0.85 per bar (a right root with the wrong quality earns
  // nothing for its bar, d11), the form map correct; the bass at X2's mark. Session by session: the form map
  // and the bass (S1), the changes (S2), the melody (S3), then the arrangement, the review and the release (S4).
  "CF-T": {
    formMap: 1,
    bass: 0.9,
    changesPerBar: 0.85,
    melody: 0.9,
    order: ["form", "bass", "changes", "melody", "arrange"],
  },
} as const;

/**
 * The one-off rubric checks (`rule: 'custom'`) the capstones still need; each gets a unit test in @oak/grader.
 * C3's lead sheet and C5's form, sevenths, bar 12 and blue notes left this list in Wave 5: they are written with
 * `notates`, `blues-form` + `choruses`, `chord-qualities` + `depth`, `contains-rn` + `section` and `degree-set` +
 * `anyOf` (AUTHORING §18).
 */
export const CUSTOM_RUBRIC_FNS = {
  "hats-grid": "the hi-hat line sits on an 8th or 16th grid",
  "fill-last-bar": "the last bar's drum onsets differ from bar 1",
  "ii-v-chain": "chained ii–Vs into at least `minKeys` distinct target keys",
  "guide-tone-motion": "guide-tone melody moves by at most `maxSemis` at chord changes",
  "walking-bass": "4 onsets per bar, root on beat 1 ≥ 75%, beat-4 approach ≥ 50%",
  "bridge-guide-tones": "bridge changes met by a 3rd or 7th on the downbeat ≥ `min`",
  "melody-matches-song": "melody identical to the song's answer key (`pitch`: absolute or pitch-class)",
  "allowed-tensions": "share of melody-over-chord tensions that are allowed ≥ `min`",
  "bass-kick-downbeat": "bass and kick both sound at beat 1 of every bar",
  "horn-stabs": "a track labelled `label` with at least `min` onsets in every `per` bars",
  "tresillo-bass": "the bass contains tresillo {0, 3/8, 6/8} on every 3-side bar",
  "two-versions-differ":
    "two versions: Δ tempo ≥ 20 BPM or swung vs straight; instrument sets differ by ≥ 2 sounds",
  "extended-chord-share": "a 9th or 11th in at least `min` of the bars",
  // Corrections gate (AS-32): C0's fill. The corrections pass's effect check, with `last: true` (the loop's last bar
  // differs from the bar before it), stands for §6.6's `fill-last-bar`.
  "bars-differ":
    "the loop has `min` different bars; with `last`, its last bar differs from the one before it",
} as const;

/** C0's reference intro (tests and the release preview): four bars, the fill a sixteenth-note snare-tom run. */
const C0_REFERENCE =
  'setcpm(100/4)\n\nkick: s("<[bd ~ bd ~] [bd ~ bd [~ bd]] [bd ~ bd ~] [bd ~ ~ ~]>")\nsnare: s("<[~ sd ~ sd]!3 [~ sd [sd sd sd sd] [ht ht lt lt]]>")\nhats: s("<hh*8!3 [hh hh hh hh ~ ~ ~ ~]>").gain(.6)';

/**
 * C1's reference loop with one part swapped out, for the known-weak tests. The capstone's Band plays the
 * chords of `band.axis-4bar` (C G Am F, one a bar), so the bass walks those roots and the riff uses notes
 * that sit inside them; a bass on C A F G under that Band put F under A minor and G under F.
 */
const c1Loop = (o: { bpm?: number; snare?: string; bass?: string; mel?: string } = {}) =>
  [
    `setcpm(${o.bpm ?? 96}/4)`,
    "",
    'kick: s("bd ~ [~ bd] ~")',
    `snare: s("${o.snare ?? "~ sd ~ sd"}")`,
    'hats: s("hh*8").gain(.6)',
    `bass: note("${o.bass ?? "<[c2 ~ c2 g1] [g1 ~ g1 d2] [a1 ~ a1 e2] [f1 ~ f1 c2]>"}").s("ebass").lpf(600)`,
    `mel: note("${o.mel ?? "<[c5 ~ g4 a4] [g4 e4 ~ d4]>"}").s("piano")`,
  ].join("\n");

// --- C2 Four-Chord Song ---------------------------------------------------------------------------

/**
 * C2's "loop, then land" template (content/specs/U07.md, C2.S1): drums, a root bass and the chords, bars 1–4
 * the loop I V vi IV, bars 5–6 its first two chords again, bars 7–8 empty for the landing. No tune yet: C2.S2
 * adds it. It fails the brief as it comes (no cadence, no melody), so it is also the brief's starter.
 */
const C2_TEMPLATE = [
  "setcpm(96/4)",
  "",
  "// Bars 1–4 loop; bars 5–6 are its first two chords again; bars 7–8 land on I.",
  'drums: s("bd ~ sd ~, hh*8")',
  'bass: n("<0 4 5 3 0 4 ⟪~ ~⟫>").scale("C2:major").s("ebass").lpf(600)',
  'chords: chord("<C G Am F C G ⟪~ ~⟫>").voicing().s("piano")',
].join("\n");

interface C2Parts {
  bpm?: number;
  drums?: string;
  /** Chord symbols, one a bar (`chord("<…>").voicing()`). */
  chords?: string;
  /** A whole `chords:` line in place of the symbols (hand-stacked sevenths). */
  chordsLine?: string;
  bassSound?: string;
  /** Roots for the bass, as `n` over C2 (0 = C, 4 = G, 5 = A, 3 = F). */
  bass?: string;
  /** The tune, as `n` over C4 (0 = C, 7 = the C above). */
  mel?: string | null;
  chordSound?: string;
  bassTail?: string;
  melSound?: string;
}
/** A C2 piece: drums, a root bass, chords and a tune, in C. Defaults: the pop reference. */
const c2Song = (o: C2Parts = {}): string =>
  [
    `setcpm(${o.bpm ?? 96}/4)`,
    "",
    `drums: s("${o.drums ?? "bd ~ sd ~, hh*8"}")`,
    `bass: n("${o.bass ?? "<0 4 5 3 0 4 4 0>"}").scale("C2:major")${o.bassTail ?? ""}.s("${o.bassSound ?? "ebass"}").lpf(600)`,
    o.chordsLine ??
      `chords: chord("${o.chords ?? "<C G Am F C G G C>"}").voicing().s("${o.chordSound ?? "piano"}")`,
    ...(o.mel === null
      ? []
      : [`mel: n("${o.mel ?? C2_TUNE}").scale("C4:major").s("${o.melSound ?? "piano"}")`]),
  ].join("\n");

/**
 * The pop reference tune over C G Am F C G | G C. The bar-1 idea climbs the chord and steps back (1 3 5 3);
 * each bar plays it again from its own chord's root (a sequence: G B D B, A C E C up to the high point,
 * F A C A), bars 5–6 bring bars 1–2 back, and bars 7–8 turn it round (2' 7 5) and land on 1'. Beats 1 and 3
 * of every bar are chord notes.
 */
const C2_TUNE = "<[0 2 4 2] [4 6 8 6] [5 7 9 7] [3 5 7 5] [0 2 4 2] [4 6 8 6] [8 6 4 ~] [7 ~ ~ ~]>";
/**
 * Indie over the rotation Am F C G, then F–C: the idea falls through the chord (E C A C over Am) and each
 * bar plays it from its own chord, ending 1' 6 4 over F and home on 1.
 */
const C2_INDIE_TUNE = "<[9 7 5 7] [7 5 3 5] [4 2 0 2] [8 6 4 6] [9 7 5 7] [7 5 3 5] [7 5 3 ~] [0 ~ ~ ~]>";
/** The minimal piece: two notes a bar, both chord notes, the first two bars coming back as bars 5–6. */
const C2_MINIMAL_TUNE = "<[0 ~ 2 ~] [1 ~ 4 ~] [0 ~ 2 ~] [0 ~ 3 ~] [0 ~ 2 ~] [1 ~ 4 ~] [1 ~ 4 ~] [0 ~ ~ ~]>";

// --- X1 Folk Transcription --------------------------------------------------------------------------

/**
 * A phrase of melody by ear (contracts §6.6 X1): key-relative, so a learner who writes it in another key
 * still passes, at 0.85. The rhythm matcher beside it turns a phrase written from the bar line, where the
 * song has a pickup, into `rhythm.pickup-missing` instead of a list of wrong rhythms (U07.L08 S5).
 */
export const X1_MELODY: Matcher = {
  m: "all",
  of: [
    { m: "melody", pitch: "key-relative", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16], track: "mel" },
    { m: "rhythm", tol: [1, 16], durations: false, perRole: false, displacementCredit: 0.5, tracks: ["mel"] },
  ],
};
/**
 * What X1 tells the learner first (contracts §6.6 X1): meter, key, tonic and the pickup. The rhythm of
 * phrase 1 is given too, but it differs between the two songs, so it comes from the chosen song's answer
 * key (`phrase1Rhythm` in content/repertoire/<slug>/song.ts), not from one skeleton here.
 */
const X1_GIVEN = { meter: true, key: true, tonic: true, pickup: true } as const;
const phrase = (n: number): PhraseCheck => ({
  id: `phrase-${n}`,
  phrase: n,
  layer: "melody",
  pass: TRANSCRIBE_PASS.X1.melodyPerPhrase,
  matcher: X1_MELODY,
  ...(n === 1 ? { given: X1_GIVEN } : {}),
});
/** X1's checks by session: phrases 1–2, phrases 3–4, then the chords of all four, bass first (§6.6). */
export const X1_CHECKS: readonly PhraseCheck[][] = [
  [phrase(1), phrase(2)],
  [phrase(3), phrase(4)],
  [
    {
      id: "chords",
      phrase: [1, 4],
      layer: "chords",
      pass: TRANSCRIBE_PASS.X1.chordsPerStage,
      stages: ["bass", "quality", "rn"],
      matcher: {
        m: "harmony",
        level: "rn",
        qualityDepth: "triad",
        inversion: false,
        harmonicRhythm: "given",
      },
    },
  ],
];

// --- Pieces in sections (C3, C4, C5) ---------------------------------------------------------------------

/** A section plan: `[bars, Section]` in order; `silence` for a part that rests in that section. */
type Plan = readonly (readonly [number, string])[];
/** One `arrange()` for a track (contracts §6.3, STYLE §10): the role's section consts in the plan's order. */
const arr = (role: string, plan: Plan): string =>
  `arrange(${plan.map(([bars, sec]) => `[${bars}, ${sec === "silence" ? sec : `${role}${sec}`}]`).join(", ")})`;
/** A whole file: the tempo line, the consts, then the labelled tracks. */
const sectioned = (bpm: number, consts: readonly string[], tracks: readonly string[]): string =>
  [`setcpm(${bpm}/4)`, "", ...consts, "", ...tracks].join("\n");
const VC: Plan = [
  [8, "Verse"],
  [8, "Chorus"],
];
const VCVC: Plan = [...VC, ...VC];

// --- C3 Verse–Chorus Demo ----------------------------------------------------------------------------

/**
 * C3.S1's template (content/specs/U09.md): both sections, eight bars each, arranged verse–chorus once. The
 * drums that change get a const per section; the snare plays through. The chords and roots are U09.L02's; the
 * bass plays its roots on straight eighths, so it locks with the kick on 2 of 8 until the learner gives it the
 * kick's rhythm, and the chorus's kick and hats are the verse's until the learner makes them busier. No tune
 * yet: C3.S2 adds it.
 */
const C3_TEMPLATE = sectioned(
  100,
  [
    "// verse and chorus, 8 bars each",
    'const kickVerse = s("bd ~ bd ~")',
    'const kickChorus = s("⟪bd ~ bd ~⟫")',
    'const hatsVerse = s("hh*8").gain(.4)',
    'const hatsChorus = s("⟪hh*8⟫").gain(.4)',
    'const chordsVerse = chord("<C Am F G>").voicing()',
    'const chordsChorus = chord("<F G C C>").voicing()',
    'const bassVerse = n("<0 5 3 4>").struct("⟪x*8⟫").scale("C2:major")',
    'const bassChorus = n("<3 4 0 0>").struct("⟪x*8⟫").scale("C2:major")',
  ],
  [
    `kick: ${arr("kick", VC)}`,
    'snare: s("~ sd ~ sd")',
    `hats: ${arr("hats", VC)}`,
    `chords: ${arr("chords", VC)}.s("piano")`,
    `bass: ${arr("bass", VC)}.s("ebass").lpf(600)`,
  ],
);

interface C3Parts {
  bpm?: number;
  plan?: Plan;
  /** The consts in place of the pop reference's (each replaces the one with the same name). */
  consts?: Record<string, string>;
  /** Extra consts (a pad, a second chorus tune). */
  more?: string[];
  /** A track's whole line in place of the default (`bass`, `mel`, …); `null` drops it. */
  tracks?: Record<string, string | null>;
  extraTracks?: string[];
  sounds?: { chords?: string; bass?: string; mel?: string; bank?: string };
}
/**
 * The pop reference in C at 100 BPM: verse I vi IV V under a tune in the middle of the voice, chorus IV V I I
 * a fourth higher on average, kick and bass sharing a rhythm const in each section (the chorus pushes:
 * more kicks, open hats on the off-beat). Every strong-beat note is a chord note.
 */
const C3_CONSTS: Record<string, string> = {
  groove: '"x ~ ~ x ~ ~ x ~"',
  push: '"x ~ x x ~ ~ x ~"',
  kickVerse: 's("bd").struct(groove)',
  kickChorus: 's("bd").struct(push)',
  hatsVerse: 's("hh*8").gain(.4)',
  hatsChorus: 's("[hh hh hh oh]*2").gain(.5)',
  chordsVerse: 'chord("<C Am F G>").voicing()',
  chordsChorus: 'chord("<F G C C>").voicing()',
  bassVerse: 'n("<0 5 3 4>").struct(groove).scale("C2:major")',
  bassChorus: 'n("<3 4 0 0>").struct(push).scale("C2:major")',
  melVerse: 'n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("C4:major")',
  melChorus: 'n("<[5 7 5 3] [6 ~ 4 ~] [7 9 11 9] [9 8 7 ~]>").scale("C4:major")',
};
const c3Song = (o: C3Parts = {}): string => {
  const plan = o.plan ?? VCVC;
  const s = { chords: "piano", bass: "ebass", mel: "piano", ...o.sounds };
  const bank = s.bank ? `.bank("${s.bank}")` : "";
  const consts = { ...C3_CONSTS, ...o.consts };
  const tracks: Record<string, string> = {
    kick: `kick: ${arr("kick", plan)}${bank}`,
    snare: `snare: s("~ sd ~ sd")${bank}`,
    hats: `hats: ${arr("hats", plan)}${bank}`,
    chords: `chords: ${arr("chords", plan)}.s("${s.chords}")`,
    bass: `bass: ${arr("bass", plan)}.s("${s.bass}").lpf(600)`,
    mel: `mel: ${arr("mel", plan)}.s("${s.mel}")`,
  };
  for (const [k, v] of Object.entries(o.tracks ?? {}))
    if (v === null) delete tracks[k];
    else tracks[k] = v;
  return sectioned(
    o.bpm ?? 100,
    [...Object.entries(consts).map(([k, v]) => `const ${k} = ${v}`), ...(o.more ?? [])],
    [...Object.values(tracks), ...(o.extraTracks ?? [])],
  );
};
/** Verse, chorus, verse, then a chorus twice as long: 40 bars, 96 seconds at 100 BPM. */
const C3_LONG: Plan = [...VCVC.slice(0, 3), [16, "Chorus"]];

// --- C4 Minor Indie Ballad ----------------------------------------------------------------------------

/**
 * C4.S1's sectioned starter (content/specs/U10.md): the verse alone, eight bars of the Aeolian loop i–VI–III–VII
 * in A minor (U10.L05) over a half-time groove, roots in the bass, and one `arrange()` per labelled track so the
 * chorus slots in next session without rewriting a line. The tune is a placeholder on A (no ♭3, no ♭6 yet) and
 * there is no V, so the starter fails the colour and the major V.
 */
const C4_TEMPLATE = sectioned(
  76,
  [
    "// the verse: the Aeolian loop, 8 bars",
    'const kickVerse = s("bd ~ ~ ~")',
    'const snareVerse = s("~ ~ sd ~")',
    'const hatsVerse = s("hh*4").gain(.4)',
    'const chordsVerse = chord("<Am F C G>").voicing()',
    'const bassVerse = n("<0 5 2 6>").scale("A1:minor")',
    'const melVerse = n("⟪0 ~ 0 ~⟫").scale("A3:minor")',
  ],
  [
    `kick: ${arr("kick", [[8, "Verse"]])}`,
    `snare: ${arr("snare", [[8, "Verse"]])}`,
    `hats: ${arr("hats", [[8, "Verse"]])}`,
    `chords: ${arr("chords", [[8, "Verse"]])}.s("piano")`,
    `bass: ${arr("bass", [[8, "Verse"]])}.s("ebass").lpf(600)`,
    `mel: ${arr("mel", [[8, "Verse"]])}.s("piano")`,
  ],
);

/**
 * The pop reference in A minor at 80 BPM: the verse on the Aeolian loop with a low tune that sings C (♭3) and F
 * (♭6), the chorus iv–VII–V–i (Dm G E Am) a few steps higher, landing on A over Am. Strong beats are chord notes.
 */
const C4_CONSTS: Record<string, string> = {
  kickVerse: 's("bd ~ ~ ~")',
  kickChorus: 's("bd ~ bd ~")',
  snareVerse: 's("~ ~ sd ~")',
  snareChorus: 's("~ sd ~ sd")',
  hatsVerse: 's("hh*4").gain(.4)',
  hatsChorus: 's("hh*8").gain(.45)',
  chordsVerse: 'chord("<Am F C G>").voicing()',
  chordsChorus: 'chord("<Dm G E Am>").voicing()',
  bassVerse: 'n("<0 5 2 6>").scale("A1:minor")',
  bassChorus: 'n("<3 6 4 0>").scale("A1:minor")',
  melVerse: 'n("<[4 ~ 2 ~] [5 ~ 7 ~] [4 ~ 2 ~] [1 ~ ~ ~]>").scale("A3:minor")',
  melChorus: 'n("<[3 5 7 5] [6 8 10 8] [8 ~ 4 ~] [7 ~ ~ ~]>").scale("A3:minor")',
};
interface C4Parts {
  bpm?: number;
  plan?: Plan;
  consts?: Record<string, string>;
  tracks?: Record<string, string | null>;
  extraTracks?: string[];
  sounds?: { chords?: string; bass?: string; mel?: string; bank?: string; melTail?: string };
}
const c4Song = (o: C4Parts = {}): string => {
  const plan = o.plan ?? VCVC;
  const s = { chords: "piano", bass: "ebass", mel: "piano", ...o.sounds };
  const bank = s.bank ? `.bank("${s.bank}")` : "";
  const consts = { ...C4_CONSTS, ...o.consts };
  const tracks: Record<string, string> = {
    kick: `kick: ${arr("kick", plan)}${bank}`,
    snare: `snare: ${arr("snare", plan)}${bank}`,
    hats: `hats: ${arr("hats", plan)}${bank}`,
    chords: `chords: ${arr("chords", plan)}.s("${s.chords}")`,
    bass: `bass: ${arr("bass", plan)}.s("${s.bass}").lpf(600)`,
    mel: `mel: ${arr("mel", plan)}.s("${s.mel}")${s.melTail ?? ""}`,
  };
  for (const [k, v] of Object.entries(o.tracks ?? {}))
    if (v === null) delete tracks[k];
    else tracks[k] = v;
  return sectioned(
    o.bpm ?? 80,
    Object.entries(consts).map(([k, v]) => `const ${k} = ${v}`),
    [...Object.values(tracks), ...(o.extraTracks ?? [])],
  );
};

// --- C5 12-Bar Shuffle --------------------------------------------------------------------------------

/**
 * C5's starter (content/specs/U11.md C5.S1): twelve bars of dominant sevenths in C with bar 12 left on I for the
 * learner to turn round, a backbeat, straight hats to swing, and a one-note placeholder on the blues scale where
 * the riff goes. It fails the form (one chorus), the swing, the turnaround and the blue notes.
 */
const C5_TEMPLATE = [
  "setcpm(112/4)",
  "",
  "// twelve bars of dominant sevenths in C",
  'const changes = "<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 ⟪C7⟫>"',
  "",
  'kick: s("bd ~ bd ~")',
  'snare: s("~ sd ~ sd")',
  'hats: s("⟪hh*8⟫").gain(.5)',
  'chords: chord(changes).voicing().s("piano")',
  'mel: n("⟪0 ~ ~ ~⟫").scale("C4:blues").s("piano")',
].join("\n");

/** The twelve bars, one chord a bar: the standard form and the quick change (IV in bar 2). */
const BLUES_STANDARD = ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"];
const BLUES_QUICK = BLUES_STANDARD.map((c, i) => (i === 1 ? "F7" : c));
/**
 * The riff, one bar moved onto each chord's root: root, ♭3 bending up to the 3rd, 5th, then the 5th again and
 * the ♭7 (on C7: C E♭ E G, G B♭). Over C7 the E♭ is the key's ♭3; over F7 the riff's ♭7 is E♭ again.
 */
const RIFF: Record<string, string> = {
  C7: "[c4 eb4 e4 g4 ~ g4 bb4 ~]",
  F7: "[f4 ab4 a4 c5 ~ c5 eb5 ~]",
  G7: "[g4 bb4 b4 d5 ~ d5 f5 ~]",
};
/** The answer of chorus 2 (bar 3 of each line, always over C7): down the blues scale G F E♭ C. */
const ANSWER = "[g4 ~ f4 ~ eb4 ~ c4 ~]";
/** Bar 4 of each line lands; bar 12 walks up the V chord, G B D F, back to the top. */
const LAND = "[c4 ~ ~ ~ ~ ~ ~ ~]";
const TURN = "[g3 ~ b3 ~ d4 ~ f4 ~]";
/** Chorus 1: the riff on every bar. Chorus 2: call (bars 1–2 of each line), answer (bar 3), land or turn (bar 4). */
const riffChorus = (bars: readonly string[], riff = RIFF): string =>
  `<${bars.map((c) => riff[c] ?? riff.C7).join(" ")}>`;
const answerChorus = (bars: readonly string[], riff = RIFF, answer = ANSWER): string =>
  `<${bars.map((c, i) => (i % 4 < 2 ? (riff[c] ?? riff.C7) : i % 4 === 2 ? answer : i === 11 ? TURN : LAND)).join(" ")}>`;
/** A boogie bass on quarters (root, 3rd, 5th, 6th of each chord): quarter notes are left alone by the swing. */
const BOOGIE: Record<string, string> = { C7: "[c2 e2 g2 a2]", F7: "[f2 a2 c3 d3]", G7: "[g2 b2 d3 e3]" };

interface C5Parts {
  bpm?: number;
  bars?: readonly string[];
  /** The changes string in place of `bars` (two-chord bars). */
  changes?: string;
  melChorus?: string;
  melChorus2?: string;
  /** A tune of one chorus only (no second section). */
  oneChorus?: boolean;
  hats?: string;
  melSwing?: string;
  bass?: string | null;
  sounds?: { chords?: string; bass?: string; mel?: string; bank?: string };
}
/** The pop reference: the standard form in C at 112, swung hats, a boogie bass, the riff, then call and answer. */
const c5Song = (o: C5Parts = {}): string => {
  const bars = o.bars ?? BLUES_STANDARD;
  const s = { chords: "piano", bass: "ebass", mel: "piano", ...o.sounds };
  const bank = s.bank ? `.bank("${s.bank}")` : "";
  const swing = o.melSwing ?? ".swingBy(1/3, 4)";
  const mel = o.oneChorus
    ? [`mel: note("${o.melChorus ?? riffChorus(bars)}")${swing}.s("${s.mel}")`]
    : [`mel: arrange([12, melChorus], [12, melChorus2])${swing}.s("${s.mel}")`];
  return [
    `setcpm(${o.bpm ?? 112}/4)`,
    "",
    `const changes = "${o.changes ?? `<${bars.join(" ")}>`}"`,
    ...(o.oneChorus
      ? []
      : [
          `const melChorus = note("${o.melChorus ?? riffChorus(bars)}")`,
          `const melChorus2 = note("${o.melChorus2 ?? answerChorus(bars)}")`,
        ]),
    "",
    `kick: s("bd ~ bd ~")${bank}`,
    `snare: s("~ sd ~ sd")${bank}`,
    o.hats ?? `hats: s("hh*8")${bank}.swingBy(1/3, 4).gain(.5)`,
    `chords: chord(changes).voicing().s("${s.chords}")`,
    ...(o.bass === null
      ? []
      : [o.bass ?? `bass: note("<${bars.map((c) => BOOGIE[c] ?? BOOGIE.C7).join(" ")}>").s("${s.bass}")`]),
    ...mel,
  ].join("\n");
};

// --- C6 Modal Vamp ------------------------------------------------------------------------------------

/**
 * C6's starter (content/specs/U14.md C6.S1): two bars of G Mixolydian, I–♭VII, under a backbeat, and one marked
 * line on the mode where the hook goes. The F chord already puts the ♭7 on beat 1 of every second bar; the
 * starter fails `bars` (a two-bar loop is two bars as written, contracts §6.4). Learner review: the chords comp in
 * three-three-two, so the first thing heard is a groove and not two held chords; the F still lands on beat 1.
 */
const C6_TEMPLATE = [
  "setcpm(100/4)",
  "",
  "// G Mixolydian: G major with F natural, the ♭7",
  'chords: chord("<G F>").voicing().struct("x ~ ~ x ~ ~ x ~").s("piano")',
  'mel: n("⟪0 2 4 6⟫").scale("G4:mixolydian").s("piano")',
  'kick: s("bd ~ bd ~")',
  'snare: s("~ sd ~ sd")',
  'hats: s("hh*8").gain(.5)',
].join("\n");

type Lines = Record<string, string | null>;
/** Vamp, tune, vamp: sixteen bars (contracts §6.3, STYLE §10). */
const C6_PLAN: Plan = [
  [4, "Vamp"],
  [8, "Tune"],
  [4, "Vamp"],
];
/** One `arrange()` for a track that plays only in some sections and rests (`silence`) in the others. */
const arrIn = (role: string, plan: Plan, plays: readonly string[]): string =>
  arr(
    role,
    plan.map(([bars, sec]) => [bars, plays.includes(sec) ? sec : "silence"] as const),
  );
const dropNull = (lines: Lines): string[] => Object.values(lines).filter((v): v is string => v !== null);

interface C6Parts {
  bpm?: number;
  /** The home note and the mode of every `.scale()` in the piece. */
  home?: string;
  mode?: string;
  plan?: Plan;
  /** The vamp's chord symbols, one a bar. */
  chords?: string;
  /** After `.voicing()`: a comping rhythm, a push. */
  chordsTail?: string;
  /** The bass as `n` over `<home><bassOctave>:<mode>`. */
  bass?: string;
  bassOctave?: number;
  /** Section consts in place of the pop reference's (`null` drops one). */
  consts?: Lines;
  /** Whole tracks in place of the defaults (`null` drops one). */
  tracks?: Lines;
  extraTracks?: string[];
  sounds?: { chords?: string; bass?: string; gtr?: string; mel?: string; bank?: string; fx?: string };
}
/**
 * The pop reference (content/specs/U14.md C6): G Mixolydian at 112, I–♭VII–IV–I on organ, a root bass that
 * touches F on its way round, a crunch riff in the vamp sections whose first note is te (F) on beat 1, and an
 * eight-bar tune in call and answer that lands on F on beat 3 of bar 1 and on beat 1 of bar 4. Every strong-beat
 * note of riff and tune is a note of its chord or the ♭7 over G.
 */
const C6_CONSTS: Record<string, string> = {
  kickVamp: 's("bd ~ bd ~")',
  kickTune: 's("bd [~ bd] ~ bd")',
  gtrVamp: 'n("<[6 ~ 4 2] [6 ~ 3 1] [5 ~ 3 0] [4 ~ 6 ~]>")',
  melTune: 'n("<[4 ~ 6 4] [3 ~ 1 ~] [5 ~ 3 ~] [6 ~ ~ ~] [4 ~ 6 4] [3 ~ 1 0] [0 ~ 3 5] [4 ~ ~ ~]>")',
};
const c6Song = (o: C6Parts = {}): string => {
  const plan = o.plan ?? C6_PLAN;
  const home = o.home ?? "G";
  const mode = o.mode ?? "mixolydian";
  const s = { chords: "organ", bass: "ebass", gtr: "crunch", mel: "piano", ...o.sounds };
  const bank = s.bank ? `.bank("${s.bank}")` : "";
  const fx = s.fx ?? "";
  const consts: Lines = { ...C6_CONSTS, ...o.consts };
  const tracks: Lines = {
    kick: `kick: ${arr("kick", plan)}${bank}`,
    snare: `snare: s("~ sd ~ sd")${bank}`,
    hats: `hats: s("hh*8")${bank}.gain(.5)`,
    chords: `chords: chord("${o.chords ?? "<G F C G>"}").voicing()${o.chordsTail ?? ""}.s("${s.chords}")${fx}`,
    bass: `bass: n("${o.bass ?? "<[0 ~ 0 ~] [6 ~ 6 ~] [3 ~ 3 ~] [0 ~ 4 6]>"}").scale("${home}${o.bassOctave ?? 1}:${mode}").s("${s.bass}")${s.bass === "ebass" ? ".lpf(700)" : ""}`,
    gtr: `gtr: ${arrIn("gtr", plan, ["Vamp"])}.scale("${home}3:${mode}").s("${s.gtr}")${fx}`,
    mel: `mel: ${arrIn("mel", plan, ["Tune"])}.scale("${home}4:${mode}").s("${s.mel}")${fx}`,
    ...o.tracks,
  };
  return sectioned(
    o.bpm ?? 112,
    Object.entries(consts).flatMap(([k, v]) => (v === null ? [] : [`const ${k} = ${v}`])),
    [...dropNull(tracks), ...(o.extraTracks ?? [])],
  );
};
/**
 * The jazz-soul piece: D Dorian at 92, i7–IV7 (Dm7 G7) on Rhodes over an upright that walks to B, the raised 6,
 * in bar 2; a piano tune that puts B on beat 1 of every G7 bar. No riff: the vamp sections are the band alone.
 */
const C6_DORIAN: C6Parts = {
  bpm: 92,
  home: "D",
  mode: "dorian",
  chords: "<Dm7 G7>",
  bass: "<[0 ~ 4 ~] [3 ~ 5 ~]>",
  bassOctave: 2,
  consts: {
    kickVamp: 's("bd ~ ~ ~")',
    kickTune: 's("bd ~ ~ bd")',
    gtrVamp: null,
    melTune: 'n("<[4 ~ 2 0] [5 ~ 3 ~] [6 ~ 4 2] [5 ~ ~ ~] [4 ~ 2 0] [5 ~ 3 1] [2 ~ 0 ~] [5 ~ ~ ~]>")',
  },
  tracks: { gtr: null, hats: 'hats: s("rd*8").gain(.5)' },
  sounds: { chords: "rhodes", bass: "upright", mel: "piano" },
};
const c6Dorian = (o: C6Parts = {}): string =>
  c6Song({
    ...C6_DORIAN,
    ...o,
    consts: { ...C6_DORIAN.consts, ...o.consts },
    tracks: { ...C6_DORIAN.tracks, ...o.tracks },
    sounds: { ...C6_DORIAN.sounds, ...o.sounds },
  });

// --- C7 Chromatic Colour ------------------------------------------------------------------------------

/**
 * C7.S1's sectioned starter (content/specs/U17.md C7.S1): a verse and a chorus in C, eight bars each, one string
 * of chord names per section driving both the chords and the bass (U08.L04), one `arrange()` per labelled track.
 * Every chord is in the key: where the secondary dominant and ♭VI–♭VII–I go is the learner's choice. No tune
 * yet (C7.S2). It fails all four lines of the rubric: no colour chord, no lift, sixteen bars.
 */
const C7_TEMPLATE = sectioned(
  100,
  [
    "// verse and chorus in C, 8 bars each: every chord is in the key, the colours are yours to place",
    'const changesVerse = "<C Am F G C Am Dm G>"',
    'const changesChorus = "<F G C Am F G C C>"',
    'const kickVerse = s("bd ~ bd ~")',
    'const kickChorus = s("bd ~ bd [~ bd]")',
    'const hatsVerse = s("hh*8").gain(.4)',
    'const hatsChorus = s("[hh hh hh oh]*2").gain(.5)',
    "const chordsVerse = chord(changesVerse).voicing()",
    "const chordsChorus = chord(changesChorus).voicing()",
    "const bassVerse = chord(changesVerse).rootNotes(2)",
    "const bassChorus = chord(changesChorus).rootNotes(2)",
  ],
  [
    `kick: ${arr("kick", VC)}`,
    'snare: s("~ sd ~ sd")',
    `hats: ${arr("hats", VC)}`,
    `chords: ${arr("chords", VC)}.s("piano")`,
    `bass: ${arr("bass", VC)}.s("ebass").lpf(700)`,
  ],
);

/** Verse, chorus, verse, chorus, and the chorus once more, lifted: forty bars. */
const C7_PLAN: Plan = [...VCVC, [8, "Chorus2"]];
/** The plan as a track that does not change in the lift plays it: the last chorus is the chorus again. */
const unlifted = (plan: Plan): Plan =>
  plan.map(([bars, sec]) => [bars, sec === "Chorus2" ? "Chorus" : sec] as const);

interface C7Parts {
  bpm?: number;
  plan?: Plan;
  verse?: string;
  chorus?: string;
  /** The last chorus's chord names, each moved up by the lift. */
  chorus2?: string;
  melVerse?: string;
  melChorus?: string;
  /** The tune's key plan, after its `arrange()`; `null` writes the tune without one. */
  keyPlan?: string | null;
  /** Section consts in place of the defaults (`null` drops one). */
  consts?: Lines;
  tracks?: Lines;
  extraTracks?: string[];
  sounds?: { chords?: string; bass?: string; mel?: string; bank?: string; fx?: string };
}
/**
 * The pop reference (content/specs/U17.md C7, evaluated and graded there): the starter with A7 in bar 6 of the
 * verse leaning into Dm (the tune holds its 3rd, C♯, and the Dm chord takes it up to D while the tune moves on to F), the chorus ending on A♭, B♭ and C under
 * do, re, mi (the 3rd of each), and the chorus once more a whole step up: forty bars, 1:36 at 100 BPM.
 */
const C7_VERSE = "<C Am F G C A7 Dm G>";
const C7_CHORUS = "<F G C Am F Ab Bb C>";
const C7_CHORUS2 = "<G A D Bm G Bb C D>";
const C7_MEL_VERSE = "<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [0# ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~]>";
const C7_MEL_CHORUS = "<[5 ~ 5 7] [6 ~ 4 ~] [7 ~ 7 9] [7 ~ 5 ~] [5 ~ 5 7] [7 ~ ~ ~] [8 ~ ~ ~] [9 ~ ~ ~]>";
const c7Song = (o: C7Parts = {}): string => {
  const plan = o.plan ?? C7_PLAN;
  const s = { chords: "piano", bass: "ebass", mel: "piano", ...o.sounds };
  const bank = s.bank ? `.bank("${s.bank}")` : "";
  const fx = s.fx ?? "";
  const lifted = plan.some(([, sec]) => sec === "Chorus2");
  const consts: Lines = {
    changesVerse: `"${o.verse ?? C7_VERSE}"`,
    changesChorus: `"${o.chorus ?? C7_CHORUS}"`,
    ...(lifted ? { changesChorus2: `"${o.chorus2 ?? C7_CHORUS2}"` } : {}),
    kickVerse: 's("bd ~ bd ~")',
    kickChorus: 's("bd ~ bd [~ bd]")',
    hatsVerse: 's("hh*8").gain(.4)',
    hatsChorus: 's("[hh hh hh oh]*2").gain(.5)',
    chordsVerse: "chord(changesVerse).voicing()",
    chordsChorus: "chord(changesChorus).voicing()",
    ...(lifted ? { chordsChorus2: "chord(changesChorus2).voicing()" } : {}),
    bassVerse: "chord(changesVerse).rootNotes(2)",
    bassChorus: "chord(changesChorus).rootNotes(2)",
    ...(lifted ? { bassChorus2: "chord(changesChorus2).rootNotes(2)" } : {}),
    melVerse: `n("${o.melVerse ?? C7_MEL_VERSE}")`,
    melChorus: `n("${o.melChorus ?? C7_MEL_CHORUS}")`,
    ...o.consts,
  };
  const keyPlan = o.keyPlan === undefined ? '"<C4:major!32 D4:major!8>"' : o.keyPlan;
  const tracks: Lines = {
    kick: `kick: ${arr("kick", unlifted(plan))}${bank}`,
    snare: `snare: s("~ sd ~ sd")${bank}`,
    hats: `hats: ${arr("hats", unlifted(plan))}${bank}`,
    chords: `chords: ${arr("chords", plan)}.s("${s.chords}")${fx}`,
    bass: `bass: ${arr("bass", plan)}.s("${s.bass}")${s.bass === "ebass" ? ".lpf(700)" : ""}`,
    mel: `mel: ${arr("mel", unlifted(plan))}${keyPlan === null ? "" : `.scale(${keyPlan})`}.s("${s.mel}")${fx}`,
    ...o.tracks,
  };
  return sectioned(
    o.bpm ?? 100,
    Object.entries(consts).flatMap(([k, v]) => (v === null ? [] : [`const ${k} = ${v}`])),
    [...dropNull(tracks), ...(o.extraTracks ?? [])],
  );
};

// --- X2 Blues Transcription -------------------------------------------------------------------------------

/**
 * X2's bass (contracts §6.6 X2, ≥ 0.90): the ladder's L3 bass matcher, the bass line by its notes and rhythm,
 * octave-free, on the bass role.
 */
export const X2_BASS: Matcher = {
  m: "melody",
  pitch: "octave-free",
  wPitch: 0.7,
  wRhythm: 0.3,
  rhythmTol: [1, 16],
  track: "@bass",
};
/** X2's changes (≥ 0.85): each chord by numeral on the triad core, so I7 counts as I; one chord a bar given. */
export const X2_CHANGES: Matcher = {
  m: "harmony",
  level: "rn",
  // d11 (Wave 6): sevenths are read, and a wrong quality earns nothing, as on ladder L6 (U11.L04 taught V7 before
  // X2, so its dominant sevenths are part of the answer).
  qualityDepth: "seventh",
  inversion: false,
  harmonicRhythm: "given",
  // The chords alone, as ladder L6's changes stage (`SONG_LADDER_MATCHERS.changes`): the bass has its own check
  // first, so a right bass never carries a wrong chord (Wave 5 integration).
  weights: { bass: 0 },
  wrongQuality: "none",
};
/** X2's givens (content/specs/U11.md X2.S1): meter, key, tonic and the pickup; the swing comes with the song. */
const X2_GIVEN = { meter: true, key: true, tonic: true, pickup: true } as const;
/**
 * X2's checks by session (contracts §6.6 X2: bass ≥ 0.90, then changes ≥ 0.85, then melody ≥ 0.85, stages in
 * that order; feature `capstone.check-after`). X2.S1: the bass, then the changes once the bass passed or was
 * revealed. X2.S2: the melody one 4-bar line at a time, each open once the changes are done, compared
 * key-relative like X1's phrases. The checks read the answer key's phrases (one per 4-bar line): lines 1–3 are
 * the whole 12-bar strain of St. Louis Blues and the first twelve bars of Careless Love's 16-bar verse, whose
 * fourth line is its first again ("Love, oh love, oh careless love"), so every line of either song is checked once.
 * A check names phrases by index, the same for both songs; a per-song phrase count is not expressible yet.
 */
export const X2_CHECKS: readonly PhraseCheck[][] = [
  [
    {
      id: "bass",
      phrase: [1, 3],
      layer: "bass",
      pass: TRANSCRIBE_PASS.X2.bass,
      matcher: X2_BASS,
      given: X2_GIVEN,
    },
    {
      id: "changes",
      phrase: [1, 3],
      layer: "chords",
      pass: TRANSCRIBE_PASS.X2.changes,
      matcher: X2_CHANGES,
      after: ["bass"],
    },
  ],
  [1, 2, 3].map(
    (n): PhraseCheck => ({
      id: `melody-${n}`,
      phrase: n,
      layer: "melody",
      pass: TRANSCRIBE_PASS.X2.melody,
      matcher: X1_MELODY,
      after: ["changes"],
    }),
  ),
];

// --- CF-A Album Single (author:finale) ----------------------------------------------------------------------

/**
 * The six devices of CF-A (contracts §6.6, `CORE_DEVICES`; content/specs/CF.md "The six devices: what counts"),
 * as the brief and the devices card word them: what counts, in one sentence; the lesson where the learner met it;
 * where it usually sits in a single. One musical event counts for one device.
 */
export const CF_A_DEVICES: readonly {
  device: DeviceName;
  what: string;
  met: LessonId;
  metIn: string;
  sits: string;
}[] = [
  {
    device: "secondary dominant",
    what: "A dominant chord aimed at a chord that is not home, and going there: E7 to Am in C.",
    met: "U15.L02",
    metIn: "Five of Five",
    sits: "In the bar before the chorus, or inside it on its way to vi.",
  },
  {
    device: "borrowed chord",
    what: "A chord from the minor key on the same home note, used in a major-key song: iv, ♭III, ♭VI or ♭VII (Fm, E♭, A♭, B♭ in C). In a minor-key song: the major IV, or a major chord on home at an ending.",
    met: "U16.L01",
    metIn: "The Sad IV",
    sits: "In the bridge, or in the last two bars before a chorus.",
  },
  {
    device: "modulation",
    what: "The song changes key and stays there for eight bars or more: a last chorus lifted a half or a whole step, or a bridge in another key.",
    met: "U17.L02",
    metIn: "Truck-Driver & Direct Modulation",
    sits: "The last chorus, or the whole bridge.",
  },
  {
    device: "suspension",
    what: "A note of the tune held over a chord change so that it rubs against the new chord, then steps down into it: 4 to 3, or 9 to 8.",
    met: "U07.L05",
    metIn: "Leaning & Holding",
    sits: "At a cadence: the last bar of the verse, or the bar before the bridge.",
  },
  {
    device: "syncopated bass",
    what: "The bass lands between the beats and holds across the next one: pushed with `.early(1/8)`, or written off the beat.",
    met: "U13.L01",
    metIn: "Pushes & Anticipations",
    sits: "In the chorus, where the groove pushes hardest.",
  },
  {
    device: "modal colour",
    what: "A stretch that takes its colour from a mode: the ♭VII chord of Mixolydian in I–♭VII–IV, a Dorian groove on i and IV, the ♯4 of Lydian, the ♭2 of Phrygian.",
    met: "U14.L01",
    metIn: "Modes as Colours",
    sits: "In a verse, or in the bridge.",
  },
];

/**
 * CF-A.S1's plan (content/specs/CF.md "Opens with"): the whole song at full length from the first save, intro 4,
 * verse 8, chorus 8, verse 8, chorus 8, bridge 8, chorus 8, outro 4: 56 bars, 2:14 at 100 BPM. Kick, snare and
 * hats per section, a plain chord loop under the verse and the chorus, roots on the beat in the bass, and the
 * bridge as one marked slot (diatonic chords ending on V, to be rewritten). No tune yet: CF-A.S3 adds the tunes.
 * It already meets the bridge and the length and has none of the six devices, so it fails on the devices alone.
 */
const CF_A_TEMPLATE = [
  "setcpm(100/4)",
  "",
  "// The plan: intro 4, verse 8, chorus 8, verse 8, chorus 8, bridge 8, chorus 8, outro 4 = 56 bars, 2:14.",
  'const kickVerse = s("bd ~ bd ~")',
  'const kickChorus = s("⟪bd ~ bd ~⟫")',
  'const kickBridge = s("bd ~ ~ ~")',
  'const kickOutro = s("bd ~ ~ ~")',
  'const snareVerse = s("~ sd ~ sd")',
  'const snareChorus = s("~ sd ~ sd")',
  'const snareBridge = s("~ ~ sd ~")',
  'const hatsIntro = s("hh*4").gain(.4)',
  'const hatsVerse = s("hh*8").gain(.4)',
  'const hatsChorus = s("⟪hh*8⟫").gain(.45)',
  'const hatsBridge = s("hh*4").gain(.4)',
  'const bassVerse = n("<0 5 3 4>").struct("x*4")',
  'const bassChorus = n("<3 4 0 0>").struct("x*4")',
  'const bassBridge = n("<5 5 3 3 1 1 4 4>").struct("x ~ x ~")',
  'const chordsIntro = chord("<C Am>").voicing()',
  'const chordsVerse = chord("<C Am F G>").voicing()',
  'const chordsChorus = chord("<F G C C>").voicing()',
  'const chordsBridge = chord("⟪<Am Am F F Dm Dm G G>⟫").voicing()',
  'const chordsOutro = chord("<F G C C>").voicing()',
  "",
  "kick: arrange([4, silence], [8, kickVerse], [8, kickChorus], [8, kickVerse], [8, kickChorus], [8, kickBridge], [8, kickChorus], [4, kickOutro])",
  "snare: arrange([4, silence], [8, snareVerse], [8, snareChorus], [8, snareVerse], [8, snareChorus], [8, snareBridge], [8, snareChorus], [4, silence])",
  "hats: arrange([4, hatsIntro], [8, hatsVerse], [8, hatsChorus], [8, hatsVerse], [8, hatsChorus], [8, hatsBridge], [8, hatsChorus], [4, silence])",
  'bass: arrange([4, silence], [8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus], [8, bassBridge], [8, bassChorus], [4, silence]).scale("C2:major").s("ebass").lpf(600)',
  'chords: arrange([4, chordsIntro], [8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus], [8, chordsBridge], [8, chordsChorus], [4, chordsOutro]).s("piano").gain(.5)',
].join("\n");

/** A single's plan: `[bars, Section]`, in order. */
type SinglePlan = readonly (readonly [number, string])[];
interface SingleSpec {
  bpm: number;
  plan: SinglePlan;
  /** Lines that play the same thing throughout (drums), written first. */
  plain?: readonly string[];
  /** The arranged tracks in order: role → Section → the section's pattern. */
  parts: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Per role, a section that plays another section's const (`Chorus2: "Chorus"`) or rests (`null`). */
  uses?: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  /** Per role, the chain after `arrange()`: the key plan, the sound, the effects. */
  tails: Readonly<Record<string, string>>;
}
/** A single in the STYLE §10 shape: the consts each track uses, one `arrange()` per track, the same plan. */
const single = (o: SingleSpec): string => {
  const consts: string[] = [];
  const tracks = [...(o.plain ?? [])];
  for (const [role, sections] of Object.entries(o.parts)) {
    const ref = (s: string): string | null => {
      const u = o.uses?.[role]?.[s];
      return u === null ? null : (u ?? s);
    };
    const used = new Set(o.plan.map(([, s]) => ref(s)));
    for (const [s, pattern] of Object.entries(sections))
      if (used.has(s)) consts.push(`const ${role}${s} = ${pattern}`);
    const sections_ = o.plan.map(
      ([bars, s]) => `[${bars}, ${ref(s) === null ? "silence" : `${role}${ref(s)}`}]`,
    );
    tracks.push(`${role}: arrange(${sections_.join(", ")})${o.tails[role] ?? ""}`);
  }
  return [`setcpm(${o.bpm}/4)`, "", ...consts, "", ...tracks].join("\n");
};

const POP_PLAN: SinglePlan = [
  [8, "Verse"],
  [8, "Chorus"],
  [8, "Verse"],
  [8, "Chorus"],
  [8, "Bridge"],
  [8, "Chorus"],
  [8, "Chorus2"],
];
interface PopSingle {
  plan?: SinglePlan;
  verse?: string;
  bassVerse?: string;
  /** The last chorus a whole step up (a `chordsChorus2` and the key plan after `arrange()`); default true. */
  lift?: boolean;
  /** The bass's rhythm: between the beats by default (the syncopated bass). */
  groove?: string;
  /** The verse's cadence: C held over G, then B (the 4–3 suspension); `false` lands straight on B. */
  suspension?: boolean;
}
/**
 * The pop single (content/specs/finale-reference.ts, CF.md "Tests"): C major at 100 BPM, verse chorus verse chorus
 * bridge chorus and a last chorus a whole step up, 56 bars, 134.4 s. V7/vi to vi in the chorus (E7 to Am); the
 * minor iv and ♭VI–♭VII in the bridge (Fm, A♭, B♭); the lift; a 4–3 suspension at the verse's cadence; a bass
 * that lands between the beats. Five devices: ♭VII beside ♭VI is a borrowed chord, not a modal colour.
 */
const popSingle = (o: PopSingle = {}): string => {
  const lift = o.lift ?? true;
  const plan = (o.plan ?? POP_PLAN).map(([b, s]) =>
    !lift && s === "Chorus2" ? ([b, "Chorus"] as const) : ([b, s] as const),
  );
  const bars = plan.reduce((n, [b]) => n + b, 0);
  const keys = (octave: number) =>
    lift ? `"<C${octave}:major!${bars - 8} D${octave}:major!8>"` : `"C${octave}:major"`;
  const groove = o.groove ?? "x ~ ~ x ~ x ~ ~";
  return single({
    bpm: 100,
    plan,
    plain: ['kick: s("bd ~ bd ~").gain(.8)', 'snare: s("~ sd ~ sd").gain(.8)', 'hats: s("hh*8").gain(.4)'],
    parts: {
      bass: {
        Verse: `${o.bassVerse ?? 'n("<0 5 3 4>")'}.struct("${groove}")`,
        Chorus: `n("<3 4 2 5 3 4 0 0>").struct("${groove}")`,
        Bridge: 'n("<3 3 0 0 5b 6b 4 4>").struct("x ~ x ~")',
      },
      chords: {
        Verse: `chord("${o.verse ?? "<C Am F G>"}").voicing()`,
        Chorus: 'chord("<F G E7 Am F G C C>").voicing()',
        Bridge: 'chord("<Fm Fm C C Ab Bb G G>").voicing()',
        Chorus2: 'chord("<G A F#7 Bm G A D D>").voicing()',
      },
      mel: {
        Verse: `n("<[4 ~ 4 2] [0 ~ ~ ~] [3 4 5 7] ${o.suspension === false ? "[6 ~ ~ ~]" : "[7@2 6@2]"}>")`,
        Chorus: 'n("<[7 ~ 7 5] [8 ~ 8 ~] [9 8 6 4#] [5 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 9] [7 ~ ~ ~] ~>")',
        Bridge: 'n("<[5b ~ 4 3] [5b ~ 4 ~] [4 ~ 2 0] ~ [7 ~ 5b 4] [8 ~ 6b 3] [8 ~ ~ ~] [6 ~ ~ ~]>")',
      },
    },
    uses: { bass: { Chorus2: "Chorus" }, mel: { Chorus2: "Chorus" } },
    tails: {
      bass: `.scale(${keys(2)}).s("ebass").lpf(700)`,
      chords: '.s("piano").gain(.5).room(.3)',
      mel: `.scale(${keys(4)}).s("piano").room(.25)`,
    },
  });
};

/**
 * Indie, exactly four devices: C major at 84 BPM, verse chorus verse bridge chorus outro, 44 bars (125.7 s). The
 * verse turns I–♭VII–IV–I (C B♭ F C: the Mixolydian colour) with the tune singing the ♭7, B♭; the chorus pulls
 * through D7 to G (V7/V) and holds D over C before falling to C (a 9–8 suspension); the bridge is eight bars in A
 * minor (the key plan after `arrange()`), Am F Dm E twice: E major, A minor's own V with its G♯, makes A the home
 * of the bridge rather than vi of C. A plain bass, no borrowed chord. Clean guitar, acoustic lead, LinnDrum.
 */
const CF_A_INDIE = single({
  bpm: 84,
  plan: [
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Verse"],
    [8, "Bridge"],
    [8, "Chorus"],
    [4, "Outro"],
  ],
  parts: {
    kick: { Verse: 's("bd ~ ~ ~ bd ~ ~ ~")', Chorus: 's("bd ~ bd ~ bd ~ bd ~")', Bridge: 's("bd ~ ~ ~")' },
    snare: { Verse: 's("~ ~ sd ~")', Chorus: 's("~ sd ~ sd")', Bridge: 's("~ ~ sd ~")' },
    hats: { Verse: 's("hh*8").gain(.35)', Chorus: 's("[hh hh hh oh]*2").gain(.4)' },
    bass: {
      Verse: 'n("<0 6b 3 0>")',
      Chorus: 'n("<3 4 0 5 3 1 4 4>")',
      Bridge: 'n("<0 5 3 4 0 5 3 4>")',
      Outro: 'n("<3 0>")',
    },
    chords: {
      Verse: 'chord("<C Bb F C>").voicing()',
      Chorus: 'chord("<F G C Am F D7 G G>").voicing()',
      Bridge: 'chord("<Am F Dm E Am F Dm E>").voicing()',
      Outro: 'chord("<F C>").voicing()',
    },
    mel: {
      Verse: 'n("<[4 ~ 4 2] [6b ~ 3 ~] [5 ~ 3 ~] [2 ~ ~ ~]>")',
      Chorus: 'n("<[7 ~ 5 3] [4 ~ 6 8] [8@2 7@2] [5 ~ ~ ~] [7 ~ 5 3] [8 ~ 7 3#] [4 ~ 6 ~] [4 ~ ~ ~]>")',
      Bridge: 'n("<[4 ~ 2 0] [2 ~ ~ ~] [3 ~ 2 0] [4 ~ ~ ~] [4 ~ 2 0] [2 ~ 0 ~] [3 ~ 2 1] [4 ~ ~ ~]>")',
      Outro: 'n("<[3 ~ 5 ~] [0 ~ ~ ~]>")',
    },
  },
  uses: {
    kick: { Outro: null },
    snare: { Outro: null },
    hats: { Bridge: null, Outro: null },
  },
  tails: {
    kick: '.bank("LinnDrum")',
    snare: '.bank("LinnDrum")',
    hats: '.bank("LinnDrum")',
    bass: '.scale("<C2:major!24 A1:minor!8 C2:major!12>").s("ebass").lpf(700)',
    chords: '.s("cleangtr").gain(.5)',
    mel: '.scale("<C4:major!24 A3:minor!8 C4:major!12>").s("acgtr").room(.25)',
  },
});

/**
 * Jazz-soul, four devices: F major at 76 BPM, verse chorus verse bridge chorus, 40 bars (126.3 s), sevenths on
 * Rhodes over an upright that lands between the beats (the syncopated bass). The chorus opens IV–iv–I (B♭^7 to the
 * borrowed B♭m7, the tune falling la to le, D to D♭, with it); the bridge is a chain of dominants A7 D7 G7, each resolving by root into the next and the last
 * into C7 (secondary dominants); the verse's cadence holds F over C7 and falls to E (a 4–3 suspension). No key change.
 */
const CF_A_JAZZ = single({
  bpm: 76,
  plan: [
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Verse"],
    [8, "Bridge"],
    [8, "Chorus"],
  ],
  plain: [
    'kick: s("bd ~ ~ bd").gain(.7)',
    'snare: s("~ sd ~ sd").velocity("1 .4 1 .4").gain(.6)',
    'hats: s("rd*8").swingBy(1/3, 4).gain(.4)',
  ],
  parts: {
    bass: {
      Verse: 'n("<0 5 1 4>").struct("x ~ ~ x ~ ~ x ~")',
      Chorus: 'n("<3 3 0 5 1 4 0 0>").struct("x ~ ~ x ~ ~ x ~")',
      Bridge: 'n("<2 2 5 5 1 1 4 4>").struct("x ~ ~ x ~ ~ x ~")',
    },
    chords: {
      Verse: 'chord("<F^7 Dm7 Gm7 C7>").voicing()',
      Chorus: 'chord("<Bb^7 Bbm7 F^7 D7 Gm7 C7 F^7 F^7>").voicing()',
      Bridge: 'chord("<A7 A7 D7 D7 G7 G7 C7 C7>").voicing()',
    },
    mel: {
      Verse: 'n("<[4 ~ 2 4] [5 ~ 2 ~] [1 ~ 4 7] [7@2 6@2]>")',
      Chorus: 'n("<[5 ~ 4 2] [5b ~ 4 ~] [4 ~ 2 0] [2 ~ 0 ~] [3 ~ 1 3] [4 ~ 3 1] [2 ~ ~ ~] ~>")',
      Bridge: 'n("<[4# ~ 6 4#] [4# ~ ~ ~] [2 ~ 0# ~] [0# ~ ~ ~] [1 ~ 3# ~] [6 ~ ~ ~] [4 ~ 3 2] [4 ~ ~ ~]>")',
    },
  },
  tails: {
    bass: '.scale("F2:major").s("upright").lpf(900)',
    chords: '.s("rhodes").gain(.5).room(.3)',
    mel: '.scale("F4:major").s("jazzgtr").room(.3)',
  },
});

/**
 * Funk, four devices: E at 104 BPM, verse chorus verse chorus bridge chorus and a last chorus a half step up, 56
 * bars (129.2 s). The verse is an E Dorian groove on i and IV (Em7 A7) with C♯, the Dorian 6, on beat 1 (modal
 * colour); the chorus, in E minor, reaches B7 through F♯7 (V7/V) and the bridge through D7 to G (V7/III); a
 * sixteenth-note bass that pushes off the beat; the last chorus lifted to F minor (a `chordsChorus2` and the key plan).
 */
const CF_A_FUNK = single({
  bpm: 104,
  plan: POP_PLAN,
  plain: [
    'kick: s("bd ~ ~ bd ~ ~ bd ~").gain(.8)',
    'snare: s("~ ~ sd ~ ~ ~ sd ~").gain(.8)',
    'hats: s("hh*16").velocity("[1 .35 .6 .35]*4").gain(.5)',
  ],
  parts: {
    bass: {
      Verse: 'n("<[0 ~ ~ 0 ~ ~ 4 ~ 0 ~ ~ 0 ~ 4 ~ ~] [3 ~ ~ 3 ~ ~ 6 ~ 3 ~ ~ 3 ~ 4 ~ ~]>")',
      Chorus: 'n("<5 6 4 0 5 1 4 4>").struct("x ~ ~ x ~ ~ x ~ x ~ ~ x ~ x ~ ~")',
      Bridge: 'n("<3 3 6 6 2 2 1 4>").struct("x ~ ~ x ~ ~ x ~ x ~ ~ x ~ x ~ ~")',
    },
    chords: {
      Verse: 'chord("<Em7 A7>").voicing()',
      Chorus: 'chord("<C^7 D7 Bm7 Em7 C^7 F#7 B7 B7>").voicing()',
      Bridge: 'chord("<Am7 Am7 D7 D7 G^7 G^7 F#7 B7>").voicing()',
      Chorus2: 'chord("<Db^7 Eb7 Cm7 Fm7 Db^7 G7 C7 C7>").voicing()',
    },
    mel: {
      Verse: 'n("<[4 ~ 5 4] [5 ~ 3 ~] [4 ~ 5 7] [5 ~ ~ ~]>")',
      Chorus: 'n("<[7 ~ 6 4] [5 ~ 3 ~] [4 ~ 6 ~] [0 ~ ~ ~] [7 ~ 6 4] [8 ~ 3# ~] [8 ~ 6# 4] [4 ~ ~ ~]>")',
      Bridge: 'n("<[3 ~ 2 0] [3 ~ ~ ~] [5 ~ 3 ~] [5 ~ ~ ~] [6 ~ 4 2] [4 ~ ~ ~] [3# ~ 1 ~] [6# ~ ~ ~]>")',
    },
  },
  uses: { bass: { Chorus2: "Chorus" }, mel: { Chorus2: "Chorus" } },
  tails: {
    bass: '.scale("<E2:dorian!8 E2:minor!8 E2:dorian!8 E2:minor!24 F2:minor!8>").s("fingerbass").lpf(800)',
    chords: '.s("organ").gain(.45)',
    mel: '.scale("<E4:dorian!8 E4:minor!8 E4:dorian!8 E4:minor!24 F4:minor!8>").s("piano")',
  },
});

/** Exported for the CF-A golden test (content/core/capstones/CF-A): the pieces the brief's tests grade. */
export const CF_A_PIECES = {
  template: CF_A_TEMPLATE,
  pop: popSingle(),
  /** Six devices: the pop single with a Mixolydian verse, I–♭VII–IV–V (C B♭ F G). */
  six: popSingle({ verse: "<C Bb F G>", bassVerse: 'n("<0 6b 3 4>")' }),
  indie: CF_A_INDIE,
  jazzSoul: CF_A_JAZZ,
  funk: CF_A_FUNK,
  /** Three devices: no lift and a bass on the beat (secondary dominant, borrowed chord, suspension). */
  three: popSingle({ lift: false, groove: "x ~ x ~" }),
  /** No bridge: the bridge's eight bars are a third verse. */
  noBridge: popSingle({ plan: POP_PLAN.map(([b, s]) => [b, s === "Bridge" ? "Verse" : s] as const) }),
  /** 48 bars at 100 BPM, 115.2 s: the second verse cut. */
  short: popSingle({ plan: POP_PLAN.filter((_, i) => i !== 2) }),
} as const;

// --- CF-T Standard Transcription (author:finale) -------------------------------------------------------------

/**
 * CF-T's matchers (contracts §6.6 CF-T; the grader's `STANDARD_LADDER_MATCHERS`, which L8 grades with). The bass
 * as X2's (the ladder's L3 bass matcher: notes and rhythm, octave-free); the changes by numeral at seventh depth,
 * one bar at a time, a right root with the wrong quality earning nothing for its bar (d11), the bass weighed apart
 * because it has its own check first; the tune key-relative, as the L5 and L6 song tunes.
 */
export const CF_T_BASS: Matcher = X2_BASS;
export const CF_T_CHANGES: Matcher = {
  m: "harmony",
  level: "rn",
  qualityDepth: "seventh",
  inversion: false,
  harmonicRhythm: "given",
  weights: { bass: 0 },
  wrongQuality: "none",
};
export const CF_T_MELODY: Matcher = {
  m: "melody",
  pitch: "key-relative",
  wPitch: 0.6,
  wRhythm: 0.4,
  rhythmTol: [1, 32],
  track: "@melody",
};
/** What every session tells the learner (CF.md "What is given"): meter, key, home note and pickup; never the form. */
const CF_T_GIVEN = { meter: true, key: true, tonic: true, pickup: true } as const;
/**
 * The form map that opens CF-T.S1: the whole chorus cut into sections and lettered by shape, graded against the
 * chosen song's `answerKey.sections` (`gradeFormMap`; AABA, X X Y X and "verse verse bridge verse" are one answer).
 */
export const CF_T_FORM_MAP: FormMapCheck = {
  id: "form-map",
  vocabulary: "letters",
  boundaries: "asked",
  pass: TRANSCRIBE_PASS["CF-T"].formMap,
  given: CF_T_GIVEN,
};
/** The four eight-bar sections every CF-T standard is cut into (`answerKey.phrases` agree with `sections`). */
const CF_T_SECTIONS = [1, 2, 3, 4] as const;
/**
 * CF-T's checks by session (content/specs/CF.md): one eight-bar section at a time, so feedback comes after eight
 * bars and a 15-minute learner can stop on a passed section. S1: the form map, then the bass of each section once
 * the map has passed (or was revealed). S2: the changes, once every bass section is settled. S3: the tune, once the
 * changes are. S4 has no phrase check: its rubric grades the arrangement.
 */
export const CF_T_CHECKS: readonly PhraseCheck[][] = [
  CF_T_SECTIONS.map(
    (n): PhraseCheck => ({
      id: `bass-${n}`,
      phrase: n,
      layer: "bass",
      pass: TRANSCRIBE_PASS["CF-T"].bass,
      matcher: CF_T_BASS,
      after: [CF_T_FORM_MAP.id],
      ...(n === 1 ? { given: CF_T_GIVEN } : {}),
    }),
  ),
  CF_T_SECTIONS.map(
    (n): PhraseCheck => ({
      id: `changes-${n}`,
      phrase: n,
      layer: "chords",
      pass: TRANSCRIBE_PASS["CF-T"].changesPerBar,
      matcher: CF_T_CHANGES,
      after: CF_T_SECTIONS.map((b) => `bass-${b}`),
    }),
  ),
  CF_T_SECTIONS.map(
    (n): PhraseCheck => ({
      id: `melody-${n}`,
      phrase: n,
      layer: "melody",
      pass: TRANSCRIBE_PASS["CF-T"].melody,
      matcher: CF_T_MELODY,
      after: CF_T_SECTIONS.map((b) => `changes-${b}`),
    }),
  ),
];
/**
 * CF-T.S4's own rubric (feature `capstone.session-rubric`), graded in capstone mode on the whole arrangement with
 * the chosen song's sections for `@song`: the four parts, the song's own sections in order (an intro before and an
 * outro after are welcome; a second chorus is not the song's form), and the song's changes bar by bar (`song-kept`,
 * three bars in four, after any intro: corrections pass, theory-g 3, where 32 bars of one chord passed). The
 * arrangement's taste is not graded, and neither is its melody (the rubric cannot read the song's tune yet).
 */
export const CF_T_ARRANGE_RUBRIC: RubricRule[] = [
  req("roles", "Drums, bass, chords and melody", ["F06"], {
    rule: "tracks",
    min: 4,
    roles: ["drums", "bass", "chords", "melody"],
  }),
  req("form", "The song's own sections, in order (an intro and an ending are welcome)", ["F03"], {
    rule: "form",
    pattern: "@song",
    extra: ["intro", "outro"],
  }),
  req("changes", "The song's changes, bar by bar", ["F03"], {
    rule: "custom",
    fn: "song-kept",
    params: { minRatio: 0.75 },
  }),
];

/**
 * Liner-note seeds for the release dialog (ux §5, "write a one-line liner note"): first lines the learner
 * can take, edit or ignore. `{bars}` and `{bpm}` are filled from the released piece. They describe what
 * the brief made the learner write, never how well it went; the tutor's own note is separate (§10.6).
 */
export const CAPSTONE_LINER_SEEDS: Readonly<Partial<Record<CapstoneId, readonly string[]>>> = {
  C0: [
    "The album opens on {bars} bars of drums at {bpm} BPM: snare on 2 and 4, hats underneath, a fill to hand over.",
    "A count-in for everything that follows. The last bar breaks the pattern on purpose.",
    "Kick, snare and hats, one line each. The fill is the only bar that changes.",
  ],
  C1: [
    "Four bars at {bpm} BPM: a groove, a bass line written note by note, and a two-bar riff on top.",
    "The bass walks underneath; the riff says its line twice.",
    "The first loop with notes in it. Drums from the intro, a bass and a riff of my own.",
  ],
  C2: [
    "Eight bars at {bpm} BPM: four chords go round for six bars, then the last two land on home.",
    "The tune starts with one idea in bar 1 and brings it back later in the song.",
    "My first song with chords and a tune: loop, then land.",
  ],
  X1: [
    "A folk song taken down by ear, phrase by phrase, then its chords from the bass up.",
    "Four phrases and their chords, written from listening. The arrangement around them is mine.",
    "The tune came first, one phrase at a time; the bass line told me the chords.",
  ],
  C3: [
    "{bars} bars at {bpm} BPM: a verse, a chorus that lifts, and both again.",
    "The chorus climbs above the verse and the drums push harder; the bass rides the kick all the way.",
    "My first song in sections: verse, chorus, verse, chorus.",
  ],
  C4: [
    "A minor ballad at {bpm} BPM: the verse turns i–VI–III–VII, the chorus comes home through the major V.",
    "The tune leans on ♭3 and ♭6; the G♯ in the chorus pulls it back to A.",
    "{bars} bars in A minor, slow, ending on 1 over i.",
  ],
  C5: [
    "Two choruses of a 12-bar shuffle at {bpm} BPM, dominant sevenths all the way.",
    "The riff calls in the first chorus; in the second it gets an answer.",
    "Swung hats, a turnaround on V, and blue notes where the riff bends.",
  ],
  X2: [
    "A blues taken down by ear: the bass first, then the changes, then the tune line by line.",
    "The bass told me the changes; the tune came last, four bars at a time.",
    "An old blues written from listening, its shuffle kept. The arrangement around it is mine.",
  ],
  C6: [
    "{bars} bars at {bpm} BPM in one mode, and it never goes home to major or minor.",
    "A vamp that stays: the home chord keeps coming back and the colour note sits on the beat.",
    "The hook leans on the one note that makes the mode; the tune answers it.",
  ],
  C7: [
    "{bars} bars at {bpm} BPM: a verse that leans, a chorus that ends on ♭VI, ♭VII and I, and a last chorus a step higher.",
    "Two chords from outside the key and one key change: the colour is in the chorus, the lift is the ending.",
    "The last chorus comes back higher with everything in it.",
  ],
  "CF-T": [
    "A standard from the 1920s taken down by ear: the form first, then the bass, the changes and the tune.",
    "Thirty-two bars, and the form told me most of them: three sections alike and a bridge.",
    "An old standard written from listening, its swing kept. The arrangement around it is mine.",
  ],
  "CF-A": [
    "{bars} bars at {bpm} BPM: my own song, from the first verse through the bridge to the last chorus.",
    "A verse, a chorus that lands, and a bridge that goes somewhere else.",
    "The last track of Side A, written from the groove up.",
  ],
};

/**
 * The question the release dialog asks above the learner's one line (content/specs U09–U11, "the learner's
 * inputs at release"): about what they made, never about how well it went.
 */
export const CAPSTONE_LINER_PROMPTS: Readonly<Partial<Record<CapstoneId, string>>> = {
  C3: "What makes your chorus lift?",
  C4: "What does the minor key do for this song?",
  C5: "Where does your second chorus go that the first does not?",
  X2: "What did you hear first, and what took longest?",
  C6: "Why this mode, and where does your vamp make its colour note heard?",
  C7: "Where does your song lift, and why did you put the colours where they are?",
  "CF-T": "What did the form tell you before you wrote a note?",
  "CF-A": "What is this song about?",
};

export const capstones: readonly CapstoneDef[] = [
  compose({
    id: "C0",
    title: "C0 Intro",
    objective: "A 4–8 bar drum intro: backbeat, 8th or 16th hats, a fill; first album track.",
    opensAfter: { checkpoints: ["U01.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    brief:
      "Write a 4 to 8 bar drum intro for your album: a backbeat, steady hats, and a fill in the last bar.",
    starter: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")',
    skills: ["R04", "R05", "R07"],
    // §6.6 names two one-off checks, `hats-grid` and `fill-last-bar` (CUSTOM_RUBRIC_FNS). Until @oak/grader
    // registers them, C0 grades the same ideas with implemented rules: closed hats on every 8th of bar 1
    // (16ths contain the 8ths), the backbeat in bars 1–3 (the last bar is free for the fill), and the
    // fill written as bar-level variation with `< >`, the U01.L07 way, read by its effect: the last bar changes
    // (custom `bars-differ` with `last`, corrections gate).
    rubric: [
      req("meter", "In 4/4, 4 to 8 bars long", ["R03"], { rule: "bars", min: 4, max: 8 }),
      req("drum-lines", "At least two drum lines", ["R04"], { rule: "tracks", min: 2, roles: ["drums"] }),
      req("snare-backbeat", "Snare on beats 2 and 4 in bars 1 to 3", ["R04"], {
        rule: "onsets",
        track: "@drums",
        drum: "snare",
        contains: [
          [1, 4],
          [3, 4],
          [5, 4],
          [7, 4],
          [9, 4],
          [11, 4],
        ],
        perBar: false,
      }),
      req("hats-grid", "Closed hats on every eighth of bar 1 (or every sixteenth)", ["R05", "R07"], {
        rule: "onsets",
        track: "@drums",
        drum: "hatClosed",
        contains: [
          [0, 1],
          [1, 8],
          [1, 4],
          [3, 8],
          [1, 2],
          [5, 8],
          [3, 4],
          [7, 8],
        ],
        perBar: false,
      }),
      // Corrections gate (AS-32): the last bar itself changes; a `< >` that puts the fill in bar 1 does not count.
      req("fill", "A fill: the last bar changes, written with `< >`", ["R07"], {
        rule: "custom",
        fn: "bars-differ",
        params: { last: true, alsoUses: ["tb.mini.alt"] },
      }),
      tempo(70, 140),
    ],
    sessions: [["Intro", "A 4–8 bar drum intro: backbeat, 8th or 16th hats, a fill; first album track."]],
    canDo: ["cd.compose.drum-intro"],
    hints: ladder(
      "What does a listener need to hear before the band comes in?",
      "The snare marks beats 2 and 4; the last bar is where the fill goes.",
      'Try toms in the last bar: `s("<[~ sd ~ sd] [~ sd ~ sd] [~ sd ~ sd] [ht mt lt lt]>")`.',
    ),
    tests: [
      {
        name: "the starter: one bar, no fill",
        response: { code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")' },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "four bars, tom fill in bar 4",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd] [~ sd ~ sd] [~ sd ~ sd] [sd sd ht lt]>")\nhats: s("<hh*8 hh*8 hh*8 [hh hh hh hh ~ ~ ~ ~]>")',
        },
        expect: "pass",
      },
      {
        name: "eight bars, sixteenth hats, crash and fill",
        response: {
          code: 'setcpm(124/4)\n\nkick: s("<[bd ~ bd ~]!7 [bd bd ~ ~]>")\nsnare: s("<[~ sd ~ sd]!7 [[sd sd] [mt mt] [lt lt] [lt ~]]>")\nhats: s("<hh*16!7 ~>")\nperc: s("<cr ~ ~ ~ ~ ~ ~ ~>")',
        },
        expect: "pass",
      },
      {
        name: "no backbeat",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd bd bd bd")\nsnare: s("<[sd ~ ~ ~]!3 [ht mt lt lt]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "too fast",
        response: {
          code: 'setcpm(160/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]!3 [ht mt lt lt]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // The reference intro: kick pushes into bar 2, the hats drop out for a sixteenth-note snare and tom
      // run in bar 4 that hands the downbeat back to bar 1.
      {
        name: "reference: four bars with a sixteenth-note fill",
        response: { code: C0_REFERENCE },
        expect: "pass",
      },
      // Known-weak pieces, one per required rule (the other rules hold).
      {
        name: "weak: two bars only",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd] [~ sd [ht lt] sd]>")\nhats: s("hh*8")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: quarter-note hats",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("<[~ sd ~ sd]!3 [~ sd ht lt]>")\nhats: s("hh*4")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // The same bar four times is, to the grader, one bar repeated: it fails the length and the fill.
        name: "weak: one bar repeated, no fill",
        response: {
          code: 'setcpm(100/4)\n\nkick: s("[bd ~ bd ~]!4").slow(4)\nsnare: s("[~ sd ~ sd]!4").slow(4)\nhats: s("hh*32").slow(4)',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  compose({
    id: "C1",
    title: "C1 First Loop",
    objective: "A 4-bar loop: groove, note-name bass (ebass unlocks at the start), 2-bar riff.",
    opensAfter: { checkpoints: ["U02.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    brief: "A 4-bar loop: a groove, a bass line written with note names, and a 2-bar riff on top.",
    starter:
      'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("⟪c2 c2 g1 a1⟫").s("ebass").lpf(600)\nmel: note("⟪e4 g4 a4 g4⟫").s("piano")',
    skills: ["R04", "P02", "P05"],
    rubric: [
      req("roles", "Drums, bass and melody", ["R04"], {
        rule: "tracks",
        min: 3,
        roles: ["drums", "bass", "melody"],
      }),
      req("bars", "Exactly 4 bars", ["R03"], { rule: "bars", min: 4, max: 4 }),
      ...backbeat,
      req("bass-range", "Bass between C1 and C3", ["P05"], {
        rule: "range",
        track: "@bass",
        within: ["c1", "c3"],
      }),
      req("bass-pitches", "Bass uses at least 3 different notes", ["P02"], {
        rule: "distinct-pitches",
        track: "@bass",
        min: 3,
      }),
      req("riff-range", "Riff spans at most 15 half steps", ["P03"], {
        rule: "range",
        track: "@melody",
        maxSpan: 15,
      }),
      tempo(70, 140),
    ],
    sessions: [
      ["First Loop", "A 4-bar loop: groove, note-name bass (ebass unlocks at the start), 2-bar riff."],
    ],
    canDo: ["cd.compose.first-loop"],
    hints: ladder(
      "Which part holds the floor of the loop?",
      "The bass line sits under C3; give it three different notes.",
      'A two-bar riff: a first bar, then one that answers it, `note("<[c4 e4 g4 e4] [d4 g4 a4 g4]>")`. The bass can walk the band\'s chords: c, g, a, f.',
    ),
    tests: [
      {
        name: "the starter: one bar",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("c2 c2 g1 a1").s("ebass").lpf(600)\nmel: note("e4 g4 a4 g4").s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "four bars, riff answers itself",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<[c2 ~ c2 g1] [g1 ~ g1 d2] [a1 ~ a1 e2] [f1 ~ f1 c2]>").s("ebass").lpf(600)\nmel: note("<[c4 e4 g4 e4] [d4 g4 b4 g4] [c4 e4 a4 e4] [c4 f4 a4 ~]>").s("piano")',
        },
        expect: "pass",
      },
      {
        name: "two-bar ideas filling four bars, at 120",
        response: {
          code: 'setcpm(120/4)\n\nkick: s("bd ~ [~ bd] ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*16").gain(.5)\nbass: note("<c2 g1 a1 f1>").s("ebass").lpf(600)\nmel: note("<[c5 ~ a4 g4] [~ g4 a4 d5]>").s("piano")',
        },
        expect: "pass",
      },
      {
        name: "bass too high",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<c3 e3 g3 e3>").s("ebass").lpf(600)\nmel: note("<[c4 e4 g4 e4] [c4 e4 g4 c5]>").s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "no melody",
        response: {
          code: 'setcpm(96/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")\nbass: note("<c2 g1 a1 f1>").s("ebass").lpf(600)',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // The reference loop: a bass on C, G, A and F (the Band's chords) that adds each root's fifth on beat
      // 4, under a two-bar riff whose notes sit inside the chord of every bar.
      { name: "reference: walking bass, two-bar riff", response: { code: c1Loop() }, expect: "pass" },
      // Known-weak pieces, one per required rule (the other rules hold).
      {
        name: "weak: snare on 1 and 3",
        response: { code: c1Loop({ snare: "sd ~ sd ~" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a two-note bass",
        response: { code: c1Loop({ bass: "<[c2 ~ c2 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [g1 ~ g1 g1]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a riff that leaps two octaves",
        response: { code: c1Loop({ mel: "<[c4 ~ g4 c6] [g5 e5 ~ c4]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: too slow",
        response: { code: c1Loop({ bpm: 64 }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  compose({
    id: "C2",
    title: "C2 Four-Chord Song",
    objective: "Chords loop then land; a melody over the changes that reuses its bar-1 idea.",
    opensAfter: { checkpoints: ["U07.CP"] },
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    bpm: [70, 140],
    brief:
      "Loop, then land: a four-chord schema in bars 1–6, a cadence in bars 7–8, and a melody built on its bar-1 idea, which comes back, the same or moved onto another chord, in half the bars or more.",
    starter: C2_TEMPLATE,
    skills: ["H04", "H03", "M03", "M02"],
    // The binding rubric of contracts §6.6. `schema` reads bars 1–6 only (`bars`), so the landing in bars
    // 7–8 belongs to the `cadence` rule; any rotation of I V vi IV counts, bars 5–6 being its first two
    // chords again. Chords compare on the triad core, so sevenths pass.
    rubric: [
      req("bars", "8 bars", ["F01"], { rule: "bars", min: 8, max: 8 }),
      req("roles", "Chords and a melody", ["H04"], { rule: "tracks", min: 2, roles: ["chords", "melody"] }),
      req("schema", "Bars 1–6: a four-chord loop, one chord a bar", ["H04"], {
        rule: "progression",
        schema: "schema.axis",
        allowRotation: true,
        bars: [1, 6],
      }),
      req("cadence", "Bars 7–8 land on I: V then I, or IV then I", ["H03"], {
        rule: "cadence",
        types: ["PAC", "IAC", "PC"],
        at: "last",
      }),
      req("chord-tones", "Chord notes on beats 1 and 3", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.6,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      req("range", "The tune within 19 half steps", ["M01"], {
        rule: "range",
        track: "@melody",
        maxSpan: 19,
      }),
      // `shape: "either"`: a bar that moves the idea by degrees (the sequence of U07.L02, C E G over C, then
      // A C E over Am) counts as the idea, as it does in U07.L10; in half steps only, every move onto a chord
      // of the other quality was refused, so a tune built the way the course teaches it failed (review).
      req("motif", "Repeat or vary your bar-1 idea in half the bars or more", ["M02"], {
        rule: "motif-reuse",
        track: "@melody",
        minRatio: 0.5,
        shape: "either",
      }),
      opt("ends-home", "The tune ends on 1", ["M01"], {
        rule: "ends-on-degree",
        degrees: ["1"],
        track: "@melody",
      }),
    ],
    sessions: [
      ["Chords", 'Chords: schema loop in bars 1–6, cadence in bars 7–8 ("loop, then land").'],
      ["Melody", "Melody over the changes; vary the bar-1 idea; release."],
    ],
    sessionExtras: [
      { starter: C2_TEMPLATE, focusRules: ["bars", "schema", "cadence"] },
      { focusRules: ["roles", "chord-tones", "range", "motif", "ends-home"] },
    ],
    canDo: ["cd.compose.fourchord"],
    // One ladder serves both sessions, so each rung speaks to the chords (C2.S1) and to the tune (C2.S2).
    hints: ladder(
      "Where does the loop stop looping? And where does your tune play its first bar again?",
      "Bars 7 and 8 carry the ending: the chord on 5 then the chord on 1, or the chord on 4 then the chord on 1. For the tune, play bar 1's shape again from the next chord's notes, the way a sequence did in Motif & Variation, in at least half the bars.",
      "Keep the loop for six bars, then two new chords for bars 7 and 8; under C G Am F that means `… G C>`. A tune that starts `[0 2 4 2]` can go on `[4 6 8 6] [5 7 9 7] [3 5 7 5]`: bar 1, moved onto each chord.",
    ),
    tests: [
      {
        name: "the starter: the loop, no landing, no tune",
        response: { code: stripMarkers(C2_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: I V vi IV, I V, then V–I; bar 1 returns in bar 5",
        response: { code: c2Song() },
        expect: "pass",
      },
      {
        name: "minimal: the template landed on G C, two chord notes a bar",
        response: { code: c2Song({ mel: C2_MINIMAL_TUNE }) },
        expect: "pass",
      },
      {
        name: "indie: the rotation vi IV I V, then IV–I (plagal), on guitar",
        response: {
          code: c2Song({
            chords: "<Am F C G Am F F C>",
            bass: "<5 3 0 4 5 3 3 0>",
            mel: C2_INDIE_TUNE,
            chordSound: "acgtr",
            drums: "bd ~ [~ bd] ~, ~ sd ~ sd, hh*8",
          }),
        },
        expect: "pass",
      },
      {
        // Seventh-chord symbols in `chord()` unlock later (U11–U12); stacked in `n` they are open since
        // U06.L10: Cmaj7 G7 Am7 Fmaj7 Cmaj7 G7 G7 Cmaj7.
        name: "jazz-soul: hand-stacked sevenths on rhodes, upright bass (the triad core is what counts)",
        response: {
          code: c2Song({
            bpm: 84,
            bassSound: "upright",
            chordsLine:
              'chords: n("<[0,2,4,6] [4,6,8,10] [5,7,9,11] [3,5,7,9] [0,2,4,6] [4,6,8,10] [4,6,8,10] [0,2,4,6]>").scale("C3:major").s("rhodes")',
          }),
        },
        expect: "pass",
      },
      {
        name: "funk: 112 BPM, a sixteenth-note bass on the roots, beyond the brief",
        response: {
          code: c2Song({
            bpm: 112,
            drums: "bd ~ ~ bd ~ ~ bd ~, ~ sd ~ sd, hh*16",
            bassTail: '.struct("x ~ x x ~ x ~ x x ~ x x ~ x ~ x")',
            chordSound: "organ",
          }),
        },
        expect: "pass",
      },
      {
        // Review: bar 1 (C E G over C) comes back moved by degrees over Am in bar 3 (A C E), whose 3rds
        // differ in half steps; with bars 4, 5 and 7 that is half the bars. Passed only once the rule read
        // shapes in degrees as well as in half steps (`shape: "either"`); before, it counted 3 of 8.
        name: "a sequence by degrees: bar 1 back over Am, F, C and G, then home",
        response: {
          code: c2Song({
            mel: "<[0 ~ 2 4] [4 ~ 1 ~] [5 ~ 7 9] [3 ~ 5 7] [0 ~ 2 4] [6 ~ 4 ~] [4 ~ 6 8] [7 ~ ~ ~]>",
          }),
        },
        expect: "pass",
      },
      // Known-weak pieces, one per required rule (the others hold).
      {
        name: "weak: the loop broken in bar 3 (ii for vi)",
        response: { code: c2Song({ chords: "<C G Dm F C G G C>", bass: "<0 4 1 3 0 4 4 0>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: bars 7–8 still loop, no landing",
        response: { code: c2Song({ chords: "<C G Am F C G Am F>", bass: "<0 4 5 3 0 4 5 3>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: no idea comes back",
        response: {
          code: c2Song({
            mel: "<[0 2 4 2] [6 ~ 4 1] [5 9 ~ 7] [7 ~ 3 5] [4 7 2 ~] [1 ~ 8 4] [4 1 6 ~] [7 ~ ~ ~]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a tune that leaps over two octaves",
        response: { code: c2Song({ mel: C2_TUNE.replace("[5 7 9 7]", "[5 -7 16 7]") }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a step off the chord on beats 1 and 3",
        response: {
          code: c2Song({
            mel: "<[1 3 5 3] [5 7 9 7] [6 8 10 8] [4 6 8 6] [1 3 5 3] [5 7 9 7] [9 7 5 ~] [8 ~ ~ ~]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // Clusters (C D E for C) are not triads: the progression reads no chord in bar 1 (pinned since the
        // grader learned to refuse them; before, `progression` took a cluster for its triad core).
        name: "weak: the loop played as clusters of neighbouring notes",
        response: {
          code: c2Song({
            chordsLine:
              'chords: n("<[0,1,2] [4,5,6] [5,6,7] [3,4,5] [0,1,2] [4,5,6] [4,5,6] [0,1,2]>").scale("C3:major").s("piano")',
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: twelve bars",
        response: {
          code: c2Song({
            chords: "<C G Am F C G Am F C G G C>",
            bass: "<0 4 5 3 0 4 5 3 0 4 4 0>",
            mel: "<[0 2 4 2] [4 6 8 6] [5 7 9 7] [3 5 7 5] [0 2 4 2] [4 6 8 6] [5 7 9 7] [3 5 7 5] [0 2 4 2] [4 6 8 6] [8 6 4 ~] [7 ~ ~ ~]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  transcribe({
    id: "X1",
    title: "X1 Folk Transcription",
    objective: "Aura Lee or Red River Valley by ear, phrase by phrase, then chords bass-first.",
    opensAfter: {
      checkpoints: ["U07.CP"],
      capstones: ["C2"],
      familyLevels: [{ family: "fam.mel.dictation", level: 4 }],
    },
    meter: "4/4",
    song: ["song.aura-lee", "song.red-river-valley"],
    sessions: [
      ["Phrases 1–2", "Phrases 1–2 of Aura Lee or Red River Valley, by ear, checked per phrase."],
      ["Phrases 3–4", "Phrases 3–4."],
      ["Chords", "Chords bass-first, arrange, review, release."],
    ],
    sessionExtras: X1_CHECKS.map((checks) => ({ checks: [...checks] })),
    canDo: ["cd.transcribe.folk-tune"],
  }),
  compose({
    id: "C3",
    title: "C3 Verse–Chorus Demo",
    objective: "A verse–chorus demo with contrasting sections, at least 90 seconds long.",
    opensAfter: { checkpoints: ["U09.CP"] },
    meter: "4/4",
    bpm: [70, 140],
    // No key: the song is in whatever key the learner writes it (the analysis reads it from the code).
    brief:
      "Verse, chorus, verse, chorus, 90 seconds or more, no intro. The chorus lifts: it differs from the verse in two ways or more (higher tune, busier drums, new chords, more parts). The bass lands with the kick. Key, tempo (70–140 BPM), groove, chords, tunes and sounds are yours; start from the template or paste your C2 in as the verse.",
    starter: C3_TEMPLATE,
    skills: ["F02", "F05", "B04"],
    minDurationSec: 90,
    // The binding rubric of contracts §6.6, in the Wave 5 shapes (content/specs/U09.md C3). `groove-lock` takes
    // the kick out of any drum track, so a `kick:` line and a whole-kit `drums:` line both work.
    rubric: [
      req("form", "Verse, chorus, verse, chorus", ["F02"], {
        rule: "form",
        pattern: "verse chorus verse chorus",
      }),
      req("contrast", "The chorus differs from the verse on two counts or more", ["F02", "F05"], {
        rule: "contrast",
        a: { section: "chorus" },
        b: { section: "verse" },
        axes: ["pitch", "density", "harmony", "register", "energy"],
        minAxes: 2,
      }),
      req("duration", "At least 90 seconds", ["F06"], { rule: "duration-sec", min: 90 }),
      req("groove-lock", "Bass lands with the kick", ["B04"], {
        rule: "groove-lock",
        kick: "@drums",
        bass: "@bass",
        min: 0.5,
      }),
      req("leadsheet", "The lead sheet writes your song exactly", ["N07"], {
        rule: "notates",
        view: "lead-sheet",
      }),
    ],
    sessions: [
      ["Groove & changes", "Groove and changes for verse and chorus."],
      ["Melodies", "Melodies and section contrast."],
      // Contracts 1.6 (decision of 2026-11-13, d13): four sessions. The third arranges the song and makes the
      // lead sheet write it exactly; the fourth is the take (the whole song in real time, 90 seconds or more),
      // Claude's review and the release. A learner part-way through the old S3 keeps the draft and every check.
      ["Arrange", "Arrange V C V C; lead sheet."],
      ["Take & release", "Record the full take, review, release."],
    ],
    sessionExtras: [
      { starter: C3_TEMPLATE, focusRules: ["groove-lock"] },
      { focusRules: ["contrast", "groove-lock"] },
      { focusRules: ["form", "contrast", "duration", "groove-lock", "leadsheet"] },
      { focusRules: ["form", "contrast", "duration", "groove-lock", "leadsheet"] },
    ],
    canDo: ["cd.compose.verse-chorus"],
    // One ladder for the four sessions: the lock (S1), the lift (S2), the length and the page (S3, S4).
    hints: ladder(
      "A listener knows the chorus has come when several things change at once: the tune moves up, the drums get busier, the chords start somewhere new. Which of those has your chorus changed so far?",
      "The checklist line for the chorus names what already differs, and the form strip shows each section's bars and parts. For the lock, give the bass the kick's rhythm const with `.struct()`, as in Lock with the Kick. For the length: at 100 BPM a bar lasts 2.4 seconds.",
      "Lift the chorus tune a few degrees above the verse's and put `oh` into `hatsChorus`; give the last chorus 16 bars (`[16, chordsChorus]` on every arranged track), or slow the song to 84 BPM.",
    ),
    tests: [
      {
        name: "the starter: 16 bars, no tune, a bass on eighths off the kick",
        response: { code: stripMarkers(C3_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: 100 BPM, the last chorus twice as long (40 bars, 96 s), the chorus higher with open hats",
        response: { code: c3Song({ plan: C3_LONG }) },
        expect: "pass",
      },
      {
        name: "minimal: 32 bars at 80 BPM (96 s), the chorus only higher and on new chords",
        response: {
          code: c3Song({
            bpm: 80,
            consts: { kickChorus: 's("bd").struct(groove)', hatsChorus: 's("hh*8").gain(.4)' },
          }),
        },
        expect: "pass",
      },
      {
        name: "pop, beyond the brief: a second chorus tune (melChorus2) that climbs to the top in its last bars",
        response: {
          code: c3Song({
            plan: [...VCVC.slice(0, 3), [16, "Chorus2"]],
            more: [
              'const kickChorus2 = s("bd").struct(push)',
              'const hatsChorus2 = s("[hh hh hh oh]*2").gain(.5)',
              'const chordsChorus2 = chord("<F G C C>").voicing()',
              'const bassChorus2 = n("<3 4 0 0>").struct(push).scale("C2:major")',
              'const melChorus2 = n("<[5 7 5 3] [6 ~ 4 ~] [7 9 11 9] [9 8 7 ~] [5 7 10 7] [8 ~ 6 4] [7 9 11 14] [11 9 7 ~]>").scale("C4:major")',
            ],
          }),
        },
        expect: "pass",
      },
      {
        // Half-time drums (the snare on 3), the bass on the kick's whole notes in the verse; the chorus adds
        // a pad and sings an octave above the verse.
        name: "indie: 84 BPM, 32 bars (91 s), LinnDrum, acoustic guitar, a pad only in the chorus",
        response: {
          code: c3Song({
            bpm: 84,
            consts: {
              groove: '"x ~ ~ ~"',
              push: '"x ~ ~ x ~ ~ x ~"',
              hatsVerse: 's("hh*4").gain(.4)',
              hatsChorus: 's("hh*8").gain(.5)',
              chordsVerse: 'chord("<Am F C G>").voicing()',
              chordsChorus: 'chord("<F G C Am>").voicing()',
              bassVerse: 'n("<5 3 0 4>").struct(groove).scale("C2:major")',
              bassChorus: 'n("<3 4 0 5>").struct(push).scale("C2:major")',
              melVerse: 'n("<[2 ~ 0 ~] [3 ~ 5 ~] [4 ~ 2 0] [1 ~ ~ ~]>").scale("C4:major")',
              melChorus: 'n("<[10 ~ 12 10] [8 ~ 6 ~] [7 ~ 9 ~] [9 ~ ~ ~]>").scale("C4:major")',
            },
            more: ['const padChorus = chord("<F G C Am>").voicing()'],
            tracks: { snare: 'snare: s("~ ~ sd ~").bank("LinnDrum")' },
            extraTracks: [
              `pad: ${arr("pad", [
                [8, "silence"],
                [8, "Chorus"],
                [8, "silence"],
                [8, "Chorus"],
              ])}.s("pad").gain(.5)`,
            ],
            sounds: { chords: "acgtr", bank: "LinnDrum" },
          }),
        },
        expect: "pass",
      },
      {
        // Sixteenth-note kick rhythms, each shared by the fingerbass; organ chords, a Rhodes lead.
        name: "funk: 104 BPM, 40 bars (92 s), a sixteenth-note bass on the kick's const, TR-808",
        response: {
          code: c3Song({
            bpm: 104,
            plan: C3_LONG,
            consts: {
              groove: '"x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~"',
              push: '"x ~ x x ~ ~ x ~ x ~ x ~ x ~ ~ x"',
              hatsVerse: 's("hh*16").gain(.3)',
              hatsChorus: 's("[hh hh oh hh]*4").gain(.35)',
            },
            sounds: { chords: "organ", bass: "fingerbass", mel: "rhodes", bank: "RolandTR808" },
          }),
        },
        expect: "pass",
      },
      {
        // Swing is not unlocked at C3 (U11.L07), so the jazz-soul flavour plays straight: hand-stacked
        // sevenths (Fmaj7 Dm7 B♭maj7 C7, then B♭maj7 C7 Am7 Dm7) on Rhodes, upright bass, in F.
        name: "jazz-soul: 80 BPM in F, 32 bars (96 s), hand-stacked sevenths on Rhodes, upright bass",
        response: {
          code: c3Song({
            bpm: 80,
            consts: {
              chordsVerse: 'n("<[0,2,4,6] [5,7,9,11] [3,5,7,9] [4,6,8,10]>").scale("F3:major")',
              chordsChorus: 'n("<[3,5,7,9] [4,6,8,10] [2,4,6,8] [5,7,9,11]>").scale("F3:major")',
              bassVerse: 'n("<0 5 3 4>").struct(groove).scale("F2:major")',
              bassChorus: 'n("<3 4 2 5>").struct(push).scale("F2:major")',
              melVerse: 'n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("F4:major")',
              melChorus: 'n("<[7 ~ 5 7] [6 ~ 4 ~] [6 ~ 4 2] [5 ~ ~ ~]>").scale("F4:major")',
            },
            sounds: { chords: "rhodes", bass: "upright" },
          }),
        },
        expect: "pass",
      },
      // Known-wrong pieces, one per required rule (the others hold).
      {
        name: "weak: verse, chorus, verse, verse",
        response: {
          code: c3Song({
            plan: [...VCVC.slice(0, 3), [16, "Verse"]],
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a chorus that changes only its chords",
        response: {
          code: c3Song({
            bpm: 80,
            consts: {
              kickChorus: 's("bd").struct(groove)',
              hatsChorus: 's("hh*8").gain(.4)',
              bassChorus: 'n("<3 4 0 0>").struct(groove).scale("C2:major")',
              melChorus: 'n("<[2 ~ 4 2] [0 ~ 2 ~] [3 ~ 5 3] [1 ~ ~ ~]>").scale("C4:major")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: 32 bars at 100 BPM is 77 seconds",
        response: { code: c3Song() },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a bass on straight eighths against a kick on 1 and the and of 2",
        response: {
          code: c3Song({
            bpm: 80,
            consts: {
              groove: '"x ~ ~ x ~ ~ ~ ~"',
              push: '"x ~ ~ x ~ ~ ~ ~"',
              bassVerse: 'n("<0 5 3 4>").struct("x*8").scale("C2:major")',
              bassChorus: 'n("<3 4 0 0>").struct("x*8").scale("C2:major")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // Triplets, quintuplets and 32nds all engrave exactly; eleven notes in one beat do not.
        name: "weak: an eleven-note run squeezed into one beat, which no lead sheet writes exactly",
        response: {
          code: c3Song({
            bpm: 80,
            consts: {
              melChorus:
                'n("<[[5 7 5 3 2 1 0 1 2 3 4] ~ ~ ~] [6 ~ 4 ~] [7 9 11 9] [9 8 7 ~]>").scale("C4:major")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet", "staff.not-exact"],
      },
      {
        // contracts §6.3 item 8: the bass lists its sections in another order than the other tracks.
        name: "weak: the bass arranged verse, chorus, chorus, verse while the rest is V C V C",
        response: {
          code: c3Song({
            bpm: 80,
            tracks: {
              bass: `bass: ${arr("bass", [VC[0], VC[1], VC[1], VC[0]] as Plan)}.s("ebass").lpf(600)`,
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet", "form.inconsistent-arrange"],
      },
    ],
  }),
  compose({
    id: "C4",
    title: "C4 Minor Indie Ballad",
    objective: "An Aeolian verse i–VI–III–VII and a chorus cadence with the major V.",
    opensAfter: { checkpoints: ["U10.CP"] },
    meter: "4/4",
    // The analysis runs in A minor (contracts §6.8 item 1); a piece in another key reads a message naming it.
    key: { tonic: "A", mode: "minor" },
    bpm: [60, 95],
    brief:
      "A slow minor ballad in A minor, 60 to 95 BPM. The verse loops i–VI–III–VII (Am F C G); the chorus finds its own chords and lands with the major V, E with its G♯, then i. Your tune sings ♭3 and ♭6 and ends on 1 over Am. Groove, tempo, both tunes, the form and the sounds are yours.",
    starter: C4_TEMPLATE,
    skills: ["H08", "H09", "S05"],
    // The binding rubric of contracts §6.6 in the Wave 5 shapes (content/specs/U10.md C4): the verse rule reads
    // the verse only (`section`), so the chorus is free; the ending reads the chord under the last note (`over`).
    rubric: [
      req("aeolian", "The verse loops i–VI–III–VII", ["H08"], {
        rule: "progression",
        schema: "schema.aeolian",
        section: { section: "verse" },
      }),
      req("major-v", "A major V (with the raised 7) that goes home to i", ["H09"], {
        rule: "contains-rn",
        rn: ["V"],
        min: 1,
        mustResolve: true,
      }),
      req("minor-colour", "The tune sings ♭3 and ♭6", ["S05"], {
        rule: "degree-set",
        track: "@melody",
        contains: ["b3", "b6"],
      }),
      req("ends-on-1", "The tune ends on 1 over i", ["S05"], {
        rule: "ends-on-degree",
        degrees: ["1"],
        track: "@melody",
        over: "i",
      }),
      tempo(60, 95),
    ],
    sessions: [
      ["Aeolian verse", "Aeolian verse i–VI–III–VII."],
      ["Chorus cadence", "Chorus cadence with the major V; release."],
    ],
    sessionExtras: [
      { starter: C4_TEMPLATE, focusRules: ["aeolian", "minor-colour", "tempo"] },
      { focusRules: ["aeolian", "major-v", "minor-colour", "ends-on-1", "tempo"] },
    ],
    canDo: ["cd.compose.minor-ballad"],
    hints: ladder(
      "Which chord makes a minor key sound as if it has to go home?",
      "The chord on 5 pulls home only with the raised 7th: in A minor that is E major, with G♯, not E minor. For the colour, the tune needs C (♭3) and F (♭6) somewhere; its very last note is A, over Am.",
      'End the chorus on `E Am>` and put an F into the verse tune over the F chord: in `.scale("A3:minor")` that is ♭6, `n` 5.',
    ),
    tests: [
      {
        name: "the starter: the verse alone, a tune on A with no ♭3 or ♭6, no V",
        response: { code: stripMarkers(C4_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: 80 BPM, Am F C G verse, Dm G E Am chorus, piano",
        response: { code: c4Song() },
        expect: "pass",
      },
      {
        name: "minimal: verse and chorus once each (16 bars) at 64 BPM",
        response: { code: c4Song({ bpm: 64, plan: VC }) },
        expect: "pass",
      },
      {
        // The Andalusian descent (U10.L07) twice in the chorus, the tune climbing through G♯ into A.
        name: "indie: 72 BPM, acoustic guitar with room, an Andalusian chorus Am G F E into i",
        response: {
          code: c4Song({
            bpm: 72,
            consts: {
              chordsChorus: 'chord("<Am G F E Am G E Am>").voicing()',
              bassChorus: 'n("<0 6 5 4 0 6 4 0>").scale("A1:minor")',
              melChorus:
                'note("<[c5 b4 a4 ~] [b4 ~ g4 ~] [a4 ~ f4 ~] [g#4 ~ e4 ~] [c5 ~ e5 ~] [d5 ~ b4 ~] [b4 a4 g#4 ~] [a4 ~ ~ ~]>")',
            },
            tracks: {
              chords: `chords: ${arr("chords", VCVC)}.s("acgtr").room(.3)`,
            },
            sounds: { bank: "LinnDrum" },
          }),
        },
        expect: "pass",
      },
      {
        // Seventh chords by name unlock at U11–U12, so the jazz-soul voicings are hand-stacked note names:
        // Am7 Fmaj7 Cmaj7 G7, then Dm7 G7 E7 Am7 (E7 is V: the rubric reads the triad core).
        name: "jazz-soul: 68 BPM, hand-voiced sevenths on Rhodes, upright bass, E7 as the V",
        response: {
          code: c4Song({
            bpm: 68,
            consts: {
              chordsVerse: 'note("<[a2,c3,e3,g3] [f2,a2,c3,e3] [c3,e3,g3,b3] [g2,b2,d3,f3]>")',
              chordsChorus: 'note("<[d3,f3,a3,c4] [g2,b2,d3,f3] [e3,g#3,b3,d4] [a2,c3,e3,g3]>")',
            },
            sounds: { chords: "rhodes", bass: "upright" },
          }),
        },
        expect: "pass",
      },
      {
        name: "funk: 92 BPM, a sixteenth-note fingerbass under the same chords, TR-808",
        response: {
          code: c4Song({
            bpm: 92,
            consts: {
              hatsVerse: 's("hh*16").gain(.3)',
              hatsChorus: 's("[hh hh oh hh]*4").gain(.35)',
              bassVerse: 'n("<0 5 2 6>").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").scale("A1:minor")',
              bassChorus: 'n("<3 6 4 0>").struct("x ~ x x ~ ~ x ~ x ~ x ~ x ~ ~ x").scale("A1:minor")',
            },
            sounds: { chords: "organ", bass: "fingerbass", mel: "rhodes", bank: "RolandTR808" },
          }),
        },
        expect: "pass",
      },
      {
        // U10.L09's ballad texture: strings and a delayed piano in the chorus only.
        name: "beyond the brief: strings in the chorus, the tune echoing through `.delay()`",
        response: {
          code: c4Song({
            bpm: 70,
            sounds: { melTail: ".delay(.3)" },
            extraTracks: [
              `pad: ${arr("pad", [
                [8, "silence"],
                [8, "Chorus"],
                [8, "silence"],
                [8, "Chorus"],
              ])}.s("strings").gain(.5)`,
            ],
          }).replace("\n\nkick:", '\nconst padChorus = chord("<Dm G E Am>").voicing()\n\nkick:'),
        },
        expect: "pass",
      },
      // Known-wrong pieces, one per required rule (the others hold).
      {
        name: "weak: a verse on iv (Am F Dm G) is not the Aeolian loop",
        response: {
          code: c4Song({
            consts: {
              chordsVerse: 'chord("<Am F Dm G>").voicing()',
              bassVerse: 'n("<0 5 3 6>").scale("A1:minor")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the chorus lands Em to Am (the minor v, no G♯)",
        response: { code: c4Song({ consts: { chordsChorus: 'chord("<Dm G Em Am>").voicing()' } }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: E goes on to Dm, never home to Am",
        response: {
          code: c4Song({
            consts: {
              chordsChorus: 'chord("<F E Dm Am>").voicing()',
              bassChorus: 'n("<5 4 3 0>").scale("A1:minor")',
              melChorus: 'n("<[5 7 5 ~] [4 ~ 1 ~] [3 5 3 ~] [0 ~ ~ ~]>").scale("A3:minor")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a tune with ♭3 but no ♭6",
        response: {
          code: c4Song({
            consts: {
              melVerse: 'n("<[4 ~ 2 ~] [7 ~ 9 ~] [4 ~ 2 ~] [1 ~ ~ ~]>").scale("A3:minor")',
              melChorus: 'n("<[3 7 3 7] [6 8 10 8] [8 ~ 4 ~] [7 ~ ~ ~]>").scale("A3:minor")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the last note is C over Am (ends on ♭3)",
        response: {
          code: c4Song({
            consts: { melChorus: 'n("<[3 5 7 5] [6 8 10 8] [8 ~ 4 ~] [9 ~ ~ ~]>").scale("A3:minor")' },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: 110 BPM is no ballad",
        response: { code: c4Song({ bpm: 110 }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // contracts §6.3 item 8: the chords list their sections in another order than the other tracks.
        name: "weak: the chords arranged verse, chorus, chorus, verse while the rest is V C V C",
        response: {
          code: c4Song({
            tracks: { chords: `chords: ${arr("chords", [VC[0], VC[1], VC[1], VC[0]] as Plan)}.s("piano")` },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet", "form.inconsistent-arrange"],
      },
    ],
  }),
  compose({
    id: "C5",
    title: "C5 12-Bar Shuffle",
    objective: "Two choruses of 12-bar blues with a shuffle feel, a turnaround and a riff.",
    opensAfter: { checkpoints: ["U11.CP"] },
    meter: "4/4",
    // The analysis runs in C (contracts §6.8 item 1): bar 12's V and the blue notes are read in the brief's key.
    key: { tonic: "C", mode: "blues" },
    bpm: [80, 140],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "Two choruses of a 12-bar blues in C, 80–140 BPM, shuffled: swung 8ths on the hats. Every chord a dominant seventh, standard or quick change, V in bar 12. A riff that comes back, ♭3 or ♭5 in the tune at least twice, a second chorus that answers the first. Tempo, groove, riff and sounds are yours.",
    starter: C5_TEMPLATE,
    skills: ["H10", "F04", "R13", "M08"],
    // The binding rubric of contracts §6.6 in the Wave 5 shapes (content/specs/U11.md C5). `blues-form` counts
    // choruses on the piece as written (the `arrange()` total), so the second chorus is a section of the tune.
    rubric: [
      req("form", "A 12-bar blues, two choruses or more", ["F04", "H10"], {
        rule: "blues-form",
        variant: "standard",
        choruses: 2,
        quickChangeOk: true,
      }),
      req("sevenths", "Every chord a dominant seventh", ["C06"], {
        rule: "chord-qualities",
        track: "@chords",
        subsetOf: ["7"],
        depth: "seventh",
      }),
      req("swing", "Swung 8ths on the hats", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums"],
        drums: ["hatClosed", "hatOpen", "ride"],
        subdivision: 8,
        ratio: [1.6, 2.4],
      }),
      req("turnaround", "Bar 12 turns round on V", ["H10"], {
        rule: "contains-rn",
        rn: ["V", "V7"],
        min: 1,
        section: { bars: [12, 12] },
      }),
      req("blue-notes", "♭3 or ♭5 in the tune, twice or more", ["S11"], {
        rule: "degree-set",
        track: "@melody",
        anyOf: ["b3", "b5"],
        minCount: 2,
      }),
      req("riff", "The riff comes back", ["M08"], { rule: "motif-reuse", track: "@melody", minRatio: 0.6 }),
    ],
    sessions: [
      ["Changes & riff", "Changes, shuffle feel and riff."],
      ["Second chorus", "Second chorus, turnaround, call and response; release."],
    ],
    sessionExtras: [
      { starter: C5_TEMPLATE, focusRules: ["sevenths", "swing", "turnaround", "riff"] },
      { focusRules: ["form", "sevenths", "swing", "turnaround", "blue-notes", "riff"] },
    ],
    canDo: ["cd.compose.twelve-bar"],
    hints: ladder(
      "What makes a shuffle lean, and where does a blues turn round to start again?",
      "Swing the hats with `.swingBy(1/3, 4)`: eighths move, quarter notes stay. Bar 12 is the turnaround, V7 pulling back to bar 1. The blue notes are the key's ♭3 and ♭5: in C, E♭ and G♭.",
      "Give the tune two 12-bar sections, `mel: arrange([12, melChorus], [12, melChorus2])`: chorus 1 plays the riff; chorus 2 calls with it in the first two bars of each line and answers in the next two.",
    ),
    tests: [
      {
        name: "the starter: one chorus, straight hats, bar 12 on I, no blue note",
        response: { code: stripMarkers(C5_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: the standard form at 112, swung hats, a boogie bass, the riff then call and answer",
        response: { code: c5Song() },
        expect: "pass",
      },
      {
        name: "minimal: the riff on every bar of both choruses, no bass, at 90",
        response: {
          code: c5Song({ bpm: 90, bass: null, melChorus2: riffChorus(BLUES_STANDARD) }),
        },
        expect: "pass",
      },
      {
        name: "indie: the quick change at 96, acoustic guitar, a lighter swing on the tune",
        response: {
          code: c5Song({
            bpm: 96,
            bars: BLUES_QUICK,
            melSwing: ".swingBy(.25, 4)",
            sounds: { chords: "acgtr", bank: "LinnDrum" },
          }),
        },
        expect: "pass",
      },
      {
        // The turnaround split in two: bar 11 I–IV, bar 12 I–V; the ride carries the swing.
        name: "jazz-soul: 132 BPM, Rhodes and upright, swung ride, the turnaround [C7 F7] [C7 G7]",
        response: {
          code: c5Song({
            bpm: 132,
            changes: "<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 [C7 F7] [C7 G7]>",
            bars: BLUES_QUICK,
            hats: 'drums: s("rd*8").swingBy(1/3, 4).gain(.5)',
            // Bars 11–12 follow the split turnaround: C then F, C then G.
            bass: `bass: note("<${BLUES_QUICK.slice(0, 10)
              .map((c) => BOOGIE[c])
              .join(" ")} [c2 e2 f2 a2] [c2 e2 g2 b2]>").s("upright")`,
            sounds: { chords: "rhodes", mel: "rhodes" },
          }),
        },
        expect: "pass",
      },
      {
        // The fingerbass doubles the riff two octaves down, swung with it.
        name: "funk: 100 BPM, swung hats, the riff doubled by the fingerbass, TR-808",
        response: {
          code: c5Song({
            bpm: 100,
            bass: `bass: note("${riffChorus(BLUES_STANDARD, {
              C7: "[c2 eb2 e2 g2 ~ g2 bb2 ~]",
              F7: "[f2 ab2 a2 c3 ~ c3 eb3 ~]",
              G7: "[g2 bb2 b2 d3 ~ d3 f3 ~]",
            })}").swingBy(1/3, 4).s("fingerbass")`,
            sounds: { chords: "organ", mel: "rhodes", bank: "RolandTR808" },
          }),
        },
        expect: "pass",
      },
      {
        // contracts §6.4: capstone mode reads the length from the code, so one 24-bar tune line counts as two.
        name: "two choruses written as one 24-bar line instead of arrange()",
        response: {
          code: c5Song({
            oneChorus: true,
            melChorus: `<${[riffChorus(BLUES_STANDARD), answerChorus(BLUES_STANDARD)].map((x) => x.slice(1, -1)).join(" ")}>`,
          }),
        },
        expect: "pass",
      },
      // Known-wrong pieces, one per required rule (the others hold).
      {
        name: "weak: one chorus only",
        response: { code: c5Song({ oneChorus: true }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: IV and V swapped in bars 9 and 10",
        response: {
          code: c5Song({
            changes: "<C7 C7 C7 C7 F7 F7 C7 C7 F7 G7 C7 G7>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a C triad in bar 1",
        response: { code: c5Song({ changes: "<C C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: straight hats (only the tune swings)",
        response: { code: c5Song({ hats: 'hats: s("hh*8").gain(.5)' }) },
        expect: "fail",
        feedback: ["rubric.unmet", "rhythm.swing-missing"],
      },
      {
        name: "weak: bar 12 stays on I in both choruses",
        response: { code: c5Song({ changes: "<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 C7>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a riff with no ♭3 or ♭5 (major 3rds only)",
        response: {
          code: (() => {
            const plain = {
              C7: "[c4 e4 f4 g4 ~ g4 a4 ~]",
              F7: "[f4 a4 bb4 c5 ~ c5 d5 ~]",
              G7: "[g4 b4 c5 d5 ~ d5 e5 ~]",
            };
            return c5Song({
              melChorus: riffChorus(BLUES_STANDARD, plain),
              melChorus2: answerChorus(BLUES_STANDARD, plain, "[g4 ~ f4 ~ e4 ~ c4 ~]"),
            });
          })(),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a tune that never says the same bar twice",
        response: {
          code: c5Song({
            oneChorus: true,
            melChorus: `<${Array.from(
              { length: 24 },
              (_, i) =>
                `[c4 eb4 ${["d4", "f4", "a4", "b4", "e4", "g4"][i % 6]} ${["g4", "c5", "e4", "d5", "f4", "a4", "b3"][i % 7]}]`,
            ).join(" ")}>`,
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  transcribe({
    id: "X2",
    title: "X2 Blues Transcription",
    objective: "St. Louis Blues (1914) 12-bar strain or Careless Love: bass, changes, then melody.",
    opensAfter: { capstones: ["C5"] },
    meter: "4/4",
    song: ["song.st-louis-blues", "song.careless-love"],
    sessions: [
      [
        "Bass & changes",
        "A pre-1930 12-bar blues from the repertoire (Careless Love; St. Louis Blues (1914) once a verified answer key exists): bass, then changes.",
      ],
      ["Melody", "Melody, review, release."],
    ],
    sessionExtras: X2_CHECKS.map((checks) => ({ checks: [...checks] })),
    canDo: ["cd.transcribe.blues"],
  }),
  compose({
    id: "C6",
    title: "C6 Modal Vamp",
    objective: "A Mixolydian or Dorian vamp that makes its characteristic tone heard.",
    opensAfter: { checkpoints: ["U14.CP"] },
    meter: "4/4",
    bpm: [80, 130],
    brief:
      'A modal vamp, 16 bars or more at 80–130 BPM, Mixolydian or Dorian, on a home note you choose. Put the colour note (♭7, or the raised 6) on beat 1 or 3, keep the home chord coming back, and leave out the 7th a half step below home, or ♭6. For Dorian: `.scale("D4:dorian")` and `chord("<Dm7 G7>")`. The rest is yours.',
    starter: C6_TEMPLATE,
    skills: ["S12", "H11"],
    rubric: [
      // Contracts §6.6 C6 in one rule (content-kit `mode`): the characteristic tone (Mixolydian ♭7 or Dorian
      // ♮6) on a strong beat twice or more, no leading tone (Mixolydian) or no ♭6 (Dorian), and the tonic chord
      // in at least 40% of the bars. The learner chooses the mode and the tonic (`anyOf`, `tonic: "declared"`:
      // the first `.scale()` of the piece).
      req(
        "mode",
        "It sounds Mixolydian or Dorian: the colour note (♭7, or the raised 6) on beat 1 or 3 twice or more, the home chord in 40% of the bars or more, no 7th a half step below home (Mixolydian) and no ♭6 (Dorian)",
        ["S12", "H11"],
        {
          rule: "mode",
          tonic: "declared",
          mode: "mixolydian",
          anyOf: ["mixolydian", "dorian"],
          requireCharacteristic: true,
        },
      ),
      req("bars", "At least 16 bars, written out", ["F01"], { rule: "bars", min: 16 }),
    ],
    sessions: [
      ["The vamp", "Mixolydian or Dorian vamp and characteristic tone."],
      ["Melody, groove, release", "Melody, groove, release."],
    ],
    sessionExtras: [{ starter: C6_TEMPLATE, focusRules: ["mode"] }, { focusRules: ["mode", "bars"] }],
    canDo: ["cd.compose.modal-vamp"],
    hints: ladder(
      "Which one note makes your mode sound unlike major or minor, and where in the bar does the ear catch it?",
      "In G Mixolydian it is F natural (`n` 6 on the mode), in D Dorian B natural (`n` 5). Put it on beat 1 or 3 of the hook or the tune, twice or more, and keep the home chord in about half the bars.",
      "For sixteen bars, give each track sections: a `melTune` const for the tune and `mel: arrange([4, silence], [8, melTune], [4, silence])`, with the same 4 + 8 + 4 bars on every arranged track.",
    ),
    tests: [
      {
        name: "the starter: a two-bar loop (the F chord already puts the ♭7 on beat 1)",
        response: { code: stripMarkers(C6_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: G Mixolydian at 112, I–♭VII–IV–I on organ, a crunch riff on te, vamp–tune–vamp",
        response: { code: c6Song() },
        expect: "pass",
      },
      {
        name: "minimal: the starter's vamp written out to sixteen bars, the line on the mode",
        response: {
          code: 'setcpm(100/4)\n\nconst chordsVamp = chord("<G F>").voicing()\nconst melVamp = n("0 2 4 6").scale("G4:mixolydian")\n\nchords: arrange([16, chordsVamp]).s("piano")\nmel: arrange([16, melVamp]).s("piano")\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.5)',
        },
        expect: "pass",
      },
      {
        name: "indie: D Mixolydian at 96, I–♭VII on acoustic guitar, a clean-guitar tune, room on both",
        response: {
          code: c6Song({
            bpm: 96,
            home: "D",
            chords: "<D C>",
            bass: "<[0 ~ ~ 0] [6 ~ ~ 6]>",
            bassOctave: 2,
            consts: {
              gtrVamp: null,
              melTune:
                'n("<[2 ~ 4 2] [6 ~ 3 1] [4 ~ 2 0] [6 ~ ~ ~] [4 ~ 6 4] [3 ~ 1 ~] [2 ~ 0 ~] [6 ~ ~ ~]>")',
            },
            tracks: { gtr: null },
            sounds: { chords: "acgtr", mel: "cleangtr", bank: "LinnDrum", fx: ".room(.3)" },
          }),
        },
        expect: "pass",
      },
      {
        name: "jazz-soul: D Dorian at 92, Dm7–G7 on Rhodes and upright, a piano tune on the raised 6",
        response: { code: c6Dorian() },
        expect: "pass",
      },
      {
        name: "funk: E Dorian at 104, Em7–A7 pushed an eighth early, a syncopated finger bass, ghosted hats",
        response: {
          code: c6Song({
            bpm: 104,
            home: "E",
            mode: "dorian",
            chords: "<Em7 A7>",
            chordsTail: '.struct("x ~ ~ x ~ ~ x ~").early(1/8)',
            bass: "<[0 ~ 0 [~ 0] ~ 6 ~ 4] [3 ~ 3 [~ 3] ~ 5 ~ 2]>",
            bassOctave: 2,
            consts: {
              kickVamp: 's("bd ~ ~ bd")',
              kickTune: 's("bd ~ [~ bd] bd")',
              gtrVamp: 'n("<[~ 4 ~ 6] [~ 5 ~ 3]>")',
              melTune:
                'n("<[4 ~ 6 4] [5 ~ 3 ~] [6 ~ 4 ~] [5 ~ ~ ~] [4 ~ 6 4] [5 ~ 3 1] [2 ~ 0 ~] [5 ~ ~ ~]>")',
            },
            tracks: { hats: 'hats: s("hh*16").velocity("[1 .3 .6 .3]*4").bank("RolandTR808").gain(.6)' },
            sounds: {
              chords: "rhodes",
              bass: "fingerbass",
              gtr: "cleangtr",
              mel: "cleangtr",
              bank: "RolandTR808",
            },
          }),
        },
        expect: "pass",
      },
      {
        name: "the pop piece moved to A Mixolydian (the home note is the learner's)",
        response: { code: c6Song({ home: "A", chords: "<A G D A>" }) },
        expect: "pass",
      },
      {
        name: "the jazz-soul piece moved to B Dorian",
        response: { code: c6Dorian({ home: "B", chords: "<Bm7 E7>", bassOctave: 1 }) },
        expect: "pass",
      },
      // Known-wrong pieces, each on one part of the mode rule or on the length.
      {
        name: "weak: a D chord in G Mixolydian brings back F♯",
        response: {
          code: c6Song({ chords: "<G F D G>", bass: "<[0 ~ 0 ~] [6 ~ 6 ~] [4 ~ 4 ~] [0 ~ 4 6]>" }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the tune on G4:major (its ♭7s become F♯)",
        response: {
          code: c6Song({
            tracks: { mel: `mel: ${arrIn("mel", C6_PLAN, ["Tune"])}.scale("G4:major").s("piano")` },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: Dorian over Dm7–Gm7 (the B♭ of Gm7 is ♭6)",
        response: { code: c6Dorian({ chords: "<Dm7 Gm7>", bass: "<[0 ~ 4 ~] [3 ~ 4 ~]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // Corrections pass (theory-f 1): the home chord carries the mode's 3rd too, not only its root.
        name: "weak: a D major chord under a D Dorian tune (F♯ under F)",
        response: {
          code: 'setcpm(100/4)\n\nconst chordsVamp = chord("D").voicing()\nconst melVamp = n("5 2 5 2").scale("D4:dorian")\n\nchords: arrange([16, chordsVamp]).s("piano")\nmel: arrange([16, melVamp]).s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: a G minor chord under a G Mixolydian tune (B♭ under B)",
        response: {
          code: 'setcpm(100/4)\n\nconst chordsVamp = chord("Gm").voicing()\nconst melVamp = n("2 0 6 0").scale("G4:mixolydian")\n\nchords: arrange([16, chordsVamp]).s("piano")\nmel: arrange([16, melVamp]).s("piano")',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "minimal Dorian: i–IV written out to sixteen bars, the line on the raised 6",
        response: {
          code: 'setcpm(100/4)\n\nconst chordsVamp = chord("<Dm G>").voicing()\nconst melVamp = n("5 4 5 0").scale("D4:dorian")\n\nchords: arrange([16, chordsVamp]).s("piano")\nmel: arrange([16, melVamp]).s("piano")',
        },
        expect: "pass",
      },
      {
        name: "weak: the Dorian tune on D4:minor (B♭ for B)",
        response: {
          code: c6Dorian({
            tracks: { mel: `mel: ${arrIn("mel", C6_PLAN, ["Tune"])}.scale("D4:minor").s("piano")` },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: I–IV with every ♭7 on beat 2 or 4",
        response: {
          code: c6Song({
            chords: "<G C>",
            bass: "<[0 ~ 0 ~] [3 ~ 3 ~]>",
            consts: {
              gtrVamp: 'n("<[0 6 4 6] [3 6 5 6]>")',
              melTune: 'n("<[4 6 2 6] [3 ~ 5 ~] [4 ~ 2 ~] [0 ~ ~ ~]>")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: G–F–C–F, the home chord in a quarter of the bars",
        response: {
          code: c6Song({ chords: "<G F C F>", bass: "<[0 ~ 0 ~] [6 ~ 6 ~] [3 ~ 3 ~] [6 ~ 6 ~]>" }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // Written as one eight-bar loop: the `mode` line holds, only the length is short.
        name: "weak: an eight-bar loop of the pop piece's chords and tune",
        response: {
          code: 'setcpm(112/4)\n\nchords: chord("<G F C G>").voicing().s("organ")\nbass: n("<[0 ~ 0 ~] [6 ~ 6 ~] [3 ~ 3 ~] [0 ~ 4 6]>").scale("G1:mixolydian").s("ebass").lpf(700)\nmel: n("<[4 ~ 6 4] [3 ~ 1 ~] [5 ~ 3 ~] [6 ~ ~ ~] [4 ~ 6 4] [3 ~ 1 0] [0 ~ 3 5] [4 ~ ~ ~]>").scale("G4:mixolydian").s("piano")\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.5)',
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: an F Lydian vamp, I–II (not one of the two modes)",
        response: { code: c6Song({ home: "F", mode: "lydian", chords: "<F G F C>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the pop piece in plain G major, I–V–IV–I",
        response: {
          code: c6Song({
            mode: "major",
            chords: "<G D C G>",
            bass: "<[0 ~ 0 ~] [4 ~ 4 ~] [3 ~ 3 ~] [0 ~ 4 6]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the jazz-soul piece in plain D minor",
        response: { code: c6Dorian({ mode: "minor", chords: "<Dm7 Gm7>", bass: "<[0 ~ 4 ~] [3 ~ 4 ~]>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // Contracts §6.3 item 8: every arranged track lists the same sections with the same lengths. C6 has no
        // `form` rule, so the disagreement is named (a warning) and the mode and the length still hold.
        name: "sections: the kick arranged 8 + 4 + 4 under a 4 + 8 + 4 tune is named, not failed",
        response: {
          code: c6Song({
            tracks: {
              kick: `kick: ${arr("kick", [
                [8, "Vamp"],
                [4, "Tune"],
                [4, "Vamp"],
              ])}`,
            },
          }),
        },
        expect: "pass",
        feedback: ["form.inconsistent-arrange"],
      },
    ],
  }),
  compose({
    id: "C7",
    title: "C7 Chromatic Colour",
    objective: "Colour chords (a secondary dominant and ♭VI–♭VII–I) and a final-chorus key lift.",
    opensAfter: { checkpoints: ["U17.CP"] },
    meter: "4/4",
    // The analysis runs in C (contracts §6.8 item 1) and follows the tune's key plan from the lift on.
    key: { tonic: "C", mode: "major" },
    bpm: [70, 140],
    brief:
      "A song in C, at least 32 bars at 70–140 BPM, with two colours from outside the key and a lift: a secondary dominant that goes where it points (A7 into Dm), ♭VI–♭VII–I in a row (A♭ B♭ C), and a last chorus of 8+ bars a half or whole step up, same tune. Where they go is yours.",
    starter: C7_TEMPLATE,
    skills: ["H12", "H13", "H14"],
    rubric: [
      // Contracts §6.6 C7 (AUTHORING §19.8): every chord is read in the key in force at its bar, so the lifted
      // chorus's own V–I is not a secondary dominant and its ♭VI–♭VII–I counts in the new key.
      req(
        "secondary",
        "A secondary dominant that goes where it points (A7 into Dm, E7 into Am, D7 into G)",
        ["H12"],
        {
          rule: "contains-rn",
          rn: [],
          kind: ["secondary-dominant"],
          min: 1,
          mustResolve: true,
        },
      ),
      req("mixture", "♭VI, ♭VII, I in a row (A♭, B♭, C in C)", ["H13"], {
        rule: "contains-rn",
        rn: ["bVI", "bVII", "I"],
        min: 1,
        inOrder: true,
      }),
      req(
        "lift",
        "The last chorus comes back a half or a whole step higher, for 8 bars or more, with the same tune",
        ["H14"],
        {
          rule: "key-change",
          at: "last",
          semitones: [1, 2],
          minBarsAfter: 8,
          sameMelody: true,
        },
      ),
      req("bars", "At least 32 bars", ["F02"], { rule: "bars", min: 32 }),
      // The spec's two C7.S2 suggestions (content/specs/U17.md): ticked or unticked lines, never failures.
      opt("chord-tones", "The tune's beats 1 and 3 are chord notes", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.6,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      opt("contrast", "The chorus differs from the verse on two counts or more", ["F02", "F05"], {
        rule: "contrast",
        a: { section: "chorus" },
        b: { section: "verse" },
        axes: ["pitch", "density", "harmony", "register", "energy"],
        minAxes: 2,
      }),
    ],
    sessions: [
      ["Colour chords", "Colour chords: a secondary dominant and ♭VI–♭VII–I."],
      ["Melody and sections", "Melody and sections."],
      ["The lift and release", "Final-chorus key lift (≥8 bars), arrange, release."],
    ],
    sessionExtras: [
      { starter: C7_TEMPLATE, focusRules: ["secondary", "mixture"] },
      { focusRules: ["secondary", "mixture", "bars", "chord-tones", "contrast"] },
      { focusRules: ["secondary", "mixture", "lift", "bars", "chord-tones", "contrast"] },
    ],
    canDo: ["cd.compose.chromatic"],
    hints: ladder(
      "Which chord of the verse could a visitor lean into, bringing the note a half step below its root, and which two chords from C minor climb into C?",
      "A7 is the V7 of Dm: put it in the bar before a Dm (E7 before Am and D7 before G work the same way). A♭ and B♭ come from C minor: play them in the last bars of the chorus, straight into C.",
      "For the lift: add the chorus once more to the end of every `arrange()`, give the chords and bass a `changesChorus2` with every name moved up by the same step, and count the tune's key plan over the whole song, after its `arrange()`: C for 32 bars, then the new key for 8.",
    ),
    tests: [
      {
        name: "the starter: no colour chord, no lift, sixteen bars",
        response: { code: C7_TEMPLATE },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric.
      {
        name: "pop: A7 into Dm in the verse, A♭ B♭ C closing the chorus, the last chorus a whole step up in D",
        response: { code: c7Song() },
        expect: "pass",
      },
      {
        name: "minimal: chords and tune only, the last chorus a whole step up",
        response: { code: c7Song({ tracks: { kick: null, snare: null, hats: null, bass: null } }) },
        expect: "pass",
      },
      {
        // Corrections pass (theory-g 1): the devices have to be heard; every line muted is no song.
        name: "weak: the pop piece with every line muted by .gain(0)",
        response: {
          code: c7Song()
            .split("\n")
            .map((l) => (/^[a-z]+:/.test(l) ? `${l}.gain(0)` : l))
            .join("\n"),
        },
        expect: "fail",
        feedback: ["make.silent"],
      },
      {
        // The tune sings G♯, the 3rd of E7, and rises to A over Am. Half-step lift: D♭ major, so the borrowed
        // run of the last chorus is A, B, D♭ (♭VI and ♭VII of D♭).
        name: "indie: E7 into Am, acoustic guitar with room at 88, the last chorus a half step up in D♭",
        response: {
          code: c7Song({
            bpm: 88,
            verse: "<C G F G C E7 Am G>",
            chorus2: "<Gb Ab Db Bbm Gb A B Db>",
            melVerse: "<[2 ~ 2 1] [1 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [4# ~ ~ ~] [5 ~ 2 0] [1 ~ ~ ~]>",
            keyPlan: '"<C4:major!32 Db4:major!8>"',
            sounds: { chords: "acgtr", mel: "cleangtr", bank: "LinnDrum", fx: ".room(.3)" },
          }),
        },
        expect: "pass",
      },
      {
        // Sevenths by name: the rules compare the triad core.
        name: "jazz-soul: sevenths on Rhodes over upright, A7 into Dm7, A♭^7 B♭7 C^7, lifted a whole step",
        response: {
          code: c7Song({
            bpm: 92,
            verse: "<C^7 Am7 F^7 G7 C^7 A7 Dm7 G7>",
            chorus: "<F^7 G7 C^7 Am7 F^7 Ab^7 Bb7 C^7>",
            chorus2: "<G^7 A7 D^7 Bm7 G^7 Bb^7 C7 D^7>",
            sounds: { chords: "rhodes", bass: "upright", mel: "piano" },
          }),
        },
        expect: "pass",
      },
      {
        // The tune sings F♯, the 3rd of D7, and rises to G.
        name: "funk: D7 into G at 104, finger bass and Rhodes on an 808, lifted a whole step",
        response: {
          code: c7Song({
            bpm: 104,
            verse: "<C Am F G C D7 G G>",
            melVerse: "<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [3# ~ ~ ~] [4 ~ 6 4] [1 ~ ~ ~]>",
            sounds: { chords: "rhodes", bass: "fingerbass", bank: "RolandTR808" },
          }),
        },
        expect: "pass",
      },
      // Known-wrong pieces, each on one required rule (the others hold).
      {
        name: "weak: no secondary dominant (Am in bar 6), the song still lifts",
        response: {
          code: c7Song({
            verse: "<C Am F G C Am Dm G>",
            melVerse: "<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: A7 goes to F, not to Dm",
        response: {
          code: c7Song({
            verse: "<C Am F G C A7 F G>",
            melVerse: "<[2 ~ 2 1] [0 ~ ~ ~] [3 ~ 3 2] [1 ~ ~ ~] [2 ~ 2 1] [0# ~ ~ ~] [0 ~ 3 2] [1 ~ ~ ~]>",
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: ♭VII–♭VI–I (B♭ A♭ C), the run backwards",
        response: { code: c7Song({ chorus: "<F G C Am F Bb Ab C>", chorus2: "<G A D Bm G C Bb D>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: ♭VI–♭VII–IV (A♭ B♭ F), the run lands on IV",
        response: { code: c7Song({ chorus: "<F G C Am C Ab Bb F>", chorus2: "<G A D Bm D Bb C G>" }) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the last chorus lifts for four bars only",
        response: {
          code: c7Song({
            plan: [...VCVC, [4, "Chorus2"]],
            chorus2: "<G A D Bm>",
            keyPlan: '"<C4:major!32 D4:major!4>"',
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the last chorus moves up a 4th, to F",
        response: {
          code: c7Song({ chorus2: "<Bb C F Dm Bb Db Eb F>", keyPlan: '"<C4:major!32 F4:major!8>"' }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: the lifted chorus sings a new tune",
        response: {
          code: c7Song({
            tracks: {
              mel: `mel: ${arr("mel", [...VCVC, [8, "Chorus2"]])}.scale("<C4:major!32 D4:major!8>").s("piano")`,
            },
            consts: {
              melChorus2:
                'n("<[4 ~ 2 0] [1 ~ ~ ~] [2 ~ 0 ~] [4 ~ ~ ~] [3 ~ 1 ~] [5 ~ ~ ~] [4 ~ ~ ~] [2 ~ ~ ~]>")',
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "weak: 24 bars, verse, chorus and the lifted chorus",
        response: {
          code: c7Song({ plan: [...VC, [8, "Chorus2"]], keyPlan: '"<C4:major!16 D4:major!8>"' }),
        },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        // STYLE §9: inside arrange() every section restarts, so a key plan inside a const never reaches its D.
        name: "weak: the key plan written inside the chorus const, so the last chorus plays in C",
        response: {
          code: c7Song({
            keyPlan: null,
            consts: {
              melVerse: `n("${C7_MEL_VERSE}").scale("C4:major")`,
              melChorus: `n("${C7_MEL_CHORUS}").scale("<C4:major!32 D4:major!8>")`,
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet", "code.arranged-scale-pattern"],
      },
      {
        // U17's third convention: a `…Lift` const on some tracks and `…Chorus` on others disagree about the
        // sections; the `…Chorus2` names of the pop piece are accepted.
        name: "sections: the lifted chords named chordsLift while the tune lists melChorus",
        response: {
          code: c7Song({
            consts: { chordsChorus2: null, chordsLift: "chord(changesChorus2).voicing()" },
            tracks: {
              chords: `chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus], [8, chordsLift]).s("piano")`,
            },
          }),
        },
        expect: "fail",
        feedback: ["rubric.unmet", "form.inconsistent-arrange"],
      },
    ],
  }),
  compose({
    id: "CF-A",
    title: "CF-A Core Finale: Album Single",
    objective:
      "An album single of at least two minutes with a bridge and four or more of the six harmonic and rhythmic devices.",
    opensAfter: { capstones: ["C7"] },
    meter: "4/4",
    bpm: [60, 160],
    // No key: the single is in whatever key the learner writes it, major or minor (the analysis reads it from the
    // code and from the key plan after `arrange()`).
    brief:
      "Your single, the last track of Side A: a song of your own, two minutes or longer, with a verse, a chorus and a bridge, and four or more of the six devices on the card. Most are on your record; the card plays them back. Key, tempo, groove, sounds, form and what the song is about are yours.",
    starter: CF_A_TEMPLATE,
    skills: ["H12", "H13", "H14", "F02"],
    minDurationSec: 120,
    // The binding rubric of contracts §6.6 CF-A, exactly: three required lines (pinned by the grader's capstone-wave6
    // test and content/validate/wave6.test.ts), then the spec's five suggestions. The device line opens into the six
    // rows of CF_A_DEVICES on the checklist.
    rubric: [
      req("devices", "At least 4 devices", ["H12", "H13", "H14"], {
        rule: "device-count",
        devices: [...CORE_DEVICES],
        min: 4,
      }),
      req("bridge", "The form has a bridge", ["F03"], { rule: "form", pattern: "*", contains: ["bridge"] }),
      req("duration", "At least 2 minutes", ["F06"], { rule: "duration-sec", min: 120 }),
      // The spec's five suggestions (content/specs/CF.md): ticked or unticked lines, never failures.
      opt("groove-lock", "The bass lands with the kick", ["B04"], {
        rule: "groove-lock",
        kick: "@drums",
        bass: "@bass",
        min: 0.5,
      }),
      opt("contrast", "The bridge goes somewhere the chorus does not", ["F02", "F05"], {
        rule: "contrast",
        a: { section: "bridge" },
        b: { section: "chorus" },
        axes: ["pitch", "density", "harmony", "register", "energy"],
        minAxes: 2,
      }),
      opt("motif", "The hook comes back", ["M02"], {
        rule: "motif-reuse",
        track: "@melody",
        minRatio: 0.5,
        shape: "either",
      }),
      opt("chord-tones", "Chord notes on beats 1 and 3", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.5,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      opt("range", "The tune within 19 half steps", ["M01"], {
        rule: "range",
        track: "@melody",
        maxSpan: 19,
      }),
    ],
    sessions: [
      ["Form & groove", "Plan the form (verse, chorus, bridge) and groove."],
      ["Harmony", "Harmony with ≥4 devices."],
      ["Melody & bridge", "Melody and bridge."],
      ["Arrange & master", "Arrange to ≥2:00, master, release."],
    ],
    // S1 fixes the plan at full length and lays the groove; S2 brings in the devices; S3 writes the tunes and the
    // bridge; S4 arranges, masters, records the take and releases (content/specs/CF.md).
    sessionExtras: [
      { starter: CF_A_TEMPLATE, focusRules: ["bridge", "duration", "groove-lock"] },
      { focusRules: ["devices"] },
      // A suspension in the tune can tick the device line; the bridge gets its own tune.
      { focusRules: ["devices", "bridge", "contrast", "motif", "chord-tones", "range"] },
      {
        focusRules: [
          "devices",
          "bridge",
          "duration",
          "groove-lock",
          "contrast",
          "motif",
          "chord-tones",
          "range",
        ],
      },
    ],
    canDo: ["cd.compose.album-single"],
    album: "single",
    // One ladder for the four sessions, pointing at the devices card: what the song has, where a device sits, how
    // to write one in the song's own key. It never names a song to copy.
    hints: ladder(
      "Which of the six devices does your song already have? The devices card ticks each one with its bars, and shows where you used it on your own record before.",
      "A device sits best at a seam: a secondary dominant in the bar before the chorus, a borrowed chord or a change of key in the bridge, a suspension at the verse's last cadence, a pushed bass in the chorus. The plan's length is read from the `arrange()` lines: at 100 BPM, 50 bars make two minutes.",
      "Aim a dominant at the chorus's first chord that is not home: if the chorus reaches vi, put V7/vi in the bar before it (E7 before Am in C). In the bridge, try the minor iv for two bars (Fm in C), then ♭VI and ♭VII on the way back.",
    ),
    tests: [
      {
        name: "the starter: the plan at 56 bars with a bridge, and none of the six devices",
        response: { code: stripMarkers(CF_A_TEMPLATE).code },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      // One passing piece per shipped flavour (contracts §6.6); a flavour never changes the rubric. Four, five
      // and six devices; the golden test (content/core/capstones/CF-A) pins which rows each one ticks.
      {
        name: "pop, five devices: E7 to Am in the chorus, Fm and A♭–B♭ in the bridge, the lift, a 4–3, a pushed bass",
        response: { code: CF_A_PIECES.pop },
        expect: "pass",
      },
      {
        name: "pop, all six: the same single with a Mixolydian verse, I–♭VII–IV–V",
        response: { code: CF_A_PIECES.six },
        expect: "pass",
      },
      {
        name: "indie, exactly four: C B♭ F C, V7/V into the chorus, a 9–8, eight bars in A minor at 84",
        response: { code: CF_A_PIECES.indie },
        expect: "pass",
      },
      {
        name: "jazz-soul, exactly four: sevenths at 76, the borrowed B♭m7, a chain of dominants, a pushed upright, a 4–3",
        response: { code: CF_A_PIECES.jazzSoul },
        expect: "pass",
      },
      {
        name: "funk, exactly four: an E Dorian verse, F♯7 to B7, a sixteenth-note bass, the last chorus a half step up",
        response: { code: CF_A_PIECES.funk },
        expect: "pass",
      },
      {
        name: "three devices: no lift and a bass on the beat",
        response: { code: CF_A_PIECES.three },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "no bridge: verse, chorus and a third verse where the bridge was",
        response: { code: CF_A_PIECES.noBridge },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      {
        name: "too short: 48 bars at 100 BPM are 115.2 seconds",
        response: { code: CF_A_PIECES.short },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  }),
  transcribe({
    id: "CF-T",
    title: "CF-T Core Finale: Standard Transcription",
    objective: "Transcribe a public-domain standard: form map, bass, changes, melody.",
    opensAfter: { lessonsCompleted: ["U15.L01"] },
    inGymSlots: true,
    meter: "4/4",
    // The L8 pool of the core (`STANDARD_SONG_IDS`, content/gym/standards.ts); a song is offered once its answer
    // key is written and verified with four eight-bar `phrases` and `sections` (author:repertoire).
    song: ["song.five-foot-two", "song.aint-she-sweet", "song.bye-bye-blackbird"],
    sessions: [
      [
        "Form & bass",
        "Form map and bass of a public-domain standard (Five Foot Two, Ain't She Sweet or Bye Bye Blackbird).",
      ],
      ["Changes", "Changes."],
      ["Melody", "Melody."],
      ["Arrange", "Arrange, review, release."],
    ],
    sessionExtras: [
      { formMap: CF_T_FORM_MAP, checks: [...(CF_T_CHECKS[0] ?? [])] },
      { checks: [...(CF_T_CHECKS[1] ?? [])] },
      { checks: [...(CF_T_CHECKS[2] ?? [])] },
      { rubric: [...CF_T_ARRANGE_RUBRIC] },
    ],
    canDo: ["cd.transcribe.standard"],
  }),
  compose({
    id: "JC1",
    title: "JC1 ii–V Ballad",
    objective: "16 bars over chained ii–Vs in at least 3 keys, with a guide-tone melody.",
    opensAfter: { checkpoints: ["J.CP1"] },
    meter: "4/4",
    bpm: [56, 92],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "A 16-bar ballad over chained ii–Vs that reach at least three keys, with a melody built on guide tones.",
    starter: `setcpm(72/4)\n\nconst changes = "<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7>"\n\nchords: chord(changes).dict("guidetones").voicing().s("piano")\nbass: chord(changes).rootNotes(2).s("upright")`,
    skills: ["J04", "J05", "J07"],
    rubric: [
      req("bars", "16 bars", ["F01"], { rule: "bars", min: 16, max: 16 }),
      req("ii-v", "Chained ii–Vs into at least 3 keys", ["J05"], custom("ii-v-chain", { minKeys: 3 })),
      req("guide-tones", "Melody on 3rds or 7ths at chord changes", ["J07"], {
        rule: "guide-tones",
        track: "@melody",
        harmony: "@chords",
        minRatio: 0.7,
      }),
      req(
        "guide-motion",
        "Guide tones move by 2 semitones or less",
        ["J07"],
        custom("guide-tone-motion", { maxSemis: 2 }),
      ),
      tempo(56, 92),
    ],
    sessions: [
      ["Changes", "16 bars over chained ii–Vs in at least 3 keys."],
      ["Guide-tone melody", "Guide-tone melody; release."],
    ],
    canDo: ["cd.compose.ii-v-ballad"],
    hints: ladder(
      "Which notes of a ii–V move the least?",
      "The 7th of ii falls to the 3rd of V.",
      "Over Dm7 to G7, sing C then B.",
    ),
  }),
  compose({
    id: "JC2",
    title: "JC2 Jazz Blues in F",
    objective:
      "Jazz-blues changes, shell comping and walking bass from one chord() pattern; an original head.",
    opensAfter: { lessonsCompleted: ["J4.L04"] },
    meter: "4/4",
    key: { tonic: "F", mode: "major" },
    bpm: [100, 180],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief:
      "A jazz blues in F: changes, swinging comping and a walking bass all driven by one chord pattern, then your own head over two choruses.",
    starter: `setcpm(132/4)\n\nconst changes = "<F7 Bb7 F7 Cm7 Bb7 Bo7 F7 D7 Gm7 C7 F7 C7>"\n\nhats: s("rd*8").swingBy(1/3, 4).gain(.5)\nchords: n("0 1").chord(changes).voicing().struct("~ x ~ x").s("piano")\nbass: chord(changes).rootNotes(2).struct("x*4").s("upright")`,
    skills: ["J11", "B05", "J08"],
    rubric: [
      req("form", "Jazz 12-bar blues", ["J11"], { rule: "blues-form", variant: "jazz" }),
      req(
        "walking",
        "A walking bass",
        ["B05"],
        custom("walking-bass", { rootOnOne: 0.75, approachOnFour: 0.5 }),
      ),
      req("swing", "Swung 8ths on the ride or comping", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums", "chords"],
        drums: ["hatClosed", "hatOpen", "ride"],
        subdivision: 8,
        ratio: [1.6, 2.4],
      }),
      req("one-pattern", "Comping and bass come from one chord pattern", ["J08"], {
        rule: "uses",
        tool: ["tb.set", "tb.rootNotes"],
        min: 1,
      }),
    ],
    sessions: [
      ["Changes & comping", "Changes, shell comping and walking bass from one `chord()` pattern."],
      ["Head", "Original head over two choruses; release."],
    ],
    canDo: ["cd.compose.jazz-blues"],
    hints: ladder(
      "What does the bass do on beat 4?",
      "Beat 4 approaches the next root by a step.",
      "Walk F A C B to reach B♭.",
    ),
  }),
  compose({
    id: "JC3",
    title: "JC3 Rhythm-Changes Contrafact",
    objective: "A 32-bar AABA contrafact on rhythm changes in B♭.",
    opensAfter: { checkpoints: ["J.CP2"] },
    meter: "4/4",
    key: { tonic: "Bb", mode: "major" },
    bpm: [120, 220],
    swing: { subdivision: 8, amount: 1 / 3 },
    brief: "A new head on rhythm changes in B♭: 32 bars, AABA, with the bridge D7 G7 C7 F7.",
    starter: `setcpm(160/4)\n\nconst chordsA = chord("<[Bb^7 Gm7] [Cm7 F7]>").voicing()\nconst chordsB = chord("<D7 D7 G7 G7 C7 C7 F7 F7>").voicing()\n\nchords: arrange([8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]).s("piano")`,
    skills: ["J12", "J10"],
    rubric: [
      req("form", "AABA, 32 bars", ["J12"], { rule: "form", pattern: "AABA" }),
      req("bars", "32 bars", ["J12"], { rule: "bars", min: 32, max: 32 }),
      req("a-changes", "A sections on rhythm changes", ["J12"], {
        rule: "progression",
        schema: "schema.rhythm-a",
      }),
      req("bridge", "Bridge D7 G7 C7 F7", ["J10"], { rule: "progression", rn: ["III7", "VI7", "II7", "V7"] }),
      req("chord-tones", "Chord tones on strong beats", ["M03"], {
        rule: "chord-tones-strong",
        minRatio: 0.55,
        melody: "@melody",
        harmony: "@chords",
        strength: "strong",
      }),
      req(
        "bridge-guides",
        "Bridge changes met by a 3rd or 7th",
        ["J07"],
        custom("bridge-guide-tones", { min: 0.5 }),
      ),
    ],
    sessions: [
      ["A sections", "A sections in B♭."],
      ["Bridge", "Bridge D7 G7 C7 F7."],
      ["Arrange", "Arrange and release."],
    ],
    canDo: ["cd.compose.contrafact"],
    hints: ladder(
      "Which note of D7 tells the ear the key has moved?",
      "F♯, the 3rd of D7, is not in B♭.",
      "Land on F♯ on the downbeat of the bridge.",
    ),
  }),
  compose({
    id: "JC4",
    title: "JC4 Reharmonize a Standard",
    objective: "Reharmonize Georgia on My Mind or Body and Soul with three devices, melody untouched.",
    opensAfter: { checkpoints: ["J.CP2"] },
    meter: "4/4",
    bpm: [56, 100],
    brief: "Reharmonize a 1930 standard with at least three devices. The melody stays exactly as written.",
    starter: `setcpm(72/4)\n\nchords: chord("<Dm7 G7 C^7 A7>").voicing().s("piano")`,
    skills: ["J14", "J13"],
    rubric: [
      req(
        "melody",
        "Melody identical to the original",
        ["J14"],
        custom("melody-matches-song", {
          songs: ["song.georgia-on-my-mind", "song.body-and-soul"],
          pitch: "absolute",
        }),
      ),
      req(
        "tensions",
        "Tensions over the new chords are allowed ones",
        ["J02"],
        custom("allowed-tensions", { min: 0.85 }),
      ),
      req("devices", "At least 3 reharmonization devices", ["J14", "J13"], {
        rule: "device-count",
        devices: ["tritone sub", "secondary ii–V", "backdoor", "diminished passing"],
        min: 3,
      }),
    ],
    sessions: [
      ["Analyse", "Analyse Georgia on My Mind or Body and Soul (both 1930)."],
      ["Reharmonize", "Reharmonize with ≥3 devices; melody untouched."],
      ["Voice-lead", "Voice-lead and release."],
    ],
    canDo: ["cd.compose.reharm"],
    hints: ladder(
      "Which chord could be replaced by one a tritone away?",
      "Any V7 can become ♭II7 into the same target.",
      "Swap G7 for Db7 before C^7.",
    ),
  }),
  compose({
    id: "RC1",
    title: "RC1 16th-Note Funk",
    objective: "A 16th-note funk pocket with ghost notes, a syncopated bass and horn stabs.",
    opensAfter: { checkpoints: ["R.CP"] },
    meter: "4/4",
    bpm: [90, 115],
    brief: "A one-chord funk vamp: ghosted 16ths, a syncopated bass that still hits the one, and horn stabs.",
    starter: `setcpm(100/4)\n\nkick: s("bd ~ ~ bd ~ ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*16").velocity("[1 .35 .6 .35]*4")\nbass: note("⟪c2 ~ ~ c2 ~ eb2 ~ g2⟫").s("fingerbass").lpf(800)`,
    skills: ["R14", "R15", "R10"],
    rubric: [
      req("ghosts", "At least 4 ghost notes on 16th off-beats", ["R14"], {
        rule: "velocity-ghosts",
        track: "@drums",
        min: 4,
        on: "16th-offbeat",
      }),
      req("syncopated-bass", "Bass with 3+ onsets off the 8th grid", ["R10"], {
        rule: "syncopation",
        track: "@bass",
        min: 3,
      }),
      req("one", "Bass and kick on the one of every bar", ["R14"], custom("bass-kick-downbeat")),
      req(
        "horns",
        "A horns track with stabs",
        ["R14"],
        custom("horn-stabs", { label: "horns", min: 2, per: 2 }),
      ),
    ],
    sessions: [
      [
        "Pocket",
        "Drums and bass pocket on a one-chord minor-seventh vamp (minor pentatonic; Dorian only once U14.L03 has unlocked it).",
      ],
      [
        "Stabs",
        "Clav and horn stabs on a `horns:` track (the `horns` sound unlocks at the start of this session if U15.L05 has not unlocked it yet); release.",
      ],
    ],
    canDo: ["cd.compose.funk"],
    hints: ladder(
      "Where does funk put its weight?",
      "Everything meets on the one; the rest dances around it.",
      'Ghost the hats with `.velocity("[1 .3 .6 .3]*4")`.',
    ),
  }),
  compose({
    id: "RC2",
    title: "RC2 Clave & Polyrhythm",
    objective:
      "Son clave 3-2 on the 2-bar 8th grid with tresillo bass, a 3:2 layer and Euclidean percussion.",
    opensAfter: { checkpoints: ["R.CP"] },
    meter: "4/4",
    bpm: [90, 130],
    brief:
      "A son clave groove, 3-2, at least 8 bars, with a tresillo bass, a 3-against-2 layer and a Euclidean rhythm.",
    starter: `setcpm(110/4)\n\nperc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")\nbass: note("c2(3,8)").s("ebass").lpf(700)`,
    skills: ["R18", "R17"],
    rubric: [
      req("clave", "Son clave 3-2 for 8+ bars", ["R18"], {
        rule: "clave",
        track: "perc",
        type: "son",
        direction: "3-2",
      }),
      req("bars", "At least 8 bars", ["R18"], { rule: "bars", min: 8 }),
      req("tresillo", "Tresillo in the bass on the 3-side", ["R18"], custom("tresillo-bass")),
      req("poly", "A 3:2 layer between two tracks", ["R17"], {
        rule: "polyrhythm",
        a: "perc2",
        b: "drums",
        ratio: [3, 2],
      }),
      req("euclid", "A Euclidean rhythm", ["R18"], { rule: "uses", tool: "tb.mini.euclid", min: 1 }),
    ],
    sessions: [
      ["Clave & tresillo", "Son clave 3-2 on the 2-bar 8th grid with tresillo bass."],
      ["Layers", "A 3:2 layer and Euclidean percussion; release."],
    ],
    canDo: ["cd.compose.clave"],
    hints: ladder(
      "Which side of the clave has three hits?",
      "Bar A: 0, 3/8, 6/8. Bar B: 2/8, 4/8.",
      "Tresillo is `(3,8)`.",
    ),
  }),
  compose({
    id: "AC1",
    title: "AC1 One Tune, Two Genres",
    objective: "St. Louis Blues or Sweet Georgia Brown arranged twice, in two genres.",
    opensAfter: { checkpoints: ["A.CP", "U11.CP"] },
    meter: "4/4",
    bpm: [60, 180],
    brief:
      "Arrange one public-domain tune twice, in two genres: same melody, different tempo or feel, different instruments.",
    starter: `setcpm(100/4)\n\nmel: n("⟪0 2 4 2⟫").scale("G4:major").s("piano")`,
    skills: ["D09", "F06"],
    rubric: [
      req(
        "melody",
        "Both versions keep the tune's melody",
        ["D09"],
        custom("melody-matches-song", {
          songs: ["song.st-louis-blues", "song.sweet-georgia-brown"],
          pitch: "pitch-class",
        }),
      ),
      req(
        "differ",
        "The two versions differ in tempo or feel, and in instruments",
        ["D09"],
        custom("two-versions-differ", { tempoDelta: 20, soundsDiffer: 2 }),
      ),
      req("sound-design", "Each version uses a sound-design tool", ["D02", "D03"], {
        rule: "uses",
        tool: [
          "tb.lpenv",
          "tb.adsr",
          "tb.hpf",
          "tb.bpf",
          "tb.lpq",
          "tb.roomsize",
          "tb.delaytime",
          "tb.delayfeedback",
          "tb.orbit",
          "tb.crush",
          "tb.coarse",
          "tb.vib",
          "tb.phaser",
          "tb.fm",
          "tb.unison",
          "tb.pw",
        ],
        min: 1,
      }),
    ],
    sessions: [
      ["Version one", "St. Louis Blues (1914) or Sweet Georgia Brown (1925), version one."],
      ["Version two", "Version two in the other flavour."],
      ["Compare & polish", "Compare, polish, release."],
    ],
    canDo: ["cd.compose.two-genres"],
    hints: ladder(
      "What stays the same when a song changes genre?",
      "The melody's pitch classes stay; tempo, feel and sounds move.",
      "Try the second version 30 BPM slower with swing.",
    ),
  }),
  compose({
    id: "AC2",
    title: "AC2 Neo-Soul Ballad",
    objective: "maj9/m11 changes, a swung-16th groove with .late() feel, and a mix.",
    opensAfter: { checkpoints: ["A.CP"], lessonsCompleted: ["J3.L04", "R1.L05"] },
    meter: "4/4",
    bpm: [60, 90],
    swing: { subdivision: 16, amount: 0.2 },
    brief:
      "A neo-soul ballad: ninth and eleventh chords on Rhodes, smooth voice leading, and a swung 16th groove that leans back.",
    starter: `setcpm(76/4)\n\nhats: s("hh*16").swingBy(.2, 8).gain(.5)\nsnare: s("~ sd ~ sd").late(1/32)\nchords: chord("<D^9 Em11 F#m7 Bm9>").voicing().s("rhodes")`,
    skills: ["D09", "D10", "J02"],
    rubric: [
      req(
        "extensions",
        "A 9th or 11th in 60% of the bars",
        ["J02"],
        custom("extended-chord-share", { min: 0.6 }),
      ),
      req("swing", "Swung 16ths on the hats", ["R13"], {
        rule: "swing",
        track: ["hats", "@drums"],
        subdivision: 16,
        ratio: [1.2, 2.4],
      }),
      req("voice-leading", "Top voice moves by 2 semitones or less", ["C05"], {
        rule: "voice-leading",
        track: "@chords",
        maxMovePerVoice: 2,
      }),
      req("rhodes", "Rhodes in the mix", ["D01"], { rule: "sounds", contains: ["snd.rhodes"] }),
    ],
    sessions: [
      ["Changes & voicings", "maj9/m11 changes and voicings (choir unlocks at the start)."],
      ["Groove & melody", "Swung-16th groove with `.late()` feel; melody."],
      ["Mix", "Mix and release."],
    ],
    canDo: ["cd.compose.neo-soul"],
    hints: ladder(
      "How does a groove sound laid back?",
      "Late snares, swung 16ths.",
      "`.late(1/32)` on the snare, `.swingBy(.2, 8)` on the hats.",
    ),
  }),
];
export default capstones;

export const capstoneById: ReadonlyMap<string, CapstoneDef> = new Map(
  capstones.map((c) => [c.id, c] as const),
);

/** The registry rows the syllabus and the planner read. */
export const capstoneMetas: CapstoneMeta[] = capstones.map((c) => ({
  id: c.id,
  title: c.title,
  objective: c.objective,
  sessions: c.sessions,
  opensAfter: c.opensAfter,
  ...(c.inGymSlots ? { inGymSlots: true } : {}),
  kind: c.kind,
}));

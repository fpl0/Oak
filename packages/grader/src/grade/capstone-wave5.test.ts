// Capstone rubrics of Wave 5 exactly as contracts §6.6 writes them (C3 Verse–Chorus Demo, C4 Minor Indie Ballad,
// C5 12-Bar Shuffle), graded in capstone mode through the whole pipeline: one passing piece per shipped flavour
// (pop, jazz-soul, indie, funk: a flavour never changes a rubric, §5.10 rule 7) and the known-wrong pieces, each
// failing only the rule it breaks. X2 Blues Transcription (bass ≥ 0.90 → changes ≥ 0.85 → melody ≥ 0.85, in that
// order) is graded on a 12-bar answer key with swing given (contracts §6.10, §6.12). Music checked by hand and with
// `bun run theory` (C4: A minor, E is V with the raised 7, G♯; C5: twelve-bar C blues, ♭3 = E♭, ♭5 = G♭).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type {
  ExBase,
  ExerciseOf,
  GradeResult,
  KeySpec,
  PhraseCheck,
  RubricRule,
  SongDef,
} from "@oak/content-kit";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import type { GradeContext } from "../types.ts";
import { gradeWith } from "./index.ts";
import { phraseCheckPassed, phraseCheckRequest } from "./phrase-check.ts";
import { nextSongStage, SONG_LADDER_MATCHERS, SONG_LADDER_PASS } from "./song-ladder.ts";

setDefaultTimeout(120_000);
const deps = headlessDeps();
const req = (id: string, body: Record<string, unknown>): RubricRule =>
  ({ id, label: id, required: true, skills: [], ...body }) as unknown as RubricRule;
const base = <K extends string>(kind: K, id = "brief"): ExBase<K> => ({
  kind,
  id,
  version: 1,
  prompt: "",
  skills: [],
  role: "check",
  hints: null,
  tests: [],
});
const brief = (rubric: RubricRule[], o: Record<string, unknown> = {}): ExerciseOf<"compose-brief"> =>
  ({
    ...base("compose-brief"),
    brief: "",
    rubric,
    code: { starter: "" },
    saveAs: "album",
    ...o,
  }) as unknown as ExerciseOf<"compose-brief">;
const ctx = (key: KeySpec, o: Partial<GradeContext> = {}): GradeContext => ({
  exerciseGlobalId: "C/brief",
  mode: "capstone",
  key,
  meter: "4/4",
  bpm: 100,
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0,
  tutorHints: 0,
  extraReplays: 0,
  lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
  ...o,
});
const failing = (r: GradeResult): string[] => (r.rubric ?? []).filter((x) => !x.ok).map((x) => x.ruleId);
const detail = (r: GradeResult, id: string): string =>
  String((r.rubric ?? []).find((x) => x.ruleId === id)?.diag?.params.detail ?? "");

/** Each shipped flavour as the code a learner in it writes (contracts §5.10: sounds, chord depth, feel). */
interface Flavour {
  id: string;
  chords: string;
  bass: string;
  lead: string;
  bank: string;
  sevenths: boolean;
  swing: boolean;
  sixteenths: boolean;
}
const FLAVOURS: Flavour[] = [
  {
    id: "pop",
    chords: "piano",
    bass: "sawtooth",
    lead: "piano",
    bank: "",
    sevenths: false,
    swing: false,
    sixteenths: false,
  },
  {
    id: "jazz-soul",
    chords: "rhodes",
    bass: "upright",
    lead: "vibes",
    bank: "",
    sevenths: true,
    swing: true,
    sixteenths: false,
  },
  {
    id: "indie",
    chords: "cleangtr",
    bass: "sawtooth",
    lead: "acgtr",
    bank: '.bank("LinnDrum")',
    sevenths: false,
    swing: false,
    sixteenths: false,
  },
  {
    id: "funk",
    chords: "clav",
    bass: "fingerbass",
    lead: "organ",
    bank: '.bank("RolandTR808")',
    sevenths: true,
    swing: false,
    sixteenths: true,
  },
];

// --- C3 Verse–Chorus Demo -----------------------------------------------------------------------------------

const C3_RUBRIC: RubricRule[] = [
  req("form", { rule: "form", pattern: "verse chorus verse chorus" }),
  req("contrast", {
    rule: "contrast",
    a: { section: "chorus" },
    b: { section: "verse" },
    axes: ["pitch", "density", "harmony", "register", "energy"],
    minAxes: 2,
  }),
  req("duration", { rule: "duration-sec", min: 90 }),
  req("groove-lock", { rule: "groove-lock", kick: "@drums", bass: "@bass", min: 0.5 }),
  req("leadsheet", { rule: "notates", view: "lead-sheet" }),
];
const C3 = brief(C3_RUBRIC, { minDurationSec: 90 });
const C_MAJOR: KeySpec = { tonic: "C", mode: "major" };

function c3Piece(f: Flavour, o: { bpm?: number; order?: string } = {}): string {
  const v = f.sevenths ? "<C^7 Am7 F^7 G7>" : "<C Am F G>";
  const c = f.sevenths ? "<F^7 G7 C^7 C^7>" : "<F G C C>";
  const swing = f.swing ? ".swingBy(1/3, 4)" : "";
  const hats = f.sixteenths ? 'hats: s("hh*16").gain(.35)' : `hats: s("hh*8")${f.bank}.gain(.4)${swing}`;
  const order = (o.order ?? "V C V C").split(" ").map((x) => (x === "V" ? "Verse" : "Chorus"));
  const arr = (role: string) => order.map((s) => `[8, ${role}${s}]`).join(", ");
  return `setcpm(${o.bpm ?? 80}/4)

const chordsVerse = chord("${v}").voicing()
const chordsChorus = chord("${c}").voicing()
const bassVerse = note("<[c2 ~ c2 ~] [a1 ~ a1 ~] [f1 ~ f1 ~] [g1 ~ g1 ~]>")
const bassChorus = note("<[f1 ~ f1 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [c2 ~ c2 ~]>")
const melVerse = n("<[0 ~ 2 ~] [0 ~ ~ ~] [3 ~ 2 ~] [1 ~ ~ ~]>").scale("C4:major")
const melChorus = n("<[7 9 8 7] [6 7 8 9] [9 8 7 5] [7 ~ 7 ~]>").scale("C4:major")

chords: arrange(${arr("chords")}).s("${f.chords}")
bass: arrange(${arr("bass")}).s("${f.bass}")
mel: arrange(${arr("mel")})${swing}.s("${f.lead}")
kick: s("bd ~ bd ~")${f.bank}
snare: s("~ sd ~ sd")${f.bank}
${hats}`;
}
const gradeC3 = (code: string, f: Flavour = FLAVOURS[0] as Flavour) =>
  gradeWith(
    {
      exercise: C3,
      response: { code },
      ctx: ctx(C_MAJOR, { bpm: 80, ...(f.swing ? { swing: { subdivision: 8, amount: 1 / 3 } } : {}) }),
    },
    deps,
  );

describe("C3 Verse–Chorus Demo (contracts §6.6)", () => {
  for (const f of FLAVOURS)
    test(`${f.id}: every required rule met`, async () => {
      const r = await gradeC3(c3Piece(f), f);
      expect(failing(r)).toEqual([]);
      expect(r.status).toBe("pass");
    });
  test("V C C V is not the form", async () => {
    expect(failing(await gradeC3(c3Piece(FLAVOURS[0] as Flavour, { order: "V C C V" })))).toEqual(["form"]);
  });
  test("a chorus that is the verse again has no contrast", async () => {
    const same = c3Piece(FLAVOURS[0] as Flavour)
      .replace('chord("<F G C C>")', 'chord("<C Am F G>")')
      .replace(
        'note("<[f1 ~ f1 ~] [g1 ~ g1 ~] [c2 ~ c2 ~] [c2 ~ c2 ~]>")',
        'note("<[c2 ~ c2 ~] [a1 ~ a1 ~] [f1 ~ f1 ~] [g1 ~ g1 ~]>")',
      )
      .replace(
        'n("<[7 9 8 7] [6 7 8 9] [9 8 7 5] [7 ~ 7 ~]>")',
        'n("<[0 ~ 2 ~] [0 ~ ~ ~] [3 ~ 2 ~] [1 ~ ~ ~]>")',
      );
    const r = await gradeC3(same);
    expect(failing(r)).toEqual(["contrast"]);
    expect(detail(r, "contrast")).toMatch(/^the chorus is no .* than the verse: change two of these$/);
  });
  test("32 bars at 120 BPM is 64 seconds: too short (read from the AST, never played)", async () => {
    const r = await gradeC3(c3Piece(FLAVOURS[0] as Flavour, { bpm: 120 }));
    expect(failing(r).sort()).toEqual(["duration", "min-duration"]);
    expect(detail(r, "duration")).toBe("64 s long; at least 90 s");
  });
  test("a bass between the kicks does not lock", async () => {
    const r = await gradeC3(c3Piece(FLAVOURS[0] as Flavour).replace(/\[(\w\d) ~ \1 ~\]/g, "[~ $1 ~ $1]"));
    expect(failing(r)).toEqual(["groove-lock"]);
  });
  test("a melody pushed off the grid cannot be written as a lead sheet", async () => {
    const r = await gradeC3(
      c3Piece(FLAVOURS[0] as Flavour)
        .replace("mel: arrange(", "mel: arrange(")
        .replace(').s("piano")\nkick', ').late(0.07).s("piano")\nkick'),
    );
    expect(failing(r)).toContain("leadsheet");
  });
  test("two tracks that disagree about the sections fail the form with the first disagreement", async () => {
    const r = await gradeC3(
      c3Piece(FLAVOURS[0] as Flavour).replace(
        "bass: arrange([8, bassVerse], [8, bassChorus]",
        "bass: arrange([8, bassVerse], [4, bassChorus]",
      ),
    );
    expect(failing(r)).toContain("form");
    expect(r.messages.map((m) => m.id)).toContain("form.inconsistent-arrange");
  });
});

// --- C4 Minor Indie Ballad ----------------------------------------------------------------------------------

const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
const C4_RUBRIC: RubricRule[] = [
  req("aeolian", { rule: "progression", schema: "schema.aeolian", section: { section: "verse" } }),
  req("major-v", { rule: "contains-rn", rn: ["V"], min: 1, mustResolve: true }),
  req("minor-colour", { rule: "degree-set", track: "@melody", contains: ["b3", "b6"] }),
  req("ends-on-1", { rule: "ends-on-degree", degrees: ["1"], track: "@melody", over: "i" }),
  req("tempo", { rule: "tempo-bpm", min: 60, max: 95 }),
];
const C4 = brief(C4_RUBRIC);
function c4Piece(f: Flavour, o: { verse?: string; v?: string; bpm?: number; mel?: string } = {}): string {
  const s7 = (x: string) =>
    f.sevenths ? x.replace(/\b([A-G][b#]?)m\b/g, "$1m7").replace(/\b([CFG])\b/g, "$1^7") : x;
  const verse = s7(o.verse ?? "<Am F C G>");
  const chorus = s7(`<F G ${o.v ?? "E"} Am>`).replace(/\bE\b/, f.sevenths ? "E7" : "E");
  const swing = f.swing ? ".swingBy(1/3, 4)" : "";
  return `setcpm(${o.bpm ?? 76}/4)

const chordsVerse = chord("${verse}").voicing()
const chordsChorus = chord("${chorus}").voicing()
const melVerse = n("${o.mel ?? "<[4 ~ 2 ~] [5 ~ 4 ~] [2 ~ 0 ~] [1 ~ ~ ~]>"}").scale("A4:minor")
const melChorus = n("<[5 4 5 ~] [6 5 4 ~] [4 ~ 1 ~] [0@2 ~ ~]>").scale("A4:minor")

chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus]).s("${f.chords}")
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])${swing}.s("${f.lead}")
drums: s("bd ~ sd ~, hh*${f.sixteenths ? 16 : 8}")${f.bank}${swing}`;
}
const gradeC4 = (code: string, f: Flavour = FLAVOURS[0] as Flavour) =>
  gradeWith(
    {
      exercise: C4,
      response: { code },
      ctx: ctx(A_MINOR, { bpm: 76, ...(f.swing ? { swing: { subdivision: 8, amount: 1 / 3 } } : {}) }),
    },
    deps,
  );

describe("C4 Minor Indie Ballad (contracts §6.6)", () => {
  for (const f of FLAVOURS)
    test(`${f.id}: every required rule met`, async () => {
      const r = await gradeC4(c4Piece(f), f);
      expect(failing(r)).toEqual([]);
    });
  test("a verse on iv instead of III is not the aeolian loop (read in the verse only)", async () => {
    const r = await gradeC4(c4Piece(FLAVOURS[0] as Flavour, { verse: "<Am F Dm G>" }));
    expect(failing(r)).toEqual(["aeolian"]);
    expect(detail(r, "aeolian")).toMatch(/^The verse: .*chord 3 is iv, the brief wants III/);
  });
  test("the minor v (E minor, no G♯) is not the major V", async () => {
    const r = await gradeC4(c4Piece(FLAVOURS[0] as Flavour, { v: "Em" }));
    expect(failing(r)).toEqual(["major-v"]);
  });
  test("a melody with no ♭6 (F) misses the minor colour", async () => {
    const r = await gradeC4(
      c4Piece(FLAVOURS[0] as Flavour)
        .replace("[5 ~ 4 ~]", "[3 ~ 4 ~]")
        .replace("[5 4 5 ~] [6 5 4 ~]", "[4 3 4 ~] [6 4 3 ~]"),
    );
    expect(failing(r)).toEqual(["minor-colour"]);
    expect(detail(r, "minor-colour")).toBe("no ♭6 in the line yet");
  });
  test("ending on 3 is not ending on 1", async () => {
    const r = await gradeC4(c4Piece(FLAVOURS[0] as Flavour).replace("[0@2 ~ ~]>", "[2@2 ~ ~]>"));
    expect(failing(r)).toEqual(["ends-on-1"]);
  });
  test("120 BPM is not a ballad", async () => {
    expect(failing(await gradeC4(c4Piece(FLAVOURS[0] as Flavour, { bpm: 120 })))).toEqual(["tempo"]);
  });
});

// --- C5 12-Bar Shuffle ----------------------------------------------------------------------------------------

const C_BLUES: KeySpec = { tonic: "C", mode: "blues" };
const C5_RUBRIC: RubricRule[] = [
  req("form", { rule: "blues-form", variant: "standard", choruses: 2, quickChangeOk: true }),
  req("sevenths", { rule: "chord-qualities", track: "@chords", subsetOf: ["7"], depth: "seventh" }),
  req("swing", {
    rule: "swing",
    track: ["hats", "@drums"],
    drums: ["hatClosed", "hatOpen", "ride"],
    subdivision: 8,
    ratio: [1.6, 2.4],
  }),
  req("turnaround", { rule: "contains-rn", rn: ["V"], min: 1, section: { bars: [12, 12] } }),
  req("blue-notes", { rule: "degree-set", track: "@melody", anyOf: ["b3", "b5"], minCount: 2 }),
  req("riff", { rule: "motif-reuse", track: "@melody", minRatio: 0.6 }),
];
const C5 = brief(C5_RUBRIC, { swing: { subdivision: 8, amount: 1 / 3 } });
const CHORUS = "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7";
/** A one-bar riff on each chord's root, moved with the changes: c eb f g on C7; the second chorus answers it. */
const RIFF: Record<string, string> = { C7: "[c4 eb4 f4 g4]", F7: "[f4 ab4 bb4 c5]", G7: "[g4 bb4 c5 d5]" };
const ANSWER: Record<string, string> = { C7: "[g4 f4 eb4 c4]", F7: "[c5 bb4 ab4 f4]", G7: "[d5 c5 bb4 g4]" };
function c5Piece(
  f: Flavour,
  o: { chorus?: string; choruses?: number; hats?: string; riff?: string } = {},
): string {
  const bars = (o.chorus ?? CHORUS).split(" ");
  const all = Array.from({ length: o.choruses ?? 2 }, () => bars).flat();
  const mel = o.riff ?? `<${all.map((c, i) => (i < bars.length ? RIFF : ANSWER)[c] ?? RIFF.C7).join(" ")}>`;
  const ride = f.id === "jazz-soul";
  const hats =
    o.hats ??
    (ride
      ? `drums: s("rd*8")${f.bank}.swingBy(1/3, 4)`
      : `hats: s("hh*8")${f.bank}.gain(.5).swingBy(1/3, 4)`);
  return `setcpm(112/4)

const changes = "<${all.join(" ")}>"

${hats}
kick: s("bd ~ sd ~")${f.bank}
chords: chord(changes).voicing().s("${f.chords}")
bass: note("<${all.map((c) => ({ C7: "c2", F7: "f2", G7: "g2" })[c] ?? "c2").join(" ")}>").s("${f.bass}")
mel: note("${mel}").swingBy(1/3, 4).s("${f.lead}")`;
}
const gradeC5 = (code: string) =>
  gradeWith(
    {
      exercise: C5,
      response: { code },
      ctx: ctx(C_BLUES, { bpm: 112, swing: { subdivision: 8, amount: 1 / 3 } }),
    },
    deps,
  );

describe("C5 12-Bar Shuffle (contracts §6.6)", () => {
  for (const f of FLAVOURS)
    test(`${f.id}: every required rule met (two quick-change choruses, swung ${f.id === "jazz-soul" ? "ride" : "hats"})`, async () => {
      const r = await gradeC5(c5Piece(f));
      expect(failing(r)).toEqual([]);
    });
  test("the standard form passes too; one chorus does not", async () => {
    expect(
      failing(
        await gradeC5(
          c5Piece(FLAVOURS[0] as Flavour, { chorus: CHORUS.replace("C7 F7 C7 C7 F7", "C7 C7 C7 C7 F7") }),
        ),
      ),
    ).toEqual([]);
    const one = await gradeC5(c5Piece(FLAVOURS[0] as Flavour, { choruses: 1 }));
    expect(failing(one)).toContain("form");
  });
  test("a triad in bar 5 breaks 'every chord a dominant seventh' and says which", async () => {
    const r = await gradeC5(
      c5Piece(FLAVOURS[0] as Flavour, { chorus: CHORUS.replace("C7 C7 F7 F7", "C7 C7 F F7") }),
    );
    expect(failing(r)).toEqual(["sevenths"]);
    expect(detail(r, "sevenths")).toContain("bar 5 is F (major)");
  });
  test("straight hats: the swing rule names the line and the fix", async () => {
    const r = await gradeC5(c5Piece(FLAVOURS[0] as Flavour, { hats: 'hats: s("hh*8").gain(.5)' }));
    expect(failing(r)).toEqual(["swing"]);
    expect(detail(r, "swing")).toBe("`hats` plays straight 8ths; add `.swingBy(1/3, 4)`");
  });
  test("bar 12 on I is no turnaround", async () => {
    const r = await gradeC5(c5Piece(FLAVOURS[0] as Flavour, { chorus: CHORUS.replace(/G7$/, "C7") }));
    expect(failing(r)).toEqual(["turnaround"]);
  });
  test("a riff with no blue note, and a tune that never comes back", async () => {
    const plain = { C7: "[c4 e4 f4 g4]", F7: "[f4 a4 bb4 c5]", G7: "[g4 b4 c5 d5]" } as Record<
      string,
      string
    >;
    const bars = Array.from({ length: 2 }, () => CHORUS.split(" ")).flat();
    const plain2 = { C7: "[g4 f4 e4 c4]", F7: "[c5 bb4 a4 f4]", G7: "[d5 c5 b4 g4]" } as Record<
      string,
      string
    >;
    const r = await gradeC5(
      c5Piece(FLAVOURS[0] as Flavour, {
        riff: `<${bars.map((c, i) => (i < 12 ? plain : plain2)[c]).join(" ")}>`,
      }),
    );
    expect(failing(r)).toEqual(["blue-notes"]);
    const wander = bars.map(
      (_, i) =>
        `[c4 eb4 ${["d4", "f4", "a4", "b4", "e4", "g4"][i % 6]} ${["g4", "c5", "e4", "d5", "f4", "a4", "b3"][i % 7]}]`,
    );
    const w = await gradeC5(c5Piece(FLAVOURS[0] as Flavour, { riff: `<${wander.join(" ")}>` }));
    expect(failing(w)).toContain("riff");
  });
});

// --- X2 Blues Transcription ---------------------------------------------------------------------------------

/** A 12-bar strain in G with swing given, as an answer key (the real keys are author:repertoire's). */
const STRAIN: SongDef = {
  id: "song.test-strain",
  title: "Test strain",
  year: "1914",
  status: "pd",
  provenance: { source: "test", year: 1914 },
  verifiedBy: "test",
  key: { tonic: "G", mode: "major" },
  meter: "4/4",
  bpm: 96,
  swing: { subdivision: 8, amount: 1 / 3 },
  form: "12-bar blues",
  answerKey: {
    bars: 12,
    code: "",
    layers: {
      bass: 'note("<[g1 ~ d2 ~] [c2 ~ g2 ~] [g1 ~ d2 ~] [g1 ~ d2 ~] [c2 ~ g2 ~] [c2 ~ g2 ~] [g1 ~ d2 ~] [g1 ~ d2 ~] [d2 ~ a2 ~] [c2 ~ g2 ~] [g1 ~ d2 ~] [d2 ~ a2 ~]>").s("sawtooth")',
      chords: 'chord("<G7 C7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7>").voicing()',
      melody:
        'note("<[b4 bb4 g4 ~] [g4 ~ ~ ~] [b4 bb4 g4 d5] [d5 ~ ~ ~] [e5 eb5 c5 ~] [c5 ~ ~ ~] [b4 bb4 g4 ~] [g4 ~ ~ ~] [a4 a4 a4 g4] [e4 ~ ~ ~] [g4 ~ ~ ~] [~ ~ ~ ~]>").swingBy(1/3, 4).s("piano")',
    },
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
} as unknown as SongDef;
const X2_CHECKS: PhraseCheck[] = [
  { id: "bass", phrase: [1, 3], layer: "bass", matcher: SONG_LADDER_MATCHERS.bass, pass: 0.9 },
  {
    id: "changes",
    phrase: [1, 3],
    layer: "chords",
    matcher: SONG_LADDER_MATCHERS.changes,
    pass: 0.85,
    after: ["bass"],
  },
  {
    id: "melody",
    phrase: [1, 3],
    layer: "melody",
    matcher: SONG_LADDER_MATCHERS.melody,
    pass: 0.85,
    after: ["changes"],
  },
] as PhraseCheck[];
const xctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set<never>(),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const gradeX2 = (check: PhraseCheck, code: string) =>
  gradeWith(phraseCheckRequest({ capstoneId: "X2", check, song: STRAIN, code, ctx: xctx }), deps);
const L = STRAIN.answerKey.layers as Record<"bass" | "chords" | "melody", string>;

describe("X2 Blues Transcription (contracts §6.6): bass ≥ 0.90, then changes ≥ 0.85, then melody ≥ 0.85", () => {
  test("the order and the marks", () => {
    expect(X2_CHECKS.map((c) => [c.id, c.pass, c.after ?? []])).toEqual([
      ["bass", 0.9, []],
      ["changes", 0.85, ["bass"]],
      ["melody", 0.85, ["changes"]],
    ]);
    expect(SONG_LADDER_PASS[6]).toEqual({ bass: 0.9, changes: 0.85, melody: 0.85 });
    expect(nextSongStage(["bass"])).toBe("changes");
  });
  test("each stage passes on the transcription; the swung melody is compared on the straightened grid", async () => {
    const [bass, changes, melody] = X2_CHECKS as [PhraseCheck, PhraseCheck, PhraseCheck];
    const head = "setcpm(96/4)\n\n";
    expect(phraseCheckPassed(await gradeX2(bass, `${head}bass: ${L.bass}`))).toBe(true);
    // Root-position triads where the strain has sevenths: changes compare on the triad core.
    const triads = L.chords.replace(/7/g, "");
    expect(phraseCheckPassed(await gradeX2(changes, `${head}bass: ${L.bass}\nchords: ${triads}`))).toBe(true);
    const mel = await gradeX2(melody, `${head}mel: ${L.melody}`);
    expect(phraseCheckPassed(mel)).toBe(true);
    expect(mel.mode).toBe("capstone");
    // Played straight, the same notes still line up (swing is given), with a note that it should swing.
    const straight = await gradeX2(melody, `${head}mel: ${L.melody.replace(".swingBy(1/3, 4)", "")}`);
    expect(straight.score).toBeGreaterThanOrEqual(0.85);
  });
  test("a bass that misses three bars is under 0.90; changes with IV where V belongs fail", async () => {
    const [bass, changes] = X2_CHECKS as [PhraseCheck, PhraseCheck];
    const head = "setcpm(96/4)\n\n";
    const wrong = L.bass
      .replace("[d2 ~ a2 ~] [c2 ~ g2 ~]", "[e2 ~ b2 ~] [f2 ~ c3 ~]")
      .replace(/\[d2 ~ a2 ~\]>/, "[e2 ~ b2 ~]>");
    const missed = await gradeX2(bass, `${head}bass: ${wrong}`);
    expect(missed.score).toBeLessThan(0.9);
    expect(phraseCheckPassed(missed)).toBe(false);
    // IV where V belongs (bars 9 and 12): named chord by chord.
    const noV = await gradeX2(changes, `${head}bass: ${L.bass}\nchords: ${L.chords.replace(/D7/g, "C7")}`);
    expect(noV.messages.map((m) => m.text)).toContain("Chord 6: IV7, expected V7.");
    // A strain that never leaves I in the first eight bars is no transcription of these changes.
    const flat = L.chords.replace("<G7 C7 G7 G7 C7 C7", "<G7 G7 G7 G7 G7 G7").replace(/D7/g, "C7");
    expect(phraseCheckPassed(await gradeX2(changes, `${head}bass: ${L.bass}\nchords: ${flat}`))).toBe(false);
  });
});

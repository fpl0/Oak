// The review lint (Wave 6, d2): try-it code in the piece's key, arrange() in STYLE §10's form, prose inside the
// learner's vocabulary. Each rule is shown refusing the defect the live C5 review had and letting good work through.
import { describe, expect, test } from "bun:test";
import { validateCapstoneReview } from "../reviews.ts";
import {
  arrangeProblems,
  chordsIn,
  HARMONY_TERMS,
  proseProblems,
  SECTION_CONST,
  tryKeyProblem,
} from "./review.ts";

describe("a try-it is in the piece's key", () => {
  test("the live defect: a I-IV-V-I in F for a piece in C", () => {
    expect(tryKeyProblem('chords: chord("<F Bb C F>").voicing().s("piano")', ["C major"])).toBe(
      "reads in F major (chords F Bb C F); the piece is in C major: write the try-it in C major",
    );
    expect(tryKeyProblem('mel: n("<0 2 4 2>").scale("F4:major").s("piano")', ["C major"])).toBe(
      "written in F major (its .scale()); the piece is in C major: write the try-it in C major",
    );
  });

  test("the piece's own key in any octave, mode or spelling of the home note is accepted", () => {
    for (const code of [
      'mel: n("0 2 4").scale("C4:major").s("piano")',
      'bass: n("0 4").scale("C2:major").s("ebass")',
      'riff: n("0 1 2").scale("C4:blues").s("piano")',
      'mel: n("0 2").scale("C4:minor:pentatonic").s("piano")',
    ])
      expect(tryKeyProblem(code, ["C blues"])).toBeNull();
    expect(tryKeyProblem('mel: n("0").scale("Db4:major")', ["C# major"])).toBeNull();
    expect(tryKeyProblem('mel: n("0").scale("A3:harmonic:minor")', ["A minor"])).toBeNull();
    expect(tryKeyProblem('mel: n("0").scale("C4:major")', ["A minor"])).toContain("the piece is in A minor");
  });

  test("chords from outside the key are colour, not another key, when the try-it starts or ends at home", () => {
    // A borrowed bVII, a V of V, the run bVI bVII I, a ii-V with no I: all inside C major.
    for (const chords of ["C Bb F C", "C D7 G7 C", "Ab Bb C", "Dm G", "Am F C G", "F G C", "C Fm C"])
      expect(tryKeyProblem(`chords: chord("<${chords}>").voicing()`, ["C major"])).toBeNull();
    // Sitting in another key from start to end is not.
    expect(tryKeyProblem('chords: chord("<Gm C F>").voicing()', ["C major"])).toContain("reads in F major");
    expect(tryKeyProblem('chords: chord("<Em Am D G>").voicing()', ["C major"])).toContain(
      "reads in G major",
    );
    expect(tryKeyProblem('chords: chord("<Dm Gm A Dm>").voicing()', ["A minor"])).toContain(
      "reads in D minor",
    );
  });

  test("a piece that changes key accepts each of its keys; notes alone and drums are not judged", () => {
    const keys = ["C major", "D major"];
    expect(tryKeyProblem('mel: n("0 2").scale("<C4:major D4:major>")', keys)).toBeNull();
    expect(tryKeyProblem('chords: chord("<G A D D>").voicing()', keys)).toBeNull();
    expect(tryKeyProblem('mel: n("0 2").scale("E4:major")', keys)).toContain("C major or D major");
    expect(tryKeyProblem('bass: note("<f2 bb2 c3 f2>").s("ebass")', ["C major"])).toBeNull();
    expect(tryKeyProblem('kick: s("bd ~ bd ~")', ["C major"])).toBeNull();
    expect(tryKeyProblem('chords: chord("<F Bb C F>")', [])).toBeNull();
  });

  test("chord symbols are read by root and triad quality", () => {
    expect(
      chordsIn('chords: chord("<C^7 Dm7 [G7 Bo7] F#m7b5/A>!2")').map((c) => `${c.pc}${c.quality}`),
    ).toEqual(["0", "2m", "7", "11o", "6o"]);
  });
});

describe("arrange() as STYLE section 10 writes it", () => {
  const GOOD = [
    'const chordsVerse = chord("<C Am F G>").voicing()',
    'const chordsChorus = chord("<F G C C>").voicing()',
    'const melVerse = n("<0 2 4 2>")',
    'const melChorus2 = n("<4 5 7 5>")',
    'chords: arrange([4, chordsVerse], [4, chordsChorus]).s("piano")',
    'mel: arrange([4, melVerse], [4, melChorus2]).scale("C4:major").s("piano")',
  ].join("\n");

  test("section consts joined by one arrange() per labelled track pass", () => {
    expect(arrangeProblems(GOOD)).toEqual([]);
    expect(arrangeProblems('mel: n("0 2 4").scale("C4:major")')).toEqual([]);
    expect(
      arrangeProblems('bass: arrange([4, silence], [4, bassChorus])\nconst bassChorus = n("0")'),
    ).toEqual([]);
    for (const name of [
      "drumsVerse",
      "bassChorus",
      "chordsBridge",
      "melChorus2",
      "melA",
      "chordsB2",
      "melLift",
    ])
      expect(SECTION_CONST.test(name)).toBe(true);
    for (const name of ["v", "verse", "a", "MelVerse", "changes"])
      expect(SECTION_CONST.test(name)).toBe(false);
  });

  test("the live defect: arrange() over inline patterns", () => {
    const problems = arrangeProblems(
      'chords: arrange([4, chord("<C Am F G>").voicing()], [4, chord("<F G C C>").voicing()]).s("piano")',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("arrange() joins section consts, not inline patterns");
  });

  test("an undeclared section, a name that is not <role><Section>, a wrapped or unlabelled arrange, uneven tracks", () => {
    expect(arrangeProblems("chords: arrange([4, chordsVerse], [4, chordsChorus])")[0]).toContain(
      "uses chordsVerse, which the try-it does not declare",
    );
    expect(
      arrangeProblems(
        'const a = chord("<C F>")\nconst b = chord("<G C>")\nchords: arrange([4, a], [4, b])',
      )[0],
    ).toContain("section consts are named <role><Section>");
    expect(
      arrangeProblems(
        'const melVerse = n("0")\nconst melChorus = n("4")\nmel: stack(arrange([4, melVerse], [4, melChorus]))',
      )[0],
    ).toContain("one arrange() per track, nothing wrapping it");
    expect(arrangeProblems('const melVerse = n("0")\narrange([4, melVerse])')[0]).toContain("labelled track");
    expect(arrangeProblems(`${GOOD}\nconst bassVerse = n("0")\nbass: arrange([8, bassVerse])`).at(-1)).toBe(
      "every arranged track lists the same sections with the same bar counts",
    );
    expect(arrangeProblems('const melVerse = n("0")\nmel: arrange(melVerse)')[0]).toContain(
      "each arrange() entry is a pair [bars, sectionConst]",
    );
  });
});

describe("prose stays inside the learner's vocabulary", () => {
  const U06 = new Set(["term.cadence", "term.authentic-cadence", "term.half-cadence", "term.roman-numeral"]);

  test('the live defect: "perfect authentic cadence" is never a course term; "authentic cadence" is, once met', () => {
    expect(proseProblems("Bar 8 lands a perfect authentic cadence.", U06)).toEqual([
      '"perfect authentic cadence" is not a term this course uses: say "authentic cadence" once the learner has met it, or "the V chord going home to I"',
    ]);
    expect(proseProblems("Bar 8 is an authentic cadence; bar 4 a half cadence.", U06)).toEqual([]);
    expect(proseProblems("Bar 8 is an authentic cadence.", new Set())[0]).toContain(
      '"authentic cadence" is a term the learner has not met yet',
    );
    expect(proseProblems("An imperfect authentic cadence (IAC) in bar 4.", U06)).toHaveLength(1);
  });

  test("a term waits for its lesson; without the whole list only never-taught names are refused", () => {
    const text = "The D7 is a secondary dominant and bar 9 modulates through a pivot chord.";
    expect(proseProblems(text, U06).map((p) => /"([^"]+)"/.exec(p)?.[1])).toEqual([
      "secondary dominant",
      "pivot chord",
      "modulates",
    ]);
    expect(proseProblems(text, null)).toEqual([]);
    expect(
      proseProblems(text, new Set(["term.secondary-dominant", "term.pivot-chord", "term.modulation"])),
    ).toEqual([]);
    // Wave 7: tritone substitution is a jazz-track term now (J5.L01), refused only when the learner has not met it.
    expect(proseProblems("A tritone substitution over the subdominant.", null)).toHaveLength(1);
    expect(proseProblems("A tritone substitution over the subdominant.", new Set())).toHaveLength(2);
    expect(proseProblems("A tritone substitution here.", new Set(["term.tritone-sub"]))).toEqual([]);
  });

  test("everyday words and bar-anchored description are left alone", () => {
    for (const text of [
      "The bass and kick lock together on beat 1, so the groove feels steady.",
      "Ending on 1 over the tonic chord closes the phrase.",
      "The melody resolves down by step; the chords change once a bar.",
      "Bar 3 leans into bar 4, and the home note moves up 2 half steps in bar 17.",
    ])
      expect(proseProblems(text, new Set())).toEqual([]);
  });

  test("every rule compiles, is case-insensitive and names what to say instead", () => {
    // Wave 7: where case carries the meaning (numerals ii–V–i, the letters of A and B voicings, LFO and FM), the rule
    // is case-sensitive, so "ii-v" in a word or "a voicing" in plain prose is not taken for the name.
    const caseMatters = new Set([
      "term.minor-ii-v-i",
      "term.ii-v-i",
      "term.a-voicing",
      "term.b-voicing",
      "term.lfo",
      "term.fm-synthesis",
    ]);
    for (const r of HARMONY_TERMS) {
      if (!caseMatters.has(r.term ?? "")) expect(r.re.flags).toContain("i");
      expect(r.say.length).toBeGreaterThan(8);
      expect(r.term === null || r.term.startsWith("term.")).toBe(true);
    }
  });
});

describe("the lint inside review validation", () => {
  const review = (over: { tryCode?: string; why?: string; linerNote?: string }) => ({
    strengths: [
      { text: "Bar 1 starts on the home chord and bar 4 stops on G.", bars: [1, 4] },
      { text: "The tune moves by step in bars 2 and 3.", bars: [2, 3] },
    ],
    revisions: [
      {
        title: "Land bar 8 on 1",
        bars: [8, 8],
        why: over.why ?? "The tune ends on 5, so the loop sounds open.",
        tryCode: over.tryCode ?? 'mel: n("<4 2 1 0>").scale("C4:major").s("piano")',
        skills: [],
      },
    ],
    listeningQuestion: "Does bar 8 sound finished?",
    linerNote: over.linerNote ?? "Eight bars in C that stop on G and start again.",
  });
  const rules = {
    revisions: 1 as const,
    totalBars: 8,
    lint: { keys: ["C major"], introduced: new Set<string>() },
  };

  test("a clean review passes; each defect is a problem at its field", () => {
    expect(validateCapstoneReview(review({}), rules)).toMatchObject({ ok: true });
    expect(
      validateCapstoneReview(review({ tryCode: 'mel: n("<4 2 1 0>").scale("F4:major").s("piano")' }), rules),
    ).toEqual({
      ok: false,
      problems: [
        "revisions[0].tryCode: written in F major (its .scale()); the piece is in C major: write the try-it in C major",
      ],
    });
    const arranged = validateCapstoneReview(
      review({ tryCode: 'mel: arrange([4, n("0 2")], [4, n("4 2")]).scale("C4:major")' }),
      rules,
    );
    expect(arranged.ok).toBe(false);
    expect(JSON.stringify(arranged)).toContain("revisions[0].tryCode: arrange() joins section consts");
    expect(
      validateCapstoneReview(
        review({ linerNote: "Eight bars closing on a perfect authentic cadence." }),
        rules,
      ),
    ).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('linerNote: "perfect authentic cadence"')],
    });
  });

  test("without the lint context nothing new is checked (a review of a piece whose key is unknown)", () => {
    const loose = { revisions: 1 as const, totalBars: 8 };
    expect(
      validateCapstoneReview(review({ tryCode: 'mel: n("<4 2 1 0>").scale("F4:major").s("piano")' }), loose),
    ).toMatchObject({ ok: true });
  });
});

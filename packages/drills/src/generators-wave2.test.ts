// The generators built in Wave 2 (the 17 that were `pending:`): golden tests that state the expected notes
// of each family's musical building blocks, and property tests over every family of the catalog:
//   - never an unanswerable trial (the expected answer is one of the options; a code answer reproduces the
//     stimulus; a sung or tapped trial has targets),
//   - never two identical options (and, for the code families, never two that sound the same),
//   - answers and options inside the learner's taught vocabulary for the level (only open categories).
// The shown code against headless Strudel is generators.test.ts's job (it runs every family).
import { describe, expect, test } from "bun:test";
import type { Answer, FamilyDef, KeySpec, LevelParams, Trial } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { FAMILIES } from "./catalog/families.ts";
import { bindFamily, DEFAULT_PROFILE, generateTrial, gradeTrial } from "./engine.ts";
import { FN_CATEGORIES, MINI_OPS, type MiniOp, miniMutations, miniOpsOf } from "./gen/code.ts";
import { EXTENSION_SETS, EXTENSION_VOICINGS, guideLine } from "./gen/jazz.ts";
import { isChordTone, NCT_PATTERNS } from "./gen/nct.ts";
import { diatonic, foreignPcs, modulationPlan } from "./gen/progression.ts";
import { CHANGES_OF, SOUND_CHANGES } from "./gen/sound.ts";
import { CHORD_TONES, mod, parsePc, rnRootPc, stepToMidi } from "./kernel.ts";
import { euclid, parseMini, parseMiniCode } from "./mini.ts";
import { rn } from "./music.ts";
import { query } from "./pat.ts";
import { createRng, trialSeed } from "./rng.ts";

const WAVE2 = [
  "code-mini",
  "code-functions",
  "rhythm-groove-lock",
  "rhythm-polyrhythm",
  "melody-nct",
  "harmony-progression",
  "harmony-chromatic",
  "harmony-modulation",
  "form-sections",
  "form-blues",
  "jazz-guide",
  "jazz-voicing",
  "jazz-extension",
  "jazz-chord-scale",
  "jazz-subs",
  "sound-params",
  "sound-roles",
];
const fam = (generator: string): FamilyDef => FAMILIES.find((f) => f.generator === generator) as FamilyDef;
const SEEDS = Number(process.env.OAK_DRILL_SEEDS ?? 24);

/** Trials of one level with only that level's categories open (what a learner at that level has been taught). */
function trialsAt(def: FamilyDef, levelNo: number, n: number, tag = "p"): Trial<Answer>[] {
  const runtime = bindFamily(def);
  const level = def.levels[levelNo - 1] as LevelParams;
  const out: Trial<Answer>[] = [];
  let prev: Trial<Answer> | undefined;
  for (let i = 0; i < n; i++) {
    const t = generateTrial(
      runtime,
      {
        index: i,
        family: def.id,
        level: levelNo,
        category: level.categories[i % level.categories.length] as string,
        seed: trialSeed(def.id, `${tag}-${levelNo}`, i),
      },
      DEFAULT_PROFILE,
      level.categories,
      prev,
    ) as Trial<Answer>;
    out.push(t);
    prev = t;
  }
  return out;
}

// --- golden: the musical building blocks ---------------------------------------------------------

describe("golden: mini-notation", () => {
  test("Euclid as Strudel plays it: (3,8) x..x..x., (5,8) x.xx.xx., rotation moves onsets later", () => {
    const x = (b: boolean[]) => b.map((v) => (v ? "x" : ".")).join("");
    expect(x(euclid(3, 8))).toBe("x..x..x.");
    expect(x(euclid(5, 8))).toBe("x.xx.xx.");
    expect(x(euclid(3, 8, 2))).toBe("x.x..x..");
    expect(x(euclid(4, 7))).toBe("x.x.x.x");
  });
  test("polymeter continues across bars: {bd sd hh}%4 is bd sd hh bd | sd hh bd sd | hh bd sd hh", () => {
    const bars = [0, 1, 2].map((c) =>
      query(parseMini("{bd sd hh}%4"), c + 1, c)
        .map((e) => e.v)
        .join(" "),
    );
    expect(bars).toEqual(["bd sd hh bd", "sd hh bd sd", "hh bd sd hh"]);
  });
  test("operators read from a string; look-alikes are proposed as near misses", () => {
    expect([...miniOpsOf("bd!3 sd")].sort()).toEqual(["replicate", "seq"]);
    expect([...miniOpsOf("[bd,hh] sd")].sort()).toEqual(["seq", "stack"]);
    expect([...miniOpsOf("bd [sd sd] <cp rim>")].sort()).toEqual(["alt", "seq", "sub"]);
    expect(miniMutations("bd!3 sd")).toEqual(
      expect.arrayContaining(["bd*3 sd", "bd@3 sd", "bd!2 sd", "bd!4 sd"]),
    );
  });
});

describe("golden: non-chord tones", () => {
  test("every pattern has exactly one non-chord tone, of its kind", () => {
    for (const [kind, pats] of Object.entries(NCT_PATTERNS))
      for (const p of pats) {
        let at = 0;
        const notes = p.mel.map(([s, l]) => {
          const o = { s, at, l };
          at += l;
          return o;
        });
        expect(at).toBe(8);
        const chordAt = (t: number) => (t < 4 ? p.chords[0] : p.chords[1]);
        const nct = notes.filter((n, i) => {
          // A suspension is consonant where it starts and dissonant once the chord changes under it.
          if (kind === "suspension" && i === p.marked) return !isChordTone(n.s, chordAt(4));
          return !isChordTone(n.s, chordAt(n.at));
        });
        expect([kind, nct.length]).toEqual([kind, 1]);
        const m = notes[p.marked] as (typeof notes)[number];
        const prev = notes[p.marked - 1] as (typeof notes)[number];
        const next = notes[p.marked + 1] as (typeof notes)[number];
        const step = (a: number, b: number) => Math.abs(a - b) === 1;
        if (kind === "passing")
          expect(step(prev.s, m.s) && step(m.s, next.s) && (m.s - prev.s) * (next.s - m.s) > 0).toBe(true);
        if (kind === "neighbour") expect(step(prev.s, m.s) && next.s === prev.s).toBe(true);
        if (kind === "appoggiatura") {
          expect(Math.abs(m.s - prev.s)).toBeGreaterThan(1);
          expect(step(m.s, next.s)).toBe(true);
          expect(m.at % 4).toBe(0);
        }
        if (kind === "suspension") {
          expect(isChordTone(m.s, chordAt(m.at))).toBe(true);
          expect(m.at < 4 && m.at + m.l > 4).toBe(true);
          expect(next.s).toBe(m.s - 1);
        }
      }
  });
  test("C major passing tone: E F | G G over I | V (F4 is the passing tone)", () => {
    const p = (
      NCT_PATTERNS.passing as (typeof NCT_PATTERNS)[string]
    )[0] as (typeof NCT_PATTERNS)[string][number];
    const key: KeySpec = { tonic: "C", mode: "major" };
    // E4 F4 G4 G4.
    expect(p.mel.map(([s]) => stepToMidi(s, key, 4))).toEqual([64, 65, 67, 67]);
    expect(p.chords).toEqual(["I", "V"]);
  });
});

describe("golden: progressions, chromatic chords, modulation", () => {
  const C: KeySpec = { tonic: "C", mode: "major" };
  const Am: KeySpec = { tonic: "A", mode: "minor" };
  test("diatonic chords and their numerals (minor with the harmonic V and vii°)", () => {
    expect(diatonic(C, 5, { seventh: true })).toMatchObject({
      rn: "V7",
      chord: { degree: "5", quality: "7" },
    });
    expect(diatonic(C, 2, { seventh: true }).rn).toBe("ii7");
    expect(diatonic(C, 7, { seventh: true }).rn).toBe("viiø7");
    expect(diatonic(C, 1, { seventh: true }).rn).toBe("Imaj7");
    expect(diatonic(C, 5, { inversion: 1 }).rn).toBe("V6");
    expect(diatonic(Am, 5).rn).toBe("V");
    expect(diatonic(Am, 6).rn).toBe("VI");
    expect(diatonic(Am, 3).rn).toBe("III");
    expect(diatonic(Am, 7).rn).toBe("viio");
    // E major in A minor: the leading tone G♯ (pc 8) is the one foreign note.
    expect(foreignPcs(diatonic(Am, 5).chord, Am)).toEqual([8]);
  });
  test("V7/V in C is D F♯ A C; ♭VII is B♭ D F; iv is F A♭ C", () => {
    const pcs = (c: Parameters<typeof rnRootPc>[0]) =>
      CHORD_TONES[c.quality].semis.map((s) => mod(rnRootPc(c, C) + s, 12));
    expect(pcs({ degree: "5", quality: "7", of: "5" })).toEqual([2, 6, 9, 0]);
    expect(pcs(rn("b7", "maj"))).toEqual([10, 2, 5]);
    expect(pcs(rn("4", "min"))).toEqual([5, 8, 0]);
    expect(foreignPcs({ degree: "5", quality: "7", of: "5" }, C)).toEqual([6]);
  });
  test("every modulation plan: the answer bar is the first chord outside the old key, and the new key's", () => {
    const scale = (k: KeySpec) =>
      [0, 2, 4, 5, 7, 9, 11].map((x) =>
        mod(
          parsePc(k.tonic).pc +
            x +
            (k.mode === "minor"
              ? ([0, 0, -1, 0, 0, -1, -1][[0, 2, 4, 5, 7, 9, 11].indexOf(x)] as number)
              : 0),
          12,
        ),
      );
    /** Pitch classes of a chord of the plan (spelled in its own key) outside `k`. */
    const outside = (c: { chord: Parameters<typeof rnRootPc>[0]; key: KeySpec }, k: KeySpec) =>
      CHORD_TONES[c.chord.quality].semis
        .map((x) => mod(rnRootPc(c.chord, c.key) + x, 12))
        .filter((pc) => !scale(k).includes(pc));
    for (const cat of ["truck-driver", "relative", "dominant-pivot", "none"])
      for (let seed = 1; seed <= 20; seed++) {
        const plan = modulationPlan(createRng(seed), cat, C);
        expect(plan.chords.length).toBe(8);
        const firstForeign = plan.chords.findIndex((c) => outside(c, C).length > 0);
        if (cat === "none") {
          // No key change (Wave 6): the phrase starts again in the same key, or one secondary dominant
          // visits and the phrase comes home: one chord outside the key at most, a dominant seventh that
          // resolves a fifth down.
          expect(plan.at).toBeNull();
          const foreign = plan.chords.filter((c) => outside(c, C).length > 0);
          expect(foreign.length).toBeLessThanOrEqual(1);
          if (firstForeign >= 0) {
            const v = plan.chords[firstForeign] as (typeof plan.chords)[number];
            const next = plan.chords[firstForeign + 1] as (typeof plan.chords)[number];
            expect(v.chord.quality).toBe("7");
            expect(mod(rnRootPc(v.chord, v.key) - rnRootPc(next.chord, next.key), 12)).toBe(7);
          }
          // Every chord is spelled in the old key.
          for (const c of plan.chords) expect(c.key).toEqual(C);
        } else {
          expect([cat, seed, plan.at]).toEqual([cat, seed, firstForeign + 1]);
          // From there on every chord fits the new key (a minor key with its raised leading tone).
          const nk = plan.newKey as KeySpec;
          for (const c of plan.chords.slice(firstForeign)) {
            const out = outside(c, nk);
            expect([
              cat,
              out.every((pc) => nk.mode === "minor" && pc === mod(parsePc(nk.tonic).pc + 11, 12)),
            ]).toEqual([cat, true]);
          }
        }
      }
  });
});

describe("golden: jazz", () => {
  test("guide-tone lines: ii–V–I in C from the 3rd is F F E; from the 7th C B B", () => {
    const prog = [rn("2", "m7"), rn("5", "7"), rn("1", "maj7")].map((c) => ({
      rootPc: rnRootPc(c, { tonic: "C", mode: "major" }),
      quality: c.quality,
    }));
    expect(guideLine(prog, 0, 64).map((m) => mod(m, 12))).toEqual([5, 5, 4]);
    expect(guideLine(prog, 1, 64).map((m) => mod(m, 12))).toEqual([0, 11, 11]);
  });
  test("extension voicings are chord tones of their quality (as @oak/theory reads the symbol)", () => {
    for (const set of Object.values(EXTENSION_SETS))
      for (const q of set) {
        const tones = CHORD_TONES[q].semis.map((s) => mod(s, 12));
        for (const s of EXTENSION_VOICINGS[q] ?? [])
          expect([q, tones.includes(mod(s, 12))]).toEqual([q, true]);
        const id = theory.parseChordSymbol(`C${q === "maj7" ? "^7" : q === "maj7#11" ? "^7#11" : q}`);
        expect(id).not.toBeNull();
      }
    // The altered dominant has every altered tension (contracts' theory table): ♭9 ♯9 ♯11 ♭13.
    expect([...CHORD_TONES["7alt"].semis]).toEqual([0, 4, 10, 13, 15, 18, 20]);
  });
});

describe("golden: sound", () => {
  test("every change is a real difference in one control; every category names its changes", () => {
    for (const c of Object.values(SOUND_CHANGES)) expect(c.from).not.toBe(c.to);
    for (const ids of Object.values(CHANGES_OF))
      for (const id of ids) expect(SOUND_CHANGES[id]).toBeDefined();
  });
});

// --- properties over every Wave 2 family ----------------------------------------------------------

describe("properties: answerable, distinct options, taught vocabulary", () => {
  for (const generator of WAVE2) {
    const def = fam(generator);
    test(`${def.id}`, () => {
      const all = def.categories.map((c) => c.id);
      for (let levelNo = 1; levelNo <= def.levels.length; levelNo++) {
        const level = def.levels[levelNo - 1] as LevelParams;
        for (const t of trialsAt(def, levelNo, SEEDS)) {
          const p = t.params;
          const exp = t.expected;
          // Answerable.
          if (p.mode === "tap") expect((p.tapTargets as number[]).length).toBeGreaterThan(0);
          else if (p.mode === "sing") expect((p.singTargets as unknown[]).length).toBeGreaterThan(0);
          else if (p.mode === "code") {
            const parsed = parseMiniCode(exp.text?.[0] as string, Number(p.answerBars));
            expect(parsed.ok).toBe(true);
            const r = gradeTrial(bindFamily(def), t, { answer: exp, rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
            expect(r.credit).toBe(1);
          } else if (exp.rn) expect(exp.rn.length).toBe(Number(p.slots));
          else {
            const options = p.options as string[];
            expect(Array.isArray(options)).toBe(true);
            for (const c of exp.choice ?? []) expect(options).toContain(c);
            // Distinct options.
            expect(new Set(options).size).toBe(options.length);
            expect(options.length).toBeGreaterThanOrEqual(2);
            // Taught vocabulary: an option that names a category of the family is one of this level's.
            for (const o of options) if (all.includes(o)) expect(level.categories).toContain(o);
            const r = gradeTrial(bindFamily(def), t, { answer: exp, rtMs: 1, replays: 0 }, DEFAULT_PROFILE);
            expect(r.credit).toBe(1);
          }
          expect(level.categories).toContain(t.category);
        }
      }
    });
  }

  test("code.functions: every candidate uses only functions of the level's categories", () => {
    const def = fam("code-functions");
    const USES: Record<string, RegExp> = {
      "scale-patterned": /\.scale\("</,
      transpose: /\.transpose\(/,
      arp: /\.arp\(/,
      add: /\.add\(/,
      rev: /\.rev\(/,
      "scale-transpose": /\.scaleTranspose\(/,
      "root-notes": /\.rootNotes\(/,
    };
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++) {
      const cats = (def.levels[levelNo - 1] as LevelParams).categories;
      for (const t of trialsAt(def, levelNo, SEEDS, "fn"))
        for (const o of t.params.options as string[])
          for (const [cat, re] of Object.entries(USES))
            if (re.test(o)) expect([o, cats.includes(cat)]).toEqual([o, true]);
    }
  });

  test("code.mini: options sound different and use only the level's operators", () => {
    const def = fam("code-mini");
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++) {
      const ops = new Set<MiniOp>([
        "seq",
        ...((def.levels[levelNo - 1] as LevelParams).categories as MiniOp[]),
      ]);
      for (const t of trialsAt(def, levelNo, SEEDS, "voc")) {
        const texts =
          t.params.mode === "code" ? [t.expected.text?.[0] as string] : (t.params.options as string[]);
        const bars = Number(t.params.bars);
        const sigs = texts.map((x) =>
          query(parseMini(x), bars)
            .map((e) => `${e.onset[0] / e.onset[1]}|${e.v}`)
            .sort()
            .join(" "),
        );
        expect(new Set(sigs).size).toBe(sigs.length);
        for (const x of texts) for (const op of miniOpsOf(x)) expect([x, ops.has(op)]).toEqual([x, true]);
        expect(MINI_OPS).toContain(t.category as MiniOp);
      }
    }
  });
});

// --- the code families against headless Strudel ----------------------------------------------------

describe("Strudel: the candidates of the code families", () => {
  test("code.functions: the right candidate plays the stimulus, every other one plays something else", async () => {
    const def = fam("code-functions");
    expect([...def.categories.map((c) => c.id)].sort()).toEqual([...FN_CATEGORIES].sort());
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++)
      for (const t of trialsAt(def, levelNo, 8, "strudel")) {
        const bars = Number(t.params.bars);
        const sig = (evs: { onset: number; midi: number | null }[]) =>
          evs
            .map((e) => `${Math.round(e.onset * 960)}|${e.midi}`)
            .sort()
            .join(" ");
        const want = sig(t.events.map((e) => ({ onset: e.onset[0] / e.onset[1], midi: e.midi })));
        for (const o of t.params.options as string[]) {
          const res = await evalHeadless(`setcpm(30)\n\nmel: ${o}.s("piano")`, bars);
          expect([o, res.logs]).toEqual([o, []]);
          const got = sig(res.events.map((e) => ({ onset: e.onset, midi: e.midi })));
          expect([o, got === want]).toEqual([o, o === t.expected.choice?.[0]]);
        }
      }
  }, 120_000);

  test('code.mini: every option, in s("…"), plays as our parser reads it', async () => {
    const def = fam("code-mini");
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++)
      for (const t of trialsAt(def, levelNo, 6, "strudel")) {
        const bars = Number(t.params.bars ?? t.params.answerBars);
        const texts =
          t.params.mode === "code" ? [t.expected.text?.[0] as string] : (t.params.options as string[]);
        for (const x of texts) {
          const res = await evalHeadless(`setcpm(30)\n\nd: s("${x}")`, bars);
          const theirs = res.events.map((e) => `${e.onset}|${e.s}`).sort();
          const ours = query(parseMini(x), bars)
            .map((e) => `${e.onset[0] / e.onset[1]}|${e.v}`)
            .sort();
          expect([x, theirs]).toEqual([x, ours]);
        }
      }
  }, 120_000);

  test("snd.params: the shown code sets bar 1 and bar 2 to the values the trial plays", async () => {
    const def = fam("sound-params");
    const alias: Record<string, string> = {
      cutoff: "cutoff",
      resonance: "resonance",
      attack: "attack",
      release: "release",
      room: "room",
      delay: "delay",
    };
    for (let levelNo = 1; levelNo <= def.levels.length; levelNo++)
      for (const t of trialsAt(def, levelNo, 6, "strudel")) {
        const res = await evalHeadless(t.code, 2);
        const byBar = t.params.controlsByBar as Record<string, number>[];
        for (const e of res.events) {
          const bar = Math.floor(e.onset);
          for (const [k, v] of Object.entries(byBar[bar] as Record<string, number>)) {
            if (!(k in alias) && !["delaytime", "delayfeedback"].includes(k)) continue;
            const got = e.value[k];
            // A control the code does not set is at Strudel's default (no filter, no room, no delay).
            if (got === undefined)
              expect([k, v === 0 || k === "resonance" || k === "attack" || k === "release"]).toEqual([
                k,
                true,
              ]);
            else expect([k, got]).toEqual([k, v]);
          }
        }
      }
  }, 60_000);
});

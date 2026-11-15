// The advanced tracks' ten fact decks (`WAVE7_DECKS`, contracts 1.8 §7.3) against @oak/theory, content-kit's
// timing tables and headless Strudel: every answer is the one the theory computes or Strudel plays, every chord
// symbol is one `chord()` plays as that chord (and so is every accepted spelling), every prompt states the form of
// its answer and never shows the answer as its example, each card opens at a lesson its §7.3 row names, after the
// deck's first lesson in every legal order, and the tools a card names are unlocked by then.
import { describe, expect, test } from "bun:test";
import {
  AVAILABLE_TENSIONS,
  CLAVE_GRIDS,
  defineDeck,
  type FactDeck,
  type SessionId,
  voicingShapeOf,
} from "@oak/content-kit";
import { bindDeck } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { decks, families } from "../families.ts";
import { courseGraph } from "../index.ts";
import { atOrBefore, usableAt } from "../lib/course.ts";
import { toolbox } from "../toolbox.ts";
import { decks as CORE_DECKS } from "./index.ts";
import { PLANNED_DECKS } from "./planned.ts";
import {
  CHORD_SCALE_ROWS,
  CLAVE_DECK,
  CONTROL_ROWS,
  CONTROLS_DECK,
  claveEighths,
  EUCLID_DECK,
  EUCLID_ROWS,
  FORM_ROWS,
  FORMS_DECK,
  JAZZ_SYMBOLS_DECK,
  MAJOR_TWO_FIVES,
  METERS_DECK,
  MINOR_TWO_FIVES,
  POLYMETER_ROWS,
  respell,
  SUB_ROWS,
  SUBS_DECK,
  SYMBOL_ROWS,
  TENSION_ROWS,
  TENSIONS_DECK,
  TWO_FIVE_DECK,
  VOICING_ROWS,
  VOICINGS_DECK,
  WAVE7_DECKS,
} from "./wave7.ts";

const g = courseGraph();
const S = (id: string) => id as SessionId;
const cardOf = (deck: FactDeck, id: string) => {
  const c = deck.cards.find((x) => x.id === `fact.${id}`);
  expect([id, c !== undefined]).toEqual([id, true]);
  return c as FactDeck["cards"][number];
};
const credit = (deck: FactDeck, id: string, text: string[]) =>
  bindDeck(deck).grade(cardOf(deck, id), { text }, 1000).credit;
const answers = (c: FactDeck["cards"][number]) => [
  c.answer.text as string[],
  ...(c.accept ?? []).map((a) => a.text as string[]),
];
/** The pitch classes `chord()` plays for a code symbol, and its log (empty when it is a known chord). */
const played = async (symbol: string, dict?: string) => {
  const res = await evalHeadless(
    `setcpm(30)\n\nc: chord("${symbol}")${dict ? `.dict("${dict}")` : ""}.voicing().s("piano")`,
    1,
  );
  return {
    pcs: [...new Set(res.events.map((e) => (((e.midi as number) % 12) + 12) % 12))].sort((a, b) => a - b),
    logs: res.logs,
    n: res.events.length,
  };
};
const chordOf = (symbol: string) => theory.jazzSymbol(symbol).chord;
const pcsOf = (symbol: string): number[] =>
  [...new Set(theory.chordPcs(chordOf(symbol)))].sort((a, b) => a - b);

/** The §7.3 rows of contracts 1.8: deck → [first lesson, the later gates its parentheses name]. */
const ROWS: Readonly<Record<string, [string, string[]]>> = {
  "deck.jzz.symbols": ["J1.L02", ["J2.L02", "J2.L03"]],
  "deck.jzz.ii-v": ["J1.L03", ["J2.L01", "J2.L02"]],
  "deck.jzz.voicings": ["J1.L05", ["J3.L01", "J3.L02"]],
  "deck.jzz.tensions": ["J2.L03", ["J2.L04"]],
  "deck.jzz.forms": ["J4.L01", ["J4.L02", "J4.L03"]],
  "deck.jzz.subs": ["J5.L01", ["J5.L02", "J5.L03", "J5.L04"]],
  "deck.rhy.meters": ["R2.L01", ["R2.L02", "R2.L03", "R2.L05"]],
  "deck.rhy.euclid": ["R3.L01", ["R3.L03"]],
  "deck.rhy.clave": ["R3.L02", []],
  "deck.snd.controls": ["A1.L02", ["A1.L03", "A1.L04", "A1.L05", "A1.L06", "A1.L07", "A2.L05"]],
};

describe("the ten decks: switched on, shape, gates and formats", () => {
  test("exactly the ten §7.3 ids, in the course's catalog; none planned, none pending", () => {
    expect(WAVE7_DECKS.map((d) => d.id as string).sort()).toEqual(Object.keys(ROWS).sort());
    for (const d of WAVE7_DECKS)
      expect([d.id, decks.includes(d), CORE_DECKS.includes(d)]).toEqual([d.id, true, false]);
    expect(PLANNED_DECKS).toEqual([]);
    expect(decks.length).toBe(CORE_DECKS.length + 10);
  });
  test("valid, one new card a day, card IDs unique across every deck of the course", () => {
    const all = decks.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(all).size).toBe(all.length);
    for (const d of WAVE7_DECKS) {
      expect(() => defineDeck(d)).not.toThrow();
      expect([d.id, d.newPerDay, d.answer]).toEqual([d.id, 1, "text"]);
      expect(d.cards.length).toBeGreaterThanOrEqual(5);
    }
  });
  test("each deck opens at its row's first lesson; each card at that lesson or a later gate the row names, after it in every legal order", () => {
    for (const d of WAVE7_DECKS) {
      const [first, gates] = ROWS[d.id] as [string, string[]];
      expect([d.id as string, d.unlock.lesson as string]).toEqual([d.id as string, first]);
      for (const c of d.cards) {
        const gate = c.gate ?? d.unlock.lesson;
        expect([c.id, gate === first || gates.includes(gate)]).toEqual([c.id, true]);
        expect([c.id, atOrBefore(g, S(first), S(gate))]).toEqual([c.id, true]);
      }
      // Every later gate of the row deals at least one card.
      for (const gate of gates)
        expect([d.id, gate, d.cards.some((c) => c.gate === gate)]).toEqual([d.id, gate, true]);
    }
  });
  test("every prompt states the form of its answer; no example in a prompt is the card's own answer", () => {
    for (const d of WAVE7_DECKS)
      for (const c of d.cards) {
        const text = c.prompt.text ?? "";
        expect([c.id, /Write/.test(text)]).toEqual([c.id, true]);
        const own = (c.answer.text as string[]).join(" ");
        for (const m of text.matchAll(/\(([^()]*)\)/g)) {
          const shown = (m[1] as string).split(/,\s*/);
          for (const a of answers(c)) expect([c.id, shown.includes(a.join(" "))]).toEqual([c.id, false]);
        }
        // Nor in backticks, unless it is the question itself (a rhythm or a call the card asks about).
        for (const m of text.matchAll(/`([^`]*)`/g))
          if (!/^(x\(|\{|chord\(\))/.test(m[1] as string)) expect([c.id, m[1]]).not.toEqual([c.id, own]);
      }
  });
  test("grading: every answer and every accepted alternative earns full credit; a near miss earns less", () => {
    for (const d of WAVE7_DECKS)
      for (const c of d.cards)
        for (const a of answers(c))
          expect([c.id, a, bindDeck(d).grade(c, { text: a }, 1000).credit]).toEqual([c.id, a, 1]);
    // Near misses: the ii–V–I of the neighbouring key, the other rootless form, the 11 for a held clash, the
    // clave's other direction, the tritone sub's root a half step off.
    expect(credit(TWO_FIVE_DECK, "jzz.two-five.Eb-major", ["Gm7", "C7", "F^7"])).toBe(0);
    expect(credit(TWO_FIVE_DECK, "jzz.two-five.Eb-major", ["Fm7 Bb7 Eb^7"])).toBe(1);
    expect(credit(VOICINGS_DECK, "jzz.voicing.rootless-a-Dm7", ["C", "E", "F", "A"])).toBe(0);
    expect(credit(TENSIONS_DECK, "jzz.tension.Cmaj7-F", ["11"])).toBe(0);
    expect(credit(CLAVE_DECK, "rhy.clave.direction", ["3-2"])).toBe(0);
    expect(credit(SUBS_DECK, "jzz.sub.tritone-G7", ["D7"])).toBe(0);
    expect(credit(SUBS_DECK, "jzz.sub.tritone-G7", ["C#7"])).toBe(1);
  });
});

describe("jazz: every answer is @oak/theory's, every symbol one chord() plays", () => {
  test("symbols: the glyph a chart prints is the code symbol's glyph or lead-sheet spelling, and chord() plays it", async () => {
    for (const [glyph, code] of SYMBOL_ROWS) {
      const j = theory.jazzSymbol(code);
      const norm = (s: string) => s.replace(/♭/g, "b").replace(/♯/g, "#").replace("∆", "^").replace("–", "m");
      expect([code, [j.glyph, j.leadSheet].map(norm).includes(norm(glyph))]).toEqual([code, true]);
      const p = await played(code);
      expect([code, p.logs, p.n > 0]).toEqual([code, [], true]);
      for (const pc of p.pcs)
        expect([code, glyph, pc, pcsOf(code).includes(pc)]).toEqual([code, glyph, pc, true]);
    }
  }, 60_000);
  test("every accepted spelling of a chord plays the same chord as the answer; every accepted variant plays its own", async () => {
    let respelled = 0;
    for (const d of [JAZZ_SYMBOLS_DECK, TWO_FIVE_DECK, FORMS_DECK, SUBS_DECK])
      for (const c of d.cards) {
        const own = c.answer.text as string[];
        if (/^\d+$/.test(own[0] as string)) continue;
        for (const alt of (c.accept ?? []).map((a) => a.text as string[])) {
          if (alt.length !== own.length) continue;
          for (const [i, sym] of alt.entries()) {
            const mine = own[i] as string;
            if (sym === mine) continue;
            const a = await played(sym);
            expect([c.id, sym, a.logs, a.n > 0]).toEqual([c.id, sym, [], true]);
            // The same chord respelled (C♯7 for D♭7, F-7 for Fm7): the same notes.
            if (respell(sym) === mine || sym.replace("-", "m") === mine) {
              respelled++;
              expect([c.id, mine, sym, a.pcs]).toEqual([c.id, mine, sym, (await played(mine)).pcs]);
            } else {
              // A variant accepted on purpose (the minor ii–V–i's V plain or altered, its home as m6): the same
              // root and the same third as the answer's chord.
              const x = chordOf(sym);
              const y = chordOf(mine);
              const third = (ch: theory.ChordId) =>
                (theory.chordPcs(ch) as number[]).includes((ch.rootPc + 4) % 12);
              expect([c.id, mine, sym, x.rootPc, third(x)]).toEqual([c.id, mine, sym, y.rootPc, third(y)]);
            }
          }
        }
      }
    expect(respelled).toBeGreaterThan(20);
  }, 120_000);
  test("ii–V–I: the twelve major keys of twoFiveOnesAllKeys and the five minor ii–V–is of twoFiveOne with V7♭9", () => {
    const major = theory.twoFiveOnesAllKeys("major");
    expect(MAJOR_TWO_FIVES.map(([, c]) => c.join(" "))).toEqual(major.map((x) => x.symbols.join(" ")));
    for (const [key, chords] of MINOR_TWO_FIVES)
      expect(chords).toEqual(theory.twoFiveOne(key, "minor", { dominant: "7b9" }).symbols as string[]);
    expect(cardOf(TWO_FIVE_DECK, "jzz.two-five.C-major").gate).toBeUndefined();
    expect(cardOf(TWO_FIVE_DECK, "jzz.two-five.Ab-major").gate).toBe("J2.L01");
    expect(credit(TWO_FIVE_DECK, "jzz.two-five.D-minor", ["Em7b5", "A7", "Dm6"])).toBe(1);
    expect(credit(TWO_FIVE_DECK, "jzz.two-five.D-minor", ["Em7", "A7", "Dm7"])).toBeLessThan(1);
  });
  test("voicings: the notes are @oak/theory's shells, rootless A/B and drop-2, and content-kit reads each as its shape", () => {
    const pcList = (midis: readonly number[]) => midis.map((m) => ((m % 12) + 12) % 12);
    const chordVoiced = (sym: string) => {
      const c = chordOf(sym);
      const at = (n: number) => (c.rootPc + n) % 12;
      const q = c.quality;
      return {
        root: c.rootPc,
        third: at(q === "m7" ? 3 : 4),
        fifth: at(7),
        seventh: at(q === "maj7" ? 11 : 10),
        ninth: at(2),
        ...(q === "7" ? { thirteenth: at(9) } : {}),
      };
    };
    for (const [chord, what, notes] of VOICING_ROWS) {
      let midis: number[];
      if (what.startsWith("its shell"))
        midis = theory.shellVoicing(chord, what.includes("7th, 3rd") ? "1-7-3" : "1-3-7");
      else if (what.includes("rootless"))
        midis = theory.rootlessVoicing(chord, what.includes(" A ") ? "A" : "B");
      else {
        // The close voicing with the root lowest, then the second voice from the top dropped an octave.
        const c = chordOf(chord);
        const close = theory
          .chordPcs(c)
          .map((pc) => 48 + c.rootPc + ((pc - c.rootPc + 12) % 12))
          .sort((a, b) => a - b);
        midis = theory.drop2(close);
      }
      expect([chord, what, pcList(midis)]).toEqual([chord, what, notes.map((n) => theory.pcOf(n))]);
      const shape = voicingShapeOf(midis, chordVoiced(chord));
      const want = what.startsWith("its shell")
        ? "shell"
        : what.includes("drop-2")
          ? "drop-2"
          : what.includes("rootless A")
            ? "rootless-a"
            : "rootless-b";
      expect([chord, what, shape]).toEqual([chord, what, want]);
    }
  });
  test("tensions: each held note's name and clash come from AVAILABLE_TENSIONS; chord-scales are chordScales' first choice", () => {
    const LABEL: Readonly<Record<number, string>> = {
      1: "b9",
      2: "9",
      3: "#9",
      5: "11",
      6: "#11",
      8: "b13",
      9: "13",
    };
    let theoryChecked = 0;
    for (const [chord, note, answer] of TENSION_ROWS) {
      const c = chordOf(chord.replace("maj7", "^7"));
      const q = c.quality as keyof typeof AVAILABLE_TENSIONS;
      const t = AVAILABLE_TENSIONS[q] as { tensions: readonly number[]; avoid: readonly number[] };
      const semis = (theory.pcOf(note) - c.rootPc + 12) % 12;
      const want = t.avoid.includes(semis) ? "avoid" : t.tensions.includes(semis) ? LABEL[semis] : null;
      expect([chord, note, want]).toEqual([chord, note, answer]);
      // @oak/theory says the same over the first of the chord's scales that holds the note (G7's ♭9 lives in its
      // altered colours, not in Mixolydian).
      const code = chord.replace("maj7", "^7");
      const th = theory
        .chordScales(code)
        .map((sc) => theory.tensionsOf(code, sc).find((x) => x.pc === theory.pcOf(note)))
        .find((x) => x !== undefined);
      // (♭9 over a minor seventh is in none of its scales: the table's avoid note is a clash outside them.)
      if (th) {
        theoryChecked++;
        expect([chord, note, th.avoid]).toEqual([chord, note, answer === "avoid"]);
      } else expect([chord, note, answer]).toEqual([chord, note, "avoid"]);
    }
    expect(theoryChecked).toBeGreaterThanOrEqual(8);
    const name = (s: string) =>
      theory.CHORD_SCALE_NAMES[s as keyof typeof theory.CHORD_SCALE_NAMES].toLowerCase();
    for (const [chord, , key, scale] of CHORD_SCALE_ROWS) {
      const [tonic, mode] = key.split(" ") as [string, "major" | "minor"];
      const code = chord.replace("maj7", "^7").replace("♭", "b");
      const first = theory.chordScales(code, { key: { tonic, mode } })[0] as string;
      expect([chord, key, name(first).replace(" (major)", "")]).toEqual([chord, key, scale.toLowerCase()]);
    }
  });
  test("forms: turnarounds, the jazz blues in F and rhythm changes in B♭ as @oak/theory writes them", () => {
    const blues = theory.jazzBlues("F");
    const rc = theory.rhythmChanges("Bb").bars;
    const expected: Readonly<Record<string, string[]>> = {
      "turn-C": theory.turnaround("C").flat(),
      "turn-F": theory.turnaround("F").flat(),
      "turn-iii-Eb": theory.turnaround("Eb", "iii-VI-ii-V").flat(),
      "blues-F-2": blues[1] as string[],
      "blues-F-4": blues[3] as string[],
      "blues-F-6": blues[5] as string[],
      "blues-F-8": blues[7] as string[],
      "blues-F-9-10": [...(blues[8] as string[]), ...(blues[9] as string[])],
      "blues-F-11-12": [...(blues[10] as string[]), ...(blues[11] as string[])],
      "rhythm-A-1-2": [...(rc[0] as string[]), ...(rc[1] as string[])],
      "rhythm-bridge": [16, 18, 20, 22].map((i) => (rc[i] as string[])[0] as string),
      "rhythm-bars": [String(theory.RHYTHM_CHANGES_BARS)],
    };
    for (const [, chords, , id] of FORM_ROWS) expect([id, chords]).toEqual([id, expected[id] as string[]]);
    // The bridge's chords last two bars each.
    for (const i of [16, 18, 20, 22]) expect(rc[i]).toEqual(rc[i + 1]);
  });
  test("substitutions: tritone subs, backdoors, secondary ii–Vs and passing diminished chords as @oak/theory makes them", () => {
    const sym = (c: theory.ChordId) => theory.jazzSymbol(c).ireal;
    const expected: Readonly<Record<string, string[]>> = {
      "tritone-G7": [sym(theory.tritoneSub("G7"))],
      "tritone-D7": [sym(theory.tritoneSub("D7"))],
      "tritone-C7": [sym(theory.tritoneSub("C7"))],
      "tritone-F7": [sym(theory.tritoneSub("F7"))],
      "backdoor-C": theory.backdoor("C").slice(0, 2).map(sym),
      "backdoor-F": theory.backdoor("F").slice(0, 2).map(sym),
      "two-five-into-F": theory.secondaryTwoFive("F^7").map(sym),
      "two-five-into-Dm7": theory.secondaryTwoFive("Dm7").map(sym),
      "two-five-into-Am7": theory.secondaryTwoFive("Am7").map(sym),
      "passing-C-Dm": [sym(theory.diminishedPassing("C^7", "Dm7") as theory.ChordId)],
      "passing-Dm-Em": [sym(theory.diminishedPassing("Dm7", "Em7") as theory.ChordId)],
      "passing-F-G": [sym(theory.diminishedPassing("F^7", "G7") as theory.ChordId)],
    };
    for (const [, chords, , id] of SUB_ROWS) expect([id, chords]).toEqual([id, expected[id] as string[]]);
    // A tritone substitute keeps the dominant's 3rd and 7th (B and F of G7 in D♭7 as C♭ and F).
    const g7 = pcsOf("G7");
    const db7 = pcsOf("Db7");
    expect([5, 11].every((pc) => g7.includes(pc) && db7.includes(pc))).toBe(true);
  });
});

describe("rhythm: every answer is what Strudel plays or content-kit's tables say", () => {
  test("groupings: the group starts of METER_GROUPINGS; the 7/8 tempo line is STYLE §8's", () => {
    const starts = (groups: number[]) =>
      groups.map((_, i) => String(1 + groups.slice(0, i).reduce((s, x) => s + x, 0)));
    for (const c of METERS_DECK.cards) {
      const m = /grouped ([\d+]+)/.exec(c.prompt.text ?? "");
      if (!m) continue;
      const groups = (m[1] as string).split("+").map(Number);
      expect([c.id, c.answer.text]).toEqual([c.id, starts(groups)]);
      const meter = /bar of (\d\/\d)/.exec(c.prompt.text ?? "")?.[1] as string;
      const mg = theory.meterGroups((meter === "9/8" ? "9/8i" : meter) as never);
      expect(mg.groups.length).toBeGreaterThan(0);
    }
    expect(cardOf(METERS_DECK, "rhy.meter.tempo-7-8").answer.text).toEqual(["setcpm(210/7)"]);
    const h = theory.hemiola();
    expect(cardOf(METERS_DECK, "rhy.meter.hemiola-3-4").answer.text).toEqual([String(h.threeFour.length)]);
    expect(cardOf(METERS_DECK, "rhy.meter.hemiola-6-8").answer.text).toEqual([String(h.sixEight.length)]);
  });
  test("polymeter: the bar where `{ }%4` lines up again, counted on Strudel's own events", async () => {
    for (const [mini, steps, per] of POLYMETER_ROWS) {
      const c = METERS_DECK.cards.find((x) =>
        (x.prompt.text ?? "").includes(mini),
      ) as FactDeck["cards"][number];
      const bars = Number((c.answer.text as string[])[0]);
      const res = await evalHeadless(`p: s("${mini.replaceAll("bd", "x").replaceAll("hh", "x")}")`, bars + 1);
      // The cycle's first step (an x) falls on a downbeat again first at bar `bars`.
      const downbeats = res.events.map((e) => e.onset).filter((o) => Number.isInteger(o) && o > 0);
      expect([mini, Math.min(...downbeats)]).toEqual([mini, bars]);
      expect(bars).toBe(theory.polymeterPeriod(steps, per));
    }
  });
  test("Euclid: the steps are what `x(k,n,r)` plays in Strudel; the tresillo is (3,8), the cinquillo (5,8)", async () => {
    for (const [k, n, r] of EUCLID_ROWS) {
      const c = EUCLID_DECK.cards.find((x) =>
        (x.prompt.text ?? "").startsWith(`\`x(${k},${n}${r ? `,${r}` : ""})\``),
      ) as FactDeck["cards"][number];
      const res = await evalHeadless(`p: s("x(${k},${n}${r ? `,${r}` : ""})")`, 1);
      const steps = Array.from({ length: n }, () => "~");
      for (const e of res.events) steps[Math.round(e.onset * n)] = "x";
      expect([k, n, r, c.answer.text]).toEqual([k, n, r, steps]);
    }
    expect(theory.euclidIdentity([...theory.TRESILLO], 8)).toMatchObject({ pulses: 3, steps: 8 });
    expect(theory.euclidIdentity([...theory.CINQUILLO], 8)).toMatchObject({ pulses: 5, steps: 8 });
  });
  test("claves: the eighths are CLAVE_GRIDS' (son 3-2 bar 1: 1 4 7; bar 2: 3 5); rumba moves the third hit to 8", () => {
    expect(claveEighths("son", "3-2", 0)).toEqual(["1", "4", "7"]);
    expect(claveEighths("son", "3-2", 1)).toEqual(["3", "5"]);
    expect(claveEighths("rumba", "3-2", 0)).toEqual(["1", "4", "8"]);
    expect(claveEighths("son", "2-3", 0)).toEqual(claveEighths("son", "3-2", 1));
    expect(theory.claveSteps("son", "3-2")).toEqual([0, 3, 6, 10, 12]);
    const son = CLAVE_GRIDS.son["3-2"][0].map(([n, d]) => n / d);
    const rumba = CLAVE_GRIDS.rumba["3-2"][0].map(([n, d]) => n / d);
    expect(son.filter((x, i) => x !== rumba[i])).toEqual([3 / 4]);
  });
});

describe("sound: every control a card names is audible, unlocked by its gate, and runs", () => {
  test("each answer's tool is in content/toolbox.ts, marked audible, usable at the card's gate in every legal order", async () => {
    for (const [what, fn, tool, gate] of CONTROL_ROWS) {
      const entry = toolbox.find((t) => t.id === tool);
      expect([fn, tool, entry !== undefined, entry?.audible]).toEqual([fn, tool, true, true]);
      const at = gate ?? CONTROLS_DECK.unlock.lesson;
      expect([fn, at, usableAt(g, entry as (typeof toolbox)[number], S(at))]).toEqual([fn, at, true]);
      const sig = entry?.code ?? "";
      expect([fn, sig.includes(fn)]).toEqual([fn, true]);
      expect(what.length).toBeGreaterThan(10);
    }
  });
  test("the families still name the deck's first lesson as theirs (fam.snd.params at A1.L02)", () => {
    expect(families.find((f) => f.id === "fam.snd.params")?.unlock.lesson).toBe(CONTROLS_DECK.unlock.lesson);
  });
});

// Wave 4 sound (docs/design/wave4.md §3.5): the pattern player with a Band and with realism, the live editable
// ranges, every chord symbol of STYLE §5.2 through the adapter's own realm in all twelve roots, the chord
// instruments' clarity and balance, the Band's four-chord loop as a mix, Oak's rendered break, and the preloader
// for the sounds U05–U07 unlock. Every spec runs on the test page (port 5192) and the locked pack.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { bandCodeAt } from "../../../content/bands/index.ts";
import { ROWS } from "../../theory/src/chord-table.ts";
import { chordOf, chordPcs, noteToMidi, parseChordSymbol } from "../../theory/src/index.ts";
import { realismSpec } from "../src/realism.ts";
import { openPage } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: the test API is driven untyped from page.evaluate
type W = Window & { __oak: any };

const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const DICTS = ["ireal", "ireal-ext", "triads", "lefthand", "guidetones"] as const;
type Dict = (typeof DICTS)[number];
type Status = "ok" | "missing" | "wrong";

/** STYLE §5.2, parsed from content/STYLE.md itself: the test follows the table wherever it changes. */
function styleTable(): { suffix: string; dict: Dict; status: Status }[] {
  const md = readFileSync(resolve(import.meta.dirname, "../../../content/STYLE.md"), "utf8");
  const start = md.indexOf("| Symbol | `ireal` (default)");
  if (start < 0) throw new Error("STYLE §5.2 table not found");
  const lines = md.slice(start).split("\n");
  const rows = lines.slice(
    2,
    lines.findIndex((l, i) => i > 1 && !l.startsWith("|")),
  );
  const cells: { suffix: string; dict: Dict; status: Status }[] = [];
  const mark = (c: string): Status => (c === "✓" ? "ok" : c === "✗" ? "wrong" : "missing");
  for (const row of rows) {
    const [head, ...cols] = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cols.length !== DICTS.length || head === undefined) throw new Error(`bad STYLE row: ${row}`);
    const codes = [...head.matchAll(/`C([^`]*)`/g)].map((m) => m[1] as string);
    if (codes.length > 0) {
      for (const suffix of codes)
        cols.forEach((c, i) => {
          cells.push({ suffix, dict: DICTS[i] as Dict, status: mark(c) });
        });
    } else {
      // "minor-major seventh": each cell names the spelling that dictionary takes, or —.
      cols.forEach((c, i) => {
        const code = /`C([^`]*)`/.exec(c)?.[1];
        cells.push({ suffix: code ?? "m^7", dict: DICTS[i] as Dict, status: code ? "ok" : "missing" });
      });
    }
  }
  return cells;
}

const pcsOf = (notes: unknown[]): number[] =>
  [
    ...new Set(
      notes
        .map((n) => (typeof n === "number" ? n : typeof n === "string" ? noteToMidi(n) : null))
        .filter((m): m is number => m !== null && Number.isFinite(m))
        .map((m) => ((Math.round(m) % 12) + 12) % 12),
    ),
  ].sort((a, b) => a - b);

function statusOf(symbol: string, notes: unknown[]): Status {
  const c = parseChordSymbol(symbol);
  if (!c) throw new Error(`@oak/theory cannot read ${symbol}`);
  const row = ROWS.find((r) => r.quality === c.quality);
  const root = chordPcs(chordOf(c.root, c.quality))[0] as number;
  const allowed = new Set([...chordPcs(c), ...(row?.tensions ?? []).map((t) => (t + root) % 12)]);
  const pcs = pcsOf(notes);
  if (pcs.length === 0) return "missing";
  return pcs.length >= 2 && pcs.every((p) => allowed.has(p)) ? "ok" : "wrong";
}

async function slowSounds(page: Page): Promise<void> {
  await page.context().route("**/sounds/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith(".json")) await new Promise((r) => setTimeout(r, 300));
    return route.continue();
  });
}

test("every chord symbol of STYLE §5.2 resolves in the adapter's realm as the table says, in all twelve roots", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openPage(page);
  const cells = styleTable();
  expect(cells.length).toBeGreaterThan(130);
  const jobs = cells.map((c) => ({
    ...c,
    code: `chord("<${ROOTS.map((r) => `${r}${c.suffix}`).join(" ")}>").dict("${c.dict}").voicing()`,
  }));
  // The default dictionary is ireal: the column also holds without `.dict()`.
  const plain = [...new Set(cells.filter((c) => c.dict === "ireal").map((c) => c.suffix))].map((suffix) => ({
    suffix,
    dict: "ireal" as Dict,
    status: cells.find((c) => c.dict === "ireal" && c.suffix === suffix)?.status as Status,
    code: `chord("<${ROOTS.map((r) => `${r}${suffix}`).join(" ")}>").voicing()`,
  }));
  const measured = await page.evaluate(
    async ([all, n]) => {
      const { oak } = (window as unknown as W).__oak;
      const p = oak.createPatternPlayer();
      const out: { code: string; ok: boolean; notes: unknown[][] }[] = [];
      for (const j of all) {
        const r = await p.load(j.code, { bars: n, cps: 1 });
        const notes: unknown[][] = [];
        for (let i = 0; i < n; i++)
          notes.push(oak.transport.haps(i, i + 1).map((h: { value: { note?: unknown } }) => h.value.note));
        out.push({ code: j.code, ok: r.ok, notes });
      }
      p.dispose();
      return out;
    },
    [[...jobs, ...plain], ROOTS.length] as const,
  );
  const wrong: string[] = [];
  [...jobs, ...plain].forEach((j, k) => {
    const m = measured[k];
    if (!m?.ok) {
      wrong.push(`${j.code}: did not evaluate`);
      return;
    }
    ROOTS.forEach((root, i) => {
      const got = statusOf(`${root}${j.suffix}`, m.notes[i] ?? []);
      if (got !== j.status) wrong.push(`${root}${j.suffix} in ${j.dict}: ${got}, STYLE says ${j.status}`);
    });
  });
  expect(wrong).toEqual([]);
});

const POP_AXIS = bandCodeAt("band.axis-4bar", "flavour.pop", () => true).replaceAll("{{key}}", "C4:major");

test("pattern player: a Band under the hidden code follows its key, mutes by track, and a bad Band only warns", async ({
  page,
}) => {
  await openPage(page);
  const band = {
    band: "band.axis-4bar",
    flavour: "flavour.pop",
    code: POP_AXIS,
    followsLearnerKey: true,
    tracks: ["drums", "bass", "chords"],
  };
  const r = await page.evaluate(
    async ([band]) => {
      const w = window as unknown as W;
      const { oak, maxLevel } = w.__oak;
      const p = oak.createPatternPlayer();
      const code = 'mel: n("0 2 4 7").scale("G4:major").s("piano")';
      const out = await p.load(code, { bars: 4, cps: 0.5, band });
      const bar1 = (track: string) =>
        oak.transport
          .haps(0, 1)
          .filter((h: { track: string }) => h.track === track)
          .map((h: { value: { note: unknown } }) => h.value.note);
      const bass = bar1("band.bass");
      const chords = bar1("band.chords");
      await p.play();
      const level = await maxLevel(800);
      p.setMutes({ muted: new Set(["band.drums", "band.bass", "band.chords"]), solo: null });
      const mutedTracks = [
        ...new Set(oak.transport.haps(0, 2).map((h: { track: string }) => h.track)),
      ] as string[];
      p.setMutes({ muted: new Set(), solo: null });
      p.stop();
      // the same Band failing its check: the source still plays, with a warning
      const bad = await p.load(code, {
        bars: 4,
        cps: 0.5,
        band: { ...band, code: `// FORBIDDEN\n${band.code}` },
      });
      // no Band again: only the source
      const none = await p.load(code, { bars: 4, cps: 0.5, band: null });
      p.dispose();
      return {
        ok: out.ok,
        tracks: out.tracks,
        bass,
        chords,
        rms: level.rms,
        mutedTracks,
        bad: { ok: bad.ok, tracks: bad.tracks, ids: bad.diagnostics.map((d: { id: string }) => d.id) },
        none: none.tracks,
        dom: document.body.innerHTML.includes('scale("G'),
      };
    },
    [band] as const,
  );
  expect(r.ok).toBe(true);
  expect(r.tracks).toEqual(["mel", "band.drums", "band.bass", "band.chords"]);
  // the Band moved from C to the code's G: I in G is G B D over G in the bass, folded below C
  expect(pcsOf(r.bass)).toEqual([7]);
  expect(pcsOf(r.chords)).toEqual([2, 7, 11]);
  expect(Math.max(...r.bass.map((n: unknown) => noteToMidi(String(n)) ?? Number(n)))).toBeLessThan(48);
  expect(r.rms).toBeGreaterThan(0.02);
  expect(r.mutedTracks).toEqual(["mel"]);
  expect(r.bad.ok).toBe(true);
  expect(r.bad.tracks).toEqual(["mel"]);
  expect(r.bad.ids).toContain("eval.band-failed");
  expect(r.none).toEqual(["mel"]);
  expect(r.dom).toBe(false); // the hidden code never reaches the page
});

test("pattern player realism: R0 on the grid, R1–R4 bounded and deterministic, the learner's side untouched, the lead preloaded", async ({
  page,
}) => {
  await slowSounds(page);
  await openPage(page);
  const code = [
    'ref_mel: note("60 62 64 65 67 65 64 62").s("piano")',
    'ref_drums: s("hh*8")',
    'mel: note("72 ~ 74 ~").s("triangle")',
  ].join("\n");
  const specs = {
    r1: realismSpec(1, { seed: 11 }),
    r2: realismSpec(2, { seed: 11, swung: true, target: "mel" }),
    r3: realismSpec(3, { seed: 11, target: "mel" }),
    r4: realismSpec(4, { seed: 11, target: "mel", vocalLead: "tenor" }),
  };
  const r = await page.evaluate(
    async ([code, specs]) => {
      const w = window as unknown as W;
      const { oak, maxLevel } = w.__oak;
      const p = oak.createPatternPlayer();
      const cps = 0.5;
      const out = await p.load(code, { bars: 4, cps });
      type H = { track: string; begin: number; value: Record<string, unknown> };
      const take = (from = 0, to = 4): H[] => oak.transport.haps(from, to);
      const r0 = take();
      p.setRealism(specs.r1);
      const r1 = take();
      p.setRealism(specs.r1);
      const r1again = take();
      p.setRate(0.5); // the feel is the item's: slowing stretches it, never re-rolls it
      const r1slow = take();
      p.setRate(1);
      p.setRealism(specs.r2);
      const r2 = take(0, 1);
      p.setRealism(specs.r3);
      const r3 = take(0, 1);
      const before = w.__oak.logs.length;
      p.setRealism(specs.r4);
      const r4 = take(0, 1);
      const r4bar3 = take(2, 3).filter((h) => h.track === "ref_mel");
      await p.play();
      const level = await maxLevel(1500);
      p.setLoop({ fromBar: 2, bars: 1 });
      const looped = take(0, 1).filter((h) => h.track === "ref_mel");
      p.stop();
      const logs = w.__oak.logs.slice(before);
      p.dispose();
      return {
        ok: out.ok,
        r0,
        r1,
        r1again,
        r1slow,
        r2,
        r3,
        r4,
        looped,
        rms: level.rms,
        skips: logs.filter((l: { skippedSound?: string }) => l.skippedSound).length,
        notFound: logs.filter((l: { message: string }) => /not found/.test(l.message)).length,
        r4bar3,
      };
    },
    [code, specs] as const,
  );
  expect(r.ok).toBe(true);
  type H = { track: string; begin: number; value: Record<string, unknown> };
  const of = (hs: H[], t: string) => hs.filter((h) => h.track === t);
  // R0: exactly on the eighth-note grid
  expect(of(r.r0, "ref_mel").map((h) => h.begin * 8)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  // R1: every reference onset within ±15 ms of the grid (0.5 cps: ±0.0075 cycles), most of them moved
  const max = 0.015 * 0.5 + 1e-9;
  const devs = of(r.r1, "ref_mel").map((h) => h.begin - Math.round(h.begin * 8) / 8);
  expect(devs.length).toBeGreaterThanOrEqual(31);
  expect(Math.max(...devs.map(Math.abs))).toBeLessThanOrEqual(max);
  expect(devs.filter((d) => Math.abs(d) > 1e-6).length).toBeGreaterThan(24);
  expect(r.r1again).toEqual(r.r1);
  expect(r.r1slow).toEqual(r.r1);
  const vel = of(r.r1, "ref_mel").map((h) => h.value.velocity as number);
  expect(Math.min(...vel)).toBeGreaterThanOrEqual(0.8);
  expect(Math.max(...vel)).toBeLessThanOrEqual(1);
  // the learner's own track never moves, never changes
  expect(of(r.r1, "mel")).toEqual(of(r.r0, "mel"));
  expect(of(r.r4, "mel")).toEqual(of(r.r0, "mel").filter((h) => h.begin < 1));
  // R2: the drums swing (the off-beat eighth on the last triplet), the target does not; room everywhere
  const hats = of(r.r2, "ref_drums").map((h) => h.begin);
  expect(Math.abs((hats[1] as number) - 1 / 6)).toBeLessThanOrEqual(max);
  expect(of(r.r2, "ref_mel").every((h) => Math.abs(h.begin - Math.round(h.begin * 8) / 8) <= max)).toBe(true);
  expect([...of(r.r2, "ref_mel"), ...of(r.r2, "ref_drums")].every((h) => h.value.room === 0.3)).toBe(true);
  // R3: the target 6 dB down
  expect(of(r.r3, "ref_mel").every((h) => Math.abs((h.value.gain as number) - 0.5012) < 0.001)).toBe(true);
  // R4: the target on the tenor with a drift of at most ±30 cents in 10-cent steps; drums untouched in sound
  for (const h of of(r.r4, "ref_mel")) {
    expect(h.value.s).toBe("tenor");
    const cents = Math.round(((h.value.note as number) - Math.round(h.value.note as number)) * 100);
    expect(Math.abs(cents)).toBeLessThanOrEqual(30);
    expect(cents % 10).toBe(0);
  }
  expect(of(r.r4, "ref_drums").every((h) => h.value.s === "hh")).toBe(true);
  // played on a slow pack: the lead sound and its detuned pitches were warmed, nothing skipped
  expect(r.rms).toBeGreaterThan(0.01);
  expect(r.skips).toBe(0);
  expect(r.notFound).toBe(0);
  // the A–B loop plays bar 3 with the same humanised notes, at the same offsets, as the full play had there
  expect(r.looped.map((h: H) => [Math.round((h.begin + 2) * 1e6), h.value.note, h.value.velocity])).toEqual(
    r.r4bar3.map((h: H) => [Math.round(h.begin * 1e6), h.value.note, h.value.velocity]),
  );
  expect(r.looped.length).toBe(8);
});

test("editableRanges(): the regions follow every edit; null when all is editable, [] when nothing is", async ({
  page,
}) => {
  await openPage(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as W;
    const code = 'note("c4 e4").s("piano").gain(.5)';
    // two regions: the notes (c4 e4) and the gain value (.5)
    const notes = { from: code.indexOf("c4"), to: code.indexOf("e4") + 2 };
    const gain = { from: code.indexOf(".5"), to: code.indexOf(".5") + 2 };
    const e = w.__oak.mountImperative("oak_rng_0_", code, { readOnly: { editable: [notes, gain] } });
    const initial = e.editableRanges();
    // an edit inside the first region moves the second
    e.view.dispatch({ changes: { from: notes.from + 2, insert: " d4" }, userEvent: "input" });
    const afterFirst = e.editableRanges();
    // an edit outside every region is refused and moves nothing
    e.view.dispatch({ changes: { from: 0, insert: "mel: " }, userEvent: "input" });
    const afterRefused = e.editableRanges();
    e.view.dispatch({
      changes: { from: e.getCode().indexOf(".5"), to: e.getCode().indexOf(".5") + 2, insert: ".25" },
      userEvent: "input",
    });
    const afterSecond = e.editableRanges();
    const text = e.getCode();
    e.setEditable(true);
    const locked = e.editableRanges();
    e.setEditable(undefined);
    const all = e.editableRanges();
    const free = w.__oak.mountImperative("oak_rng_1_", code);
    const ro = w.__oak.mountImperative("oak_rng_2_", code, { readOnly: true });
    const out = {
      notes,
      gain,
      initial,
      afterFirst,
      afterRefused,
      afterSecond,
      text,
      locked,
      all,
      free: free.editableRanges(),
      ro: ro.editableRanges(),
    };
    e.dispose();
    free.dispose();
    ro.dispose();
    return out;
  });
  expect(r.initial).toEqual([r.notes, r.gain]);
  const moved = { from: r.gain.from + 3, to: r.gain.to + 3 };
  expect(r.afterFirst).toEqual([{ from: r.notes.from, to: r.notes.to + 3 }, moved]);
  expect(r.afterRefused).toEqual(r.afterFirst);
  expect(r.text).toBe('note("c4 d4 e4").s("piano").gain(.25)');
  expect(r.afterSecond).toEqual([
    { from: r.notes.from, to: r.notes.to + 3 },
    { from: moved.from, to: moved.to + 1 },
  ]);
  expect(r.locked).toEqual([]);
  expect(r.all).toBeNull();
  expect(r.free).toBeNull();
  expect(r.ro).toEqual([]);
});

test("the break (snd.brk) and the U05–U07 sounds: local only, preloaded by name, no first-note skips on a slow pack", async ({
  page,
}) => {
  const external: string[] = [];
  await page.context().route(/^(?!http:\/\/127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await slowSounds(page);
  await openPage(page);
  const r = await page.evaluate(async () => {
    const w = window as unknown as W;
    const { oak, maxLevel } = w.__oak;
    const report = await oak.preload({
      sounds: ["brk", "organ", "pad", "rhodes", "upright", "piano", "tenor", "choir"].map((s) => ({ s })),
    });
    const playFor = async (id: string, code: string, ms: number) => {
      const before = w.__oak.logs.length;
      const e = w.__oak.mountImperative(id, code);
      const out = await e.play();
      const level = await maxLevel(ms);
      oak.stopAll();
      await new Promise((x) => setTimeout(x, 300));
      const logs = w.__oak.logs.slice(before);
      e.dispose();
      return {
        ok: out.ok,
        rms: level.rms,
        skips: logs.filter((l: { skippedSound?: string }) => l.skippedSound).length,
        notFound: logs.filter((l: { message: string }) => /not found/.test(l.message)).length,
      };
    };
    const brk = await playFor("oak_brk_0_", 'drums: s("brk").loopAt(1)', 1200);
    const sliced = await playFor("oak_brk_1_", 'drums: s("brk").slice(8, "0 1 2 3 4 5 6 7").loopAt(1)', 1200);
    // chords in keys no warm-up touched, on every U05–U07 chord sound, from the first cycle
    const chords = await playFor(
      "oak_ch_0_",
      [
        'chords: chord("<F#m Bm E A>").voicing().s("organ").gain(.5)',
        'pad: chord("<Db Ab>").dict("triads").voicing().s("pad").gain(.4)',
        'keys: chord("<Ebm7 Ab7>").dict("lefthand").voicing().s("rhodes").gain(.5)',
        'bass: note("f#2 c#2").s("upright")',
      ].join("\n"),
      1500,
    );
    return { report, brk, sliced, chords };
  });
  expect(r.report.missing).toEqual([]);
  for (const k of ["brk", "sliced", "chords"] as const) {
    expect(r[k].ok, k).toBe(true);
    expect(r[k].rms, k).toBeGreaterThan(0.01);
    expect(r[k].skips, k).toBe(0);
    expect(r[k].notFound, k).toBe(0);
  }
  expect(external).toEqual([]);
});

/** The chord instruments of U05–U07 (piano, keys, organ, guitars, pad, strings). */
const CHORD_SOUNDS = ["piano", "rhodes", "organ", "acgtr", "cleangtr", "jazzgtr", "pad", "strings"];
/** Root position, first and second inversion, from a root at `r` (MIDI). */
const INVERSIONS = (r: number) => [
  [r, r + 4, r + 7],
  [r + 4, r + 7, r + 12],
  [r + 7, r + 12, r + 16],
];

test("chord sounds: every voice of a triad and its inversions is heard, and each instrument's chords match the piano's loudness", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPage(page);
  const r = await page.evaluate(
    async ([sounds, triads]) => {
      const q = (window as unknown as W).__oak.quality;
      const energy = (x: { left: Float32Array; right: Float32Array }) => {
        let s = 0;
        for (let i = 0; i < x.left.length; i++) s += (x.left[i] as number) ** 2 + (x.right[i] as number) ** 2;
        return s;
      };
      const diffEnergy = (a: { left: Float32Array; right: Float32Array }, b: typeof a) => {
        let s = 0;
        for (let i = 0; i < a.left.length; i++)
          s +=
            ((a.left[i] as number) - (b.left[i] as number)) ** 2 +
            ((a.right[i] as number) - (b.right[i] as number)) ** 2;
        return s;
      };
      const rows: { sound: string; triad: number[]; voiceDb: number[] }[] = [];
      const loud: { sound: string; lufs: number; peakDb: number }[] = [];
      for (const s of sounds) {
        for (const t of triads) {
          const full = await q.render(`note("[${t.join(",")}]").s("${s}")`, 1, 1);
          const total = energy(full);
          const voiceDb: number[] = [];
          for (let k = 0; k < t.length; k++) {
            const rest = t.filter((_: number, i: number) => i !== k);
            const minus = await q.render(`note("[${rest.join(",")}]").s("${s}")`, 1, 1);
            voiceDb.push(Math.round(10 * Math.log10(diffEnergy(full, minus) / total) * 10) / 10);
          }
          rows.push({ sound: s, triad: t, voiceDb });
        }
        const l = await q.phraseLoudness(`note("[48,52,55] [52,55,60] [55,60,64] [60,64,67]").s("${s}")`);
        loud.push({ sound: s, lufs: l.lufs, peakDb: l.peakDb });
      }
      return { rows, loud };
    },
    [CHORD_SOUNDS, [...INVERSIONS(48), ...INVERSIONS(60)]] as const,
  );
  // each voice carries at least a sixteenth of the chord's energy (an even three-note chord gives about −5 dB)
  const buried = r.rows.flatMap((row) =>
    row.voiceDb
      .map((db, k) => ({ db, k }))
      .filter(({ db }) => !(db > -12))
      .map(({ db, k }) => `${row.sound} [${row.triad.join(",")}] voice ${row.triad[k]}: ${db} dB`),
  );
  expect(buried).toEqual([]);
  const piano = r.loud.find((l) => l.sound === "piano");
  if (!piano) throw new Error("piano not measured");
  for (const l of r.loud) {
    expect(Math.abs(l.lufs - piano.lufs), `${l.sound} ${l.lufs} vs piano ${piano.lufs}`).toBeLessThanOrEqual(
      3,
    );
    expect(l.peakDb, l.sound).toBeLessThan(0);
  }
});

/** A Band line `label: expr` as an expression the render frame can stack. */
const bodyOf = (line: string) => line.replace(/^[A-Za-z_$][\w$]*:\s*/, "");

test("the Band's four-chord loop is a balanced mix in pop and jazz-soul: no part buried, none on top, no clipping", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openPage(page);
  const mixes = (["flavour.pop", "flavour.jazz-soul"] as const).map((f) => {
    const lines = bandCodeAt("band.axis-4bar", f, () => true)
      .replaceAll("{{key}}", "C4:major")
      .split("\n")
      .filter((l) => /^(drums|bass|chords):/.test(l));
    const part = (label: string) => bodyOf(lines.find((l) => l.startsWith(`${label}:`)) ?? "silence");
    return {
      flavour: f,
      drums: part("drums"),
      bass: part("bass"),
      chords: part("chords"),
      all: `stack(${lines.map(bodyOf).join(", ")})`,
    };
  });
  const r = await page.evaluate(
    async ([mixes]) => {
      const q = (window as unknown as W).__oak.quality;
      const cps = 96 / 240; // one bar at 96 bpm fills the 2.5 s render
      const out = [];
      for (const m of mixes) {
        const lufs = async (code: string) =>
          (await q.phraseLoudness(code, cps)) as { lufs: number; peakDb: number };
        out.push({
          flavour: m.flavour,
          drums: (await lufs(m.drums)).lufs,
          bass: (await lufs(m.bass)).lufs,
          chords: (await lufs(m.chords)).lufs,
          mix: await lufs(m.all),
        });
      }
      return out;
    },
    [mixes] as const,
  );
  for (const m of r) {
    const parts = [m.drums, m.bass, m.chords];
    // every part within 10 LU of the loudest: a record, not a solo with a backing
    expect(Math.max(...parts) - Math.min(...parts), `${m.flavour} ${parts.join(" ")}`).toBeLessThanOrEqual(
      10,
    );
    // the mix leaves room for the learner (the tune sits on top) and never clips
    expect(m.mix.lufs, m.flavour).toBeLessThan(-14);
    expect(m.mix.lufs, m.flavour).toBeGreaterThan(-32);
    expect(m.mix.peakDb, m.flavour).toBeLessThan(0);
  }
});

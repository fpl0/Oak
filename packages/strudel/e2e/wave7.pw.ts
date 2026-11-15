// Wave 7 sound (the build:sound task; docs/design/wave7.md): every control A1.L05–L07 and A2 teach heard in its
// lesson's loop (and every silencer the Makes must fail heard as nothing), the sounds the tracks unlock in tune where
// their lessons play them; the jazz kit's ride swinging and its brushes heard, the upright walking with every
// quarter its own attack, shells, rootless and drop-2 voicings with every voice heard on piano and Rhodes; ghost
// notes heard in the funk Band on every kit, RC1's stabs, the clav and the muted guitar level with the kit, the son
// Band's clave, congas and bell each heard; the ten proposed Wave 7 Bands as balanced mixes in all four flavours;
// and CPU headroom on the longest capstone piece (JC4's 32-bar ballad, 128 s). Offline renders run through the
// production prebake on the locked pack (port 5192). Results go to packages/strudel/sound-wave7.json (committed).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { METERS } from "../../theory/src/index.ts";
import { W7_LESSON_CASES } from "../src/audibility/cases.ts";
import { bandCodeFor } from "../src/band.ts";
import { openPage } from "./helpers.ts";
import { FLAVOURS, WAVE7_BANDS } from "./wave7-bands.ts";
import {
  COMP_SOUNDS,
  FUNK_STABS,
  JAZZ_VOICINGS,
  JC4_BARS,
  JC4_BPM,
  jc4Ballad,
  W7_KNOWN_TUNING,
  W7_TUNING,
} from "./wave7-fixtures.ts";

// biome-ignore lint/suspicious/noExplicitAny: the test API is driven untyped from page.evaluate
type W = Window & { __oak: any };

const RESULTS = resolve(import.meta.dirname, "../sound-wave7.json");
/** Each test writes its own section of sound-wave7.json (tests run one at a time, workers: 1). */
function record(section: string, value: unknown): void {
  let table: Record<string, unknown> = {};
  try {
    table = JSON.parse(readFileSync(RESULTS, "utf8")) as Record<string, unknown>;
  } catch {
    table = {};
  }
  table.generatedBy = "packages/strudel/e2e/wave7.pw.ts";
  table[section] = value;
  const ordered = Object.fromEntries(
    Object.entries(table).sort(([a], [b]) =>
      a === "generatedBy" ? -1 : b === "generatedBy" ? 1 : a.localeCompare(b),
    ),
  );
  writeFileSync(RESULTS, `${JSON.stringify(ordered, null, 2)}\n`);
}

/** Blocks Vite's HMR socket: another engineer's edit must not reload the page under a spec (wave5.md §9). */
async function open(page: Page, errors: string[] = []): Promise<string[]> {
  await page.routeWebSocket(/.*/, () => {});
  return openPage(page, errors);
}

/** A labelled line's body (`drums: s(…)` → `s(…)`), for the render frame, which takes one expression. */
const bodyOf = (line: string) => line.replace(/^[A-Za-z_$][\w$]*:\s*/, "");
function asExpression(code: string, only?: readonly string[]): string {
  const lines = code.split("\n").filter((l) => !/^setcp[ms]\(/.test(l));
  const tracks = lines
    .filter((l) => /^[A-Za-z_$][\w$]*:/.test(l))
    .filter((l) => !only || only.includes(l.slice(0, l.indexOf(":"))))
    .map(bodyOf);
  return `stack(${tracks.join(",\n")})`;
}
const bandCode = (id: string, flavour: string, tonic = "C"): string => {
  const b = WAVE7_BANDS.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return bandCodeFor(
    {
      band: b.id as never,
      flavour: flavour as never,
      code: b.code[flavour as (typeof FLAVOURS)[number]],
      followsLearnerKey: false,
      tracks: [],
    },
    { key: { tonic, mode: "major" } as never, defaultBpm: 96, learnerCode: "" },
  );
};
const fix = (x: unknown) =>
  typeof x === "number" && !Number.isFinite(x) ? (x > 0 ? "Infinity" : "-Infinity") : x;
const out = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fix(v)]));

const MAX_CENTS = 10;
const MAX_PART_SPREAD_LU = 10;

test("audibility: every control A1.L05–L07 and A2 teach heard in its lesson's loop, every silencer heard as nothing; the track sounds in tune", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page);
  const r = await page.evaluate(
    async ([lessons, tuning]) => {
      const w = (window as unknown as W).__oak;
      const rows = [];
      for (const c of lessons) {
        const row = await w.lessonHarness.audible(c.control, c.value, c.base, c.id || undefined, c.withCode, {
          cycles: c.cycles,
          cps: c.cps,
        });
        rows.push({ lesson: c.lesson, claim: c.claim, same: c.same ?? false, ...row });
      }
      const tuned: Record<string, unknown[]> = {};
      for (const [sound, midis] of tuning) {
        tuned[sound] = [];
        for (const m of midis) tuned[sound].push(await w.quality.tuning(sound, m));
      }
      return { lessons: rows, tuning: tuned };
    },
    [W7_LESSON_CASES, Object.entries(W7_TUNING)] as const,
  );
  record("audibility", {
    rule: "as packages/strudel/audibility.json, each control in its lesson's loop (content/specs/A1.ts, A2.ts) at the value the lesson grades or plays; a `same` row is a silencer the Make must fail and is asserted NOT audible; tuning: the first partial within ±10 c in the asked-for octave at the pitches the track lessons play each new sound",
    lessons: r.lessons.map(out),
    tuning: r.tuning,
  });
  const problems: string[] = [];
  for (const x of r.lessons as {
    lesson: string;
    claim: string;
    same: boolean;
    audible: boolean;
    diffDb: number;
    error?: string;
  }[]) {
    if (x.error) problems.push(`${x.lesson} ${x.claim}: ${x.error}`);
    else if (x.same ? x.audible : !x.audible) problems.push(`${x.lesson} ${x.claim}: ${x.diffDb} dB`);
  }
  for (const [sound, rows] of Object.entries(r.tuning))
    for (const t of rows as { midi: number; cents: number | null; octave: number | null }[]) {
      const known = W7_KNOWN_TUNING[sound]?.[t.midi];
      // A known zone (wave7-fixtures.ts) must stay where it was measured, never further out.
      if (known !== undefined && t.cents !== null && Math.abs(t.cents - known) <= 0.5 && t.octave === 0)
        continue;
      if (t.cents === null || Math.abs(t.cents) > MAX_CENTS || t.octave !== 0)
        problems.push(`${sound} ${t.midi}: ${t.cents} c, octave ${t.octave}`);
    }
  expect(problems).toEqual([]);
});

test("jazz: the ride swings, the brushes are heard, the upright walks with every quarter its own, every voice of a shell, rootless or drop-2 voicing heard on piano and Rhodes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  const walk = asExpression(bandCode("band.swing-two-five", "flavour.jazz-soul", "F"), ["bass"]);
  const r = await page.evaluate(
    async ([walk, voicings, sounds]) => {
      const w = (window as unknown as W).__oak;
      const q = w.quality;
      const a = w.analysis;
      type St = { left: Float32Array; right: Float32Array };
      const fs = 44100;
      const energy = (x: St, from = 0, to = Number.POSITIVE_INFINITY) => {
        let s = 0;
        const end = Math.min(x.left.length, Math.floor(to * fs));
        for (let i = Math.max(0, Math.floor(from * fs)); i < end; i++)
          s += (x.left[i] as number) ** 2 + (x.right[i] as number) ** 2;
        return s;
      };
      const ratio = (x: St, at: number, ref: number, win: number) =>
        a.round(10 * Math.log10(energy(x, at, at + win) / energy(x, ref, ref + win)), 1);
      // 1. The ride at 160 BPM: where the skip notes land. 25 ms after the swung "and" (2/3 of the beat) against
      //    25 ms after the straight one (1/2), on beats 2 and 4; the same pattern straight is the control.
      const cps = 160 / 240;
      const beat = 1 / cps / 4;
      const RIDE = 's("[rd ~ rd rd]*2").bank("jazzkit")';
      const swung = await q.render(`${RIDE}.swingBy(1/3, 4)`, 1, cps);
      const straight = await q.render(RIDE, 1, cps);
      const ride = [1, 3].map((k) => ({
        beat: k + 1,
        swungDb: ratio(swung, k * beat + (2 / 3) * beat, k * beat + 0.5 * beat, 0.025),
        straightDb: ratio(straight, k * beat + (2 / 3) * beat, k * beat + 0.5 * beat, 0.025),
      }));
      // 2. The brushes (jazzkit sd: tap, slap, swish) and the ride, alone: each loud enough to hear.
      const kit: Record<string, number> = {};
      for (const [name, code] of [
        ["tap", 's("sd:0 ~ sd:0 ~").bank("jazzkit")'],
        ["slap", 's("sd:1 ~ sd:1 ~").bank("jazzkit")'],
        ["swish", 's("sd:2 ~ sd:2 ~").bank("jazzkit")'],
        ["ride", `${RIDE}.swingBy(1/3, 4)`],
      ] as const)
        kit[name] = a.round(((await q.phraseLoudness(code, 0.5)) as { lufs: number }).lufs, 1);
      // 3. The walking bass of band.swing-two-five in F at 200 BPM: the 50 ms after each quarter against the 50 ms
      //    before it (an attack that does not stand out of the last note's ring is a smear, not a walk).
      const wcps = 200 / 240;
      const h = w.createHarness({ frameUrl: "/render.html", seconds: 4 / wcps + 1 });
      const bass = await h.renderInFrame(walk, 4, wcps);
      const qn = 1 / wcps / 4;
      const attacks: number[] = [];
      for (let i = 1; i < 16; i++) attacks.push(ratio(bass, i * qn, i * qn - 0.05, 0.05));
      // 4. Voicings: each held a second; each voice taken out in turn; the change against the whole chord.
      const voicingRows = [];
      for (const s of sounds)
        for (const v of voicings) {
          const chord = (ms: readonly number[]) => `note("[${ms.join(",")}]").s("${s}")`;
          const full = await q.render(chord(v.midis), 1, 1);
          const voices: number[] = [];
          for (let i = 0; i < v.midis.length; i++) {
            const less = await q.render(chord(v.midis.filter((_: number, j: number) => j !== i)), 1, 1);
            const diff = {
              left: full.left.map((x: number, k: number) => x - (less.left[k] as number)),
              right: full.right.map((x: number, k: number) => x - (less.right[k] as number)),
            };
            voices.push(a.round(10 * Math.log10(energy(diff) / energy(full)), 1));
          }
          voicingRows.push({
            sound: s,
            voicing: v.id,
            doubled: v.doubled ?? null,
            voicesDb: voices,
            lufs: a.round(a.loudness(full, fs), 1),
            peakDb: a.round(a.peakDb(full), 1),
          });
        }
      return { ride, kit, attacks, voicings: voicingRows };
    },
    [walk, JAZZ_VOICINGS, COMP_SOUNDS] as const,
  );
  record("jazz", {
    rule: "ride at 160 BPM: on beats 2 and 4 the 25 ms after the swung 'and' (2/3 of the beat) carry 6 dB more than the 25 ms after the straight one, and the straight pattern the reverse; brushes (tap, slap, swish) and the ride each louder than −45 LUFS and within 15 LU of the ride; the upright's walk (band.swing-two-five in F, 200 BPM): each quarter's first 50 ms over the 50 ms before it; every voice of every voicing changes the chord by more than −12 dB when taken out (the gate of the sevenths in Wave 6) — a shell's root on the Rhodes, which doubles the Band's bass, is recorded only — four-note voicings of one sound within 4 LU, no clipping",
    ...r,
  });
  const problems: string[] = [];
  for (const x of r.ride) {
    if (!(x.swungDb > 6)) problems.push(`ride beat ${x.beat}: swung ${x.swungDb} dB`);
    if (!(x.straightDb < 0)) problems.push(`ride beat ${x.beat}: the straight control ${x.straightDb} dB`);
  }
  for (const [name, lufs] of Object.entries(r.kit)) {
    if (!(lufs > -45)) problems.push(`${name} ${lufs} LUFS`);
    if (Math.abs(lufs - (r.kit.ride as number)) > 15)
      problems.push(`${name} ${lufs} against the ride ${r.kit.ride}`);
  }
  r.attacks.forEach((db: number, i: number) => {
    if (!(db > 0)) problems.push(`walk quarter ${i + 2}: ${db} dB over the ring before it`);
  });
  for (const s of COMP_SOUNDS) {
    const rows = r.voicings.filter((v: { sound: string }) => v.sound === s);
    // The four-note voicings (rootless and drop-2) at one loudness; the three-note shells, lower, are recorded.
    const lufs = rows
      .filter((v: { voicing: string }) => !v.voicing.startsWith("shell"))
      .map((v: { lufs: number }) => v.lufs);
    if (Math.max(...lufs) - Math.min(...lufs) > 4)
      problems.push(`${s} voicings ${Math.min(...lufs)}..${Math.max(...lufs)} LUFS`);
    for (const v of rows as {
      voicing: string;
      voicesDb: number[];
      peakDb: number;
      doubled: number | null;
    }[]) {
      v.voicesDb.forEach((db, i) => {
        // A shell's root doubles the Band's bass: on the Rhodes, whose low register is soft (Wave 6), it is
        // measured and reported, and the 3rd and 7th (the shell's point) are required.
        if (s === "rhodes" && v.doubled === i) return;
        if (!(db > -12)) problems.push(`${s} ${v.voicing} voice ${i + 1}: ${db} dB`);
      });
      if (v.peakDb >= 0) problems.push(`${s} ${v.voicing} clips`);
    }
  }
  expect(problems).toEqual([]);
});

test("rhythm: ghost notes heard in the funk Band on every kit and soft against the backbeat; the stabs, clav and muted guitar level with the kit; the son Band's clave, congas and bell each heard", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  const GHOSTS = '"1 1 1 1 1 1 1 .35 1 .35 1 1 1 1 1 .35"';
  const grooves = FLAVOURS.map((f) => {
    const code = bandCode("band.funk-16", f);
    const drums = asExpression(code, ["drums"]);
    return {
      flavour: f,
      with: asExpression(code),
      // The same Band with the three ghost hits taken out (rests where they were).
      without: asExpression(
        code
          .replace("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ sd", "~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~")
          .replace(GHOSTS, '"1"'),
      ),
      drums,
      snareOnly: drums.replace(/s\("bd[^"]*"\)/, 's("~")').replace(/s\("hh\*16"\)/, 's("~")'),
    };
  });
  const son = FLAVOURS.map((f) => {
    const drums = asExpression(bandCode("band.son-clave", f), ["drums"]);
    return {
      flavour: f,
      all: drums,
      parts: {
        clave: drums.replace(/s\("<\[rim[^"]*"\)/, 's("~")'),
        congas: drums.replace('s("~ ~ mt ~ ~ ~ lt lt")', 's("~")'),
        bell: drums.replace('s("cb*4")', 's("~")'),
      },
    };
  });
  const funkKit = asExpression(bandCode("band.funk-16", "flavour.funk"), ["drums"]);
  const r = await page.evaluate(
    async ([grooves, son, stabs, funkKit]) => {
      const w = (window as unknown as W).__oak;
      const q = w.quality;
      const a = w.analysis;
      type St = { left: Float32Array; right: Float32Array };
      const fs = 44100;
      const energy = (x: St, from = 0, to = Number.POSITIVE_INFINITY) => {
        let s = 0;
        const end = Math.min(x.left.length, Math.floor(to * fs));
        for (let i = Math.max(0, Math.floor(from * fs)); i < end; i++)
          s += (x.left[i] as number) ** 2 + (x.right[i] as number) ** 2;
        return s;
      };
      const sub = (x: St, y: St): St => ({
        left: x.left.map((v, i) => v - (y.left[i] as number)),
        right: x.right.map((v, i) => v - (y.right[i] as number)),
      });
      const cps = 96 / 240;
      const step = 1 / cps / 16;
      const win = 0.06;
      const ghostRows = [];
      for (const g of grooves) {
        const withGhosts: St = await q.render(g.with, 1, cps);
        const without: St = await q.render(g.without, 1, cps);
        const ghosts = sub(withGhosts, without);
        const snare: St = await q.render(g.snareOnly, 1, cps);
        const accent = Math.max(...[4, 12].map((k) => energy(snare, k * step, k * step + win)));
        ghostRows.push({
          flavour: g.flavour,
          overMixDb: [7, 9, 15].map((k) =>
            a.round(
              10 *
                Math.log10(
                  energy(ghosts, k * step, k * step + win) / energy(without, k * step, k * step + win),
                ),
              1,
            ),
          ),
          underAccentDb: [7, 9, 15].map((k) =>
            a.round(10 * Math.log10(energy(ghosts, k * step, k * step + win) / accent), 1),
          ),
          peakDb: a.round(a.peakDb(withGhosts), 1),
        });
      }
      const kitLufs = ((await q.phraseLoudness(funkKit, cps)) as { lufs: number }).lufs;
      const stabRows = [];
      for (const s of stabs)
        stabRows.push({
          id: s.id,
          lufs: a.round(((await q.phraseLoudness(s.code, cps)) as { lufs: number }).lufs, 1),
        });
      const sonRows = [];
      for (const s of son) {
        const all: St = await q.render(s.all, 2, cps);
        const parts: Record<string, number> = {};
        for (const [name, code] of Object.entries(s.parts)) {
          const less: St = await q.render(code as string, 2, cps);
          parts[name] = a.round(10 * Math.log10(energy(sub(all, less)) / energy(all)), 1);
        }
        sonRows.push({ flavour: s.flavour, partsDb: parts });
      }
      return { ghosts: ghostRows, kitLufs: a.round(kitLufs, 1), stabs: stabRows, son: sonRows };
    },
    [grooves, son, FUNK_STABS, funkKit] as const,
  );
  record("rhythm", {
    rule: "band.funk-16 at 96 BPM in every flavour: each ghost snare (the 'a' of 2, the 'e' of 3, the 'a' of 4, velocity .35) carries more than −20 dB of everything else in its 60 ms and sits 6 dB or more under the backbeat; RC1's horn stabs, the clav and the muted guitar (cleangtr held a third of its 16th) within 10 LU of the funk kit; band.son-clave's clave, congas (toms) and bell each more than −20 dB of the percussion",
    ...r,
  });
  const problems: string[] = [];
  for (const g of r.ghosts) {
    if (!(Math.min(...g.overMixDb) > -20))
      problems.push(`${g.flavour} ghost ${Math.min(...g.overMixDb)} dB against the mix`);
    if (!(Math.max(...g.underAccentDb) <= -6))
      problems.push(`${g.flavour} ghost ${Math.max(...g.underAccentDb)} dB under the accent`);
    if (g.peakDb >= 0) problems.push(`${g.flavour} clips`);
  }
  for (const s of r.stabs)
    if (Math.abs(s.lufs - r.kitLufs) > MAX_PART_SPREAD_LU)
      problems.push(`${s.id} ${s.lufs} LUFS against the kit ${r.kitLufs}`);
  for (const s of r.son)
    for (const [part, db] of Object.entries(s.partsDb))
      if (!((db as number) > -20)) problems.push(`${s.flavour} ${part} ${db} dB`);
  expect(problems).toEqual([]);
});

test("the ten Wave 7 Bands (swing in any key, jazz blues, rhythm changes, neo-soul, funk, son, 5/4, 7/8, 9/8) are balanced mixes in all four flavours", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page);
  const mixes = WAVE7_BANDS.flatMap((b) =>
    FLAVOURS.map((f) => {
      const code = bandCode(b.id, f);
      const units = METERS[b.meter].unitsPerBar;
      // One bar at the tempo its lessons play it: swing at 160, the ballad feels at 76, the rest at 96 to the beat.
      const bpm =
        b.swing?.subdivision === 8
          ? 160
          : b.id === "band.neo-soul"
            ? 76
            : units === 7 || units === 9
              ? 180
              : 96;
      return {
        band: b.id,
        flavour: f,
        cps: bpm / 60 / units,
        drums: asExpression(code, ["drums"]),
        bass: asExpression(code, ["bass"]),
        chords: asExpression(code, ["chords"]),
        all: asExpression(code),
      };
    }),
  );
  const r = await page.evaluate(
    async ([mixes]) => {
      const q = (window as unknown as W).__oak.quality;
      const res = [];
      for (const m of mixes) {
        const lufs = async (code: string) =>
          (await q.phraseLoudness(code, m.cps)) as { lufs: number; peakDb: number };
        res.push({
          band: m.band,
          flavour: m.flavour,
          drums: (await lufs(m.drums)).lufs,
          bass: (await lufs(m.bass)).lufs,
          chords: (await lufs(m.chords)).lufs,
          mix: await lufs(m.all),
        });
      }
      return res;
    },
    [mixes] as const,
  );
  const problems: string[] = [];
  for (const m of r) {
    const parts = [m.drums, m.bass, m.chords];
    const spread = Math.round((Math.max(...parts) - Math.min(...parts)) * 10) / 10;
    if (spread > MAX_PART_SPREAD_LU)
      problems.push(`${m.band} ${m.flavour}: parts ${spread} LU apart (${parts.join(" ")})`);
    if (!(m.mix.lufs < -14 && m.mix.lufs > -32))
      problems.push(`${m.band} ${m.flavour}: mix ${m.mix.lufs} LUFS`);
    if (m.mix.peakDb >= 0) problems.push(`${m.band} ${m.flavour}: clips at ${m.mix.peakDb} dBFS`);
  }
  record("bands", {
    rule: "the first bar of each proposed Wave 7 Band (packages/strudel/e2e/wave7-bands.ts) in C at the tempo its lessons play it (swing 160, neo-soul 76, 7/8 and 9/8 at 180 to the eighth, the rest 96): parts within 10 LU of each other; the mix between −32 and −14 LUFS, peak under 0 dBFS (offline, before the master limiter)",
    mixes: r,
  });
  expect(problems).toEqual([]);
});

test("CPU headroom: JC4's 32-bar ballad (128 s) renders offline many times faster than real time and plays live at 8× its tempo without a dropout", async ({
  page,
}) => {
  // Real time: 8 s of the ballad live at eight times its tempo (16 bars).
  test.setTimeout(90_000);
  await open(page);
  const code = jc4Ballad();
  const fast = code.replace(`setcpm(${JC4_BPM}/4)`, `setcpm(${JC4_BPM * 8}/4)`);
  const r = await page.evaluate(
    async ([expr, fast, bars, bpm]) => {
      const w = (window as unknown as W).__oak;
      const ctx = w.oak.ctx as AudioContext & { playbackStats?: { underrunEvents?: number } };
      const seconds = (bars * 240) / bpm;
      const h = w.createHarness({ frameUrl: "/render.html", seconds: seconds + 2, timeoutMs: 120_000 });
      const t = performance.now();
      const rendered = await h.renderInFrame(expr, bars, bpm / 240);
      const renderMs = performance.now() - t;
      const longTasks: number[] = [];
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration));
      });
      try {
        obs.observe({ type: "longtask", buffered: false });
      } catch {
        // not supported
      }
      const before = w.logs.length;
      const stats0 = ctx.playbackStats ? { ...ctx.playbackStats } : null;
      const e = w.mountImperative("oak_jc4_0_", fast);
      const played = await e.play();
      const started = Date.now();
      const levels: number[] = [];
      while (Date.now() < started + 8000) {
        levels.push(Math.round(w.oak.master.level().rms * 10000) / 10000);
        await new Promise((x) => setTimeout(x, 50));
      }
      w.oak.stopAll();
      await new Promise((x) => setTimeout(x, 200));
      const stats1 = ctx.playbackStats ? { ...ctx.playbackStats } : null;
      obs.disconnect();
      const logs = w.logs.slice(before);
      e.dispose();
      return {
        ok: played.ok,
        audioSec: rendered.left.length / 44100,
        renderMs: Math.round(renderMs),
        graphMs: rendered.timings?.renderMs ?? null,
        haps: rendered.haps,
        levels,
        longTasks,
        late: logs.filter((l: { message: string }) => /late|behind/i.test(l.message)).length,
        skips: logs.filter((l: { skippedSound?: string }) => l.skippedSound).length,
        notFound: logs.filter((l: { message: string }) => /not found/.test(l.message)).length,
        underruns: stats0 && stats1 ? (stats1.underrunEvents ?? 0) - (stats0.underrunEvents ?? 0) : null,
      };
    },
    [asExpression(code), fast, JC4_BARS, JC4_BPM] as const,
  );
  const longestGap = (levels: number[]) => {
    let worst = 0;
    let run = 0;
    for (const l of levels.slice(6)) {
      run = l < 0.00316 ? run + 50 : 0;
      worst = Math.max(worst, run);
    }
    return worst;
  };
  const graphMs = r.graphMs ?? r.renderMs;
  record("cpu", {
    rule: "JC4's longest piece (wave7-fixtures.ts jc4Ballad: 32 bars at 60 BPM, 128 s; brushes, two-feel upright, rootless Rhodes, a vibes melody): rendered offline faster than real time by the production prebake (the CPU headroom; the whole wall clock counted, setup included), then 8 s live at 8× its tempo: no underrun, no skipped or missing sound, no late event, no stall over 200 ms, no 300 ms under −50 dBFS",
    ...r,
    levels: undefined,
    longestGapMs: longestGap(r.levels),
    realtimeFactor: Math.round((r.audioSec / (graphMs / 1000)) * 10) / 10,
    wallFactor: Math.round((r.audioSec / (r.renderMs / 1000)) * 10) / 10,
  });
  expect(r.ok).toBe(true);
  expect(r.audioSec).toBeGreaterThan(127);
  expect(r.audioSec / (r.renderMs / 1000)).toBeGreaterThan(2);
  expect(r.skips).toBe(0);
  expect(r.notFound).toBe(0);
  expect(r.late).toBe(0);
  expect(longestGap(r.levels)).toBeLessThan(300);
  expect(Math.max(0, ...r.longTasks)).toBeLessThan(200);
  if (r.underruns !== null) expect(r.underruns).toBe(0);
});

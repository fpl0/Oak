import { expect, test } from "@playwright/test";
import { guardNetwork, openLab, saveResult } from "./helpers.ts";

test("audibility harness: offline A/B render per control", async ({ page, context }) => {
  const net = await guardNetwork(context);
  const { consoleErrors } = await openLab(page);
  const t0 = Date.now();
  const table = await page.evaluate(() => window.oak.audibleTable());
  const ms = Date.now() - t0;
  const rows = table.rows as any[];
  saveResult("05-audibility", { ms, renders: 2 * rows.length + 2 * table.floors.length + 3, floors: table.floors, thresholdDb: table.thresholdDb, rows, external: net.external, consoleErrors });

  const lines = rows.map(
    (r) =>
      `${r.audible ? "AUDIBLE" : r.error ? "ERROR  " : "NO-OP  "} ${`${r.control}(${JSON.stringify(r.value)})`.padEnd(18)} diff ${String(r.diffDb).padStart(9)} dB  repeat ${String(r.repeatDb).padStart(9)} dB  level ${String(r.levelDb).padStart(6)} dB  centroid ${r.centroidHz[0]}->${r.centroidHz[1]} Hz  bal ${r.balance[0]}->${r.balance[1]}  tail ${r.tail[0]}->${r.tail[1]}${r.error ? `  ${r.error}` : ""}${r.base.includes("sawtooth\")") && !r.base.includes("lpf") ? "" : `  [base ${r.base}]`}`,
  );
  console.log(`\n${lines.join("\n")}\n`);

  const by = (c: string) => rows.find((r) => r.control === c);
  // determinism: two independent renders of the same code are identical (bit-exact without reverb)
  for (const f of table.floors) expect(f.floorDb, f.base).toBeLessThan(-120);
  for (const c of ["room", "delay", "lpf", "hpf", "gain", "pan", "distort", "crush", "shape", "vowel", "phaser", "tremolo", "lpenv", "attack", "release"]) {
    expect(by(c)?.audible, c).toBe(true);
  }
  expect(by("leslie")?.audible, "leslie is a registered control but a no-op in superdough").toBe(false);
  expect(net.external).toEqual([]);
});

test("why one realm per render: repeated offline renders in the same realm", async ({ page, context }) => {
  await guardNetwork(context);
  await openLab(page);
  const code = 'note("c3 e3 g3 c4").s("sawtooth").lpf(400)';
  const once = await page.evaluate((c) => window.oak.sameRealmProbe(c, 1), code);
  const twice = await page.evaluate((c) => window.oak.sameRealmProbe(c, 2), code);
  const thrice = await page.evaluate((c) => window.oak.sameRealmProbe(c, 3), code);
  saveResult("05-same-realm", { code, once, twice, thrice });
  expect(once.ok).toBe(true);
});

// Runs the audibility harness over the catalog and writes packages/strudel/audibility.json (committed).
// Each render is an OfflineAudioContext in a throw-away iframe.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { CONTROL_CASES, SOUND_CASES } from "../src/audibility/cases.ts";
import { openPage } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: the test API is driven untyped from page.evaluate
type W = Window & { __oak: any };

test("audibility table for every group-H control and every sound", async ({ page }) => {
  test.setTimeout(600_000);
  await openPage(page);
  const result = await page.evaluate(
    async ([controls, sounds]) => {
      const h = (window as unknown as W).__oak.harness;
      const floors = [await h.noiseFloorDb(), await h.noiseFloorDb('s("bd sd")')];
      const controlRows = [];
      for (const c of controls)
        controlRows.push(await h.audible(c.control, c.value, c.base, c.id, c.withCode));
      const soundRows = [];
      for (const s of sounds) soundRows.push(await h.soundAudible(s.sound, s.code, s.id));
      return { floors, controls: controlRows, sounds: soundRows };
    },
    [CONTROL_CASES, SOUND_CASES] as const,
  );
  const fix = (x: number) => (Number.isFinite(x) ? x : x > 0 ? "Infinity" : "-Infinity");
  const rowOut = (r: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? fix(v) : v]));
  const byId = new Map<string, boolean>();
  for (const r of [...result.controls, ...result.sounds])
    byId.set(r.id, (byId.get(r.id) ?? true) && r.audible);
  const table = {
    generatedBy: "packages/strudel/e2e/audibility.pw.ts",
    thresholdDb: -40,
    rule: "control: 20·log10(rms(with − without)/rms(without)) > −40 dB and > repeat + 20 dB, or (for non-repeatable sources) average-spectrum difference > −30 dB and > its repeat + 4 dB, or a stereo-width change > 0.05 and > 3× its repeat; sound: RMS > −60 dBFS. An id is audible only when all its rows are.",
    floors: result.floors.map((f: Record<string, unknown>) => rowOut(f)),
    audible: Object.fromEntries([...byId].sort()),
    controls: result.controls.map(rowOut),
    sounds: result.sounds.map(rowOut),
  };
  writeFileSync(resolve(import.meta.dirname, "../audibility.json"), `${JSON.stringify(table, null, 2)}\n`);

  const get = (id: string) => table.audible[id];
  // Facts proven in spike S3 must still hold.
  for (const id of [
    "tb.room",
    "tb.lpf",
    "tb.delay",
    "tb.distort",
    "tb.pan",
    "tb.crush",
    "tb.phaser",
    "tb.adsr",
    "tb.lpenv",
  ]) {
    expect(get(id), id).toBe(true);
  }
  for (const id of [
    "noop.leslie",
    "noop.lrate",
    "noop.lsize",
    "noop.amp",
    "noop.squiz",
    "noop.triode",
    "noop.ring",
  ]) {
    expect(get(id), id).toBe(false);
  }
  for (const id of [
    "snd.piano",
    "snd.rhodes",
    "snd.upright",
    "snd.ebass",
    "snd.bank.RolandTR909",
    "snd.drum.bd",
  ]) {
    expect(get(id), id).toBe(true);
  }
  expect(get("snd.pad")).toBe(false); // not in pack v1
  expect(get("tb.unison")).toBe(true); // supersaw is not bit-repeatable: proven through spectrum and width
});

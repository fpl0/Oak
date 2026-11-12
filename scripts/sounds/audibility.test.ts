// The committed audibility table (packages/strudel/audibility.json, written by the S3 harness in
// packages/strudel/e2e/audibility.pw.ts) against the toolbox registry: every group-H control and every sound of
// the catalog has a case, nothing the registry calls audible is unproven, and the pack's aliases and kits are
// exactly the catalog's sounds.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toolbox } from "../../content/toolbox.ts";
import { CONTROL_CASES, QUALITY_CASES, SOUND_CASES } from "../../packages/strudel/src/audibility/cases.ts";
import { OAK_ALIASES, OAK_KITS } from "./pack.config.ts";

const ROOT = join(import.meta.dirname, "../..");
const table = JSON.parse(readFileSync(join(ROOT, "packages/strudel/audibility.json"), "utf8")) as {
  audible: Record<string, boolean>;
};
const quality = JSON.parse(readFileSync(join(ROOT, "packages/strudel/sound-quality.json"), "utf8")) as {
  aliases: { id: string }[];
};

/** Group-H rows that draw rather than sound (Oak's scope panels): no audibility case by design. */
const VISUAL = new Set(["tb.scope", "tb.fscope"]);
const groupH = toolbox.filter((t) => t.group === "H" && !VISUAL.has(t.id));
const sounds = toolbox.filter((t) => t.kind === "sound");

describe("audibility table", () => {
  test("every group-H control and every catalog sound has a case and a result", () => {
    const cased = new Set([...CONTROL_CASES, ...SOUND_CASES].map((c) => c.id));
    expect(groupH.map((t) => t.id).filter((id) => !cased.has(id))).toEqual([]);
    expect(sounds.map((t) => t.id).filter((id) => !cased.has(id))).toEqual([]);
    for (const id of cased) expect([id, typeof table.audible[id]]).toEqual([id, "boolean"]);
  });

  test("nothing the registry marks audible is unproven by the harness", () => {
    const claimed = toolbox.filter((t) => t.audible === true).map((t) => t.id);
    expect(claimed.filter((id) => table.audible[id] !== true)).toEqual([]);
  });

  test("Wave 3's pending entries are proven: tb.clip and snd.jazzkit", () => {
    expect(table.audible["tb.clip"]).toBe(true);
    expect(table.audible["snd.jazzkit"]).toBe(true);
  });

  test("every catalog sound is audible but the break (A2.L04), and the silent no-ops stay silent", () => {
    expect(sounds.filter((t) => table.audible[t.id] !== true).map((t) => t.id)).toEqual(["snd.brk"]);
    const noops = Object.keys(table.audible).filter((id) => id.startsWith("noop."));
    expect(noops.length).toBeGreaterThan(0);
    for (const id of noops) expect([id, table.audible[id]]).toEqual([id, false]);
  });

  test("every group-H row the harness proves audible is flagged audible in content/toolbox.ts", () => {
    const unflagged = groupH
      .filter((t) => t.audible !== true && table.audible[t.id] === true)
      .map((t) => t.id);
    if (unflagged.length)
      console.info(`proven audible, not flagged in content/toolbox.ts: ${unflagged.join(", ")}`);
    expect(unflagged).toEqual([]);
  });
});

describe("pack aliases and kits against the catalog", () => {
  const instruments = sounds.filter(
    (t) => t.group === "G" && !t.id.startsWith("snd.wave.") && t.id !== "snd.piano",
  );

  test("every catalog instrument is a curated alias of the pack, and every alias is in the catalog", () => {
    const aliases = Object.keys(OAK_ALIASES).map((a) => `snd.${a}`);
    expect(instruments.map((t) => t.id).filter((id) => !aliases.includes(id))).toEqual([]);
    const catalog = new Set<string>(sounds.map((t) => t.id));
    expect(aliases.filter((id) => !catalog.has(id))).toEqual([]);
  });

  test("every Oak kit is a catalog sound", () => {
    for (const kit of Object.keys(OAK_KITS)) expect(sounds.some((t) => t.id === `snd.${kit}`)).toBe(true);
  });

  test("every alias and the piano are measured by the sound-quality harness", () => {
    const measured = new Set(quality.aliases.map((a) => a.id));
    const cases = new Set(QUALITY_CASES.map((c) => c.id));
    for (const id of ["snd.piano", ...Object.keys(OAK_ALIASES).map((a) => `snd.${a}`)]) {
      expect([id, cases.has(id)]).toEqual([id, true]);
      expect([id, measured.has(id)]).toEqual([id, true]);
    }
  });
});

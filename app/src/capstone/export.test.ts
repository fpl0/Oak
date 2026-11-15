// Export's length (carry f2): the offline renderer takes only a piece whose arrangement says where it ends, so a
// loop is handed to it with each labelled track wrapped in `arrange([bars, …])` for the piece's own length. Checked
// with the real headless Strudel: every note of those bars is the same, a multi-line track stays whole, and a piece
// that already has an arrangement is left as it is. The Band a version played at release is built from the state
// `album.source` returns, with only the roles the capstone left to it.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import * as grader from "@oak/grader";
import { capstones } from "../../../content/capstones.ts";
import { registries } from "../../../content/index.ts";
import * as P from "./e2e/w7-pieces.ts";
import {
  exportBandOf,
  muteMapOf,
  pieceLength,
  renderableCode,
  renderRequestOf,
  statedBars,
  versionBandOf,
} from "./export.ts";
import { ensureRealm } from "./test-support.ts";

setDefaultTimeout(60_000);
const analyze = async (code: string, opts: grader.EvalOptions) => {
  await ensureRealm();
  return grader.evaluateForGrading(code, opts);
};
async function notes(code: string, bars: number): Promise<string[]> {
  const ev = await analyze(code, { mode: "capstone", bars, lint: null, meter: "4/4" });
  if (!ev.ok) throw new Error(ev.error.message);
  return grader
    .normalize(ev, { meter: "4/4" })
    .all.map(
      (e) => `${e.track}|${e.onset.join("/")}|${e.midi ?? e.s}|${e.dur.join("/")}|${e.gain.toFixed(3)}`,
    )
    .sort();
}

describe("renderableCode", () => {
  test.each([
    ["JC1_BALLAD", 16],
    ["RC2_CLAVE", 8],
    ["AC2_BALLAD", 8],
  ] as const)(
    "%s: the loop's length, every note the same, an arrangement the renderer reads",
    async (name, bars) => {
      const code = P[name];
      expect(statedBars(code)).toBeNull();
      expect(await pieceLength(code, analyze)).toBe(bars);
      const out = renderableCode(code, bars);
      expect(statedBars(out)).toBe(bars);
      expect(await notes(out, bars)).toEqual(await notes(code, bars));
    },
  );
  test("a track written over several lines is wrapped whole", async () => {
    const code =
      'setcpm(90/4)\n\nchords: chord("<C F>")\n  .voicing()\n  .s("piano")\nbass: note("<c2 f2>").s("ebass")';
    const out = renderableCode(code, 2);
    expect(out).toContain('chords: arrange([2, chord("<C F>")\n  .voicing()\n  .s("piano")])');
    expect(await notes(out, 2)).toEqual(await notes(code, 2));
  });
  test("a piece with its own arrangement is left as it is", async () => {
    expect(statedBars(P.JC3_AABA)).toBe(32);
    expect(renderableCode(P.JC3_AABA, 8)).toBe(P.JC3_AABA);
    expect(await pieceLength(P.JC3_AABA, analyze)).toBe(32);
  });
});

describe("the Band of an exported version", () => {
  const { bands } = registries;
  const c0 = capstones.find((c) => c.id === "C0");
  if (!c0) throw new Error("C0 missing");
  const stored = { bandId: "band.axis-4bar", flavour: "flavour.pop", mutes: [] };
  test("a capstone's stored Band plays only the roles its brief leaves to the Band, in the piece's key", () => {
    const band = exportBandOf(stored, { tonic: "D", mode: "major" }, { bands, capstone: c0 });
    expect(band?.band).toBe("band.axis-4bar");
    expect(band?.tracks).toEqual(["bass", "chords"]);
    expect(band?.code).toContain("D4:major");
    expect(band?.code).not.toContain("{{key}}");
  });
  test("a promoted sketch's Band plays every role it has", () => {
    const band = exportBandOf(stored, { tonic: "A", mode: "minor" }, { bands, capstone: null });
    expect(band?.tracks).toEqual(["drums", "bass", "chords"]);
    expect(band?.code).toContain("A4:minor");
  });
  test("no Band, an unknown Band, and a BandSetup already built", () => {
    expect(exportBandOf(null, null, { bands, capstone: null })).toBeNull();
    expect(
      exportBandOf({ bandId: "band.nope", flavour: "flavour.pop", mutes: [] }, null, {
        bands,
        capstone: null,
      }),
    ).toBeNull();
    const ready = {
      band: "band.x",
      flavour: "flavour.pop",
      code: "x",
      followsLearnerKey: false,
      tracks: ["drums"],
    };
    expect(exportBandOf(ready, null, { bands, capstone: null })).toBe(ready as never);
  });
  test("a muted Band role is the renderer's band.<role>; a learner label stays as it is", () => {
    const m = muteMapOf({ drums: true, bass: false, lead: true });
    expect([...m.muted].sort()).toEqual(["band.drums", "lead"]);
  });
  test("the render request carries the built Band", () => {
    const req = renderRequestOf(
      { code: 'mel: note("c4")', band: stored, key: { tonic: "C", mode: "major" }, mutes: { chords: true } },
      { bands, capstone: c0 },
    );
    expect(req.band?.tracks).toEqual(["bass", "chords"]);
    expect([...(req.mutes?.muted ?? [])]).toEqual(["band.chords"]);
  });
  // review:studio: the album page's live code (and so "Record another take") played no Band at all, so a take of a
  // Band-backed track lost its bass and chords while Export kept them. It now plays the release's Band, less the
  // roles the release muted.
  test("the album page's live Band: the release's Band, the muted roles left out, nothing when all are muted", () => {
    expect(versionBandOf(stored, { tonic: "D", mode: "major" }, { bands, capstone: c0 })?.tracks).toEqual([
      "bass",
      "chords",
    ]);
    const muted = { ...stored, mutes: ["bass"] };
    const live = versionBandOf(muted, { tonic: "D", mode: "major" }, { bands, capstone: c0 });
    expect(live?.tracks).toEqual(["chords"]);
    expect(live?.code).toContain("D4:major");
    expect(versionBandOf({ ...stored, mutes: ["bass", "chords"] }, null, { bands, capstone: c0 })).toBeNull();
    expect(versionBandOf(null, null, { bands, capstone: c0 })).toBeNull();
  });
});

describe("the Band of an exported capstone whose brief leaves it no role", () => {
  test("JC1 (the learner writes every part): no Band, whatever was stored", () => {
    const jc1 = capstones.find((c) => c.id === "JC1");
    expect(
      exportBandOf({ bandId: "band.axis-4bar", flavour: "flavour.pop", mutes: [] }, null, {
        bands: registries.bands,
        capstone: jc1 ?? null,
      }),
    ).toBeNull();
  });
});

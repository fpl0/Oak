// Wave 5 (U11.L03): a sung blues line through the fake microphone: 1 ♭3 4 ♭5 5 ♭7 1 in C, the ♭3 bent 55¢ up
// toward 3, the ♭5 60¢ down toward 4 and the ♭7 60¢ up toward 7. With the blue notes marked, each counts — judged
// against the nearer of its two neighbouring semitones, within the normal tolerance — and the feedback names the
// bend; against plain targets the same take earns half credit on each.
import { expect, test } from "@playwright/test";
import { fakeMicArgs, MODE, openHarness } from "./helpers.ts";
import { SING_TOL, writeSingFixtures } from "./wave5-helpers.ts";

writeSingFixtures();
test.use({ launchOptions: { args: fakeMicArgs("sing-blues.wav") } });

test(`[${MODE}] a sung blues line: bent blue notes judged against their neighbours, and said so`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const beat = 60 / 100;
  const degrees = ["1", "b3", "4", "b5", "5", "b7", "1"] as const;
  const base = {
    seconds: 12,
    key: { tonic: "C", mode: "major" as const },
    tonicMidi: 60,
    notes: degrees.map((degree, k) => ({ degree, at: k * beat, dur: beat - 0.07 })),
    mode: "pitch" as const,
    tol: SING_TOL,
  };
  // One take, graded twice: with the blue notes marked, and against plain targets.
  const blue = await page.evaluate((o) => window.oakAudioE2E.wave5.singRun(o), {
    ...base,
    blues: true,
    comparePlain: true,
  });
  console.log(`[${MODE}] blues: ${JSON.stringify(blue.result.notes)}`);
  expect(blue.result.notes.map((n) => n.credit)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  expect(blue.result.notes.map((n) => n.blue)).toEqual([false, true, false, true, false, true, false]);
  const said = blue.result.diagnostics.filter((d) => d.id === "sing.blue-note");
  expect(said.map((d) => d.params.expDeg)).toEqual(["♭3", "♭5", "♭7"]);
  expect(said[0]?.params).toMatchObject({ towardDeg: "3", dir: "above" });
  expect(said[1]?.params).toMatchObject({ towardDeg: "4", dir: "below" });
  expect(blue.result.pass).toBe(true);
  // The same take against plain targets: each bent note is only half right.
  expect(blue.plain?.notes.filter((n) => n.credit === 0.5).length).toBe(3);
  expect(problems).toEqual([]);
});

// Wave 6: the sung lines of U12–U15 through the fake microphone, in one take of three phrases:
//   chromatic degrees in C (U15.L01)  sol fi sol te la, the fi sung as fa: the key's own note, no credit, explained
//   a guide-tone line (U12.L05)       over Dm7 G7 Cmaj7, the 3rd of G7 sung where the line holds its 7th
//   D Dorian's colour (U14.L03)       1 5 6 5, the raised 6 sung as the minor ♭6: the plain scale's note
// The same three lines are then put through their Quiet path: pick lists, graded as a fallback, and the page
// never asks for a microphone.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { fakeMicArgs, MODE, openHarness } from "./helpers.ts";
import {
  BETWEEN_SEC,
  CHROMATIC,
  GAP_SEC,
  GUIDE,
  MODAL,
  PHRASE_AT,
  TAKE_SEC,
} from "./make-fixtures-w6.bun.ts";

// Chromium reads the WAV at launch: write it first.
execFileSync("bun", [`${import.meta.dirname}/make-fixtures-w6.bun.ts`], { stdio: "ignore" });
test.use({ launchOptions: { args: fakeMicArgs("sing-w6.wav") } });

const PLAN = {
  chromatic: { at: PHRASE_AT.chromatic, noteSec: CHROMATIC.noteSec, degrees: [...CHROMATIC.degrees] },
  guide: { at: PHRASE_AT.guide, chordSec: GUIDE.chordSec, chords: [...GUIDE.chords] },
  modal: { at: PHRASE_AT.modal, noteSec: MODAL.noteSec, degrees: [...MODAL.degrees] },
  gapSec: GAP_SEC,
  takeSec: TAKE_SEC,
};

test(`[${MODE}] sung chromatic degrees, a guide-tone line and a mode's colour; their Quiet path`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  expect(BETWEEN_SEC).toBeGreaterThan(0.2);

  // Quiet first: nothing has opened the microphone yet, and nothing does.
  const quiet = await page.evaluate((o) => window.oakAudioE2E.wave6.quietRun(o), PLAN);
  expect(quiet.micRequests).toBe(0);
  expect(quiet.modality).toBe("fallback");
  expect(quiet.picks).toEqual([
    { prompt: "Note 2", options: ["4 fa", "♯4 fi", "5 sol"], correct: "♯4 fi" },
    { prompt: "Note 4", options: ["6 la", "♭7 te", "7 ti"], correct: "♭7 te" },
    {
      prompt: "Over Dm7",
      options: ["the 7th C", "the root D", "the 3rd F", "the 5th A"],
      correct: "the 3rd F",
    },
    {
      prompt: "Over G7",
      options: ["the 3rd B", "the 5th D", "the 7th F", "the root G"],
      correct: "the 7th F",
    },
    {
      prompt: "Over Cmaj7",
      options: ["the 7th B", "the root C", "the 3rd E", "the 5th G"],
      correct: "the 3rd E",
    },
    { prompt: "Note 3", options: ["♭6 le", "6 la"], correct: "6 la" },
  ]);
  expect(quiet.rightPass).toBe(true);
  expect(quiet.wrongScore).toBe(0);

  const run = await page.evaluate((o) => window.oakAudioE2E.wave6.singRun(o), PLAN);
  console.log(`[${MODE}] sung lines: ${JSON.stringify(run)}`);

  // Chromatic: fa for fi earns nothing and is named; te (10¢ sharp) counts.
  expect(run.chromatic.syllables).toEqual(["sol", "fi", "sol", "te", "la"]);
  expect(run.chromatic.credits).toEqual([1, 0, 1, 1, 1]);
  expect(run.chromatic.said).toEqual([
    {
      id: "sing.neighbour",
      text: "Note 2: you sang 4 (fa), the key's own note. ♯4 (fi) is a half step above it, leaning on to 5.",
    },
  ]);
  expect(run.chromatic.pass).toBe(true);

  // Guide tones: the 3rd of G7 where the line holds the 7th: a warning by default, accepted on request.
  expect(run.guide.sang).toEqual(["third", "third", "third"]);
  expect(run.guide.credits).toEqual([1, 0, 1]);
  expect(run.guide.said).toEqual([
    {
      id: "sing.guide-tone-other",
      text: "Note 2, over G7: you sang the 3rd (B), the chord's other guide tone. This line takes the 7th (F), the smaller step.",
    },
  ]);
  expect(run.guide.pass).toBe(false);
  expect(run.guide.lenientPass).toBe(true);
  expect(run.guide.swapped).toEqual([false, true, false]);

  // Dorian: the minor ♭6 for the raised 6.
  expect(run.modal.syllables).toEqual(["do", "sol", "la", "sol"]);
  expect(run.modal.credits).toEqual([1, 1, 0, 1]);
  expect(run.modal.said).toEqual([
    {
      id: "sing.plain-scale",
      text: "Note 3: you sang ♭6 (le), the note of plain D minor. The colour of D Dorian is 6 (la), a half step above.",
    },
  ]);
  expect(problems).toEqual([]);
});

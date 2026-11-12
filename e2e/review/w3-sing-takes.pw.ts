// Wave 3 review, voice: a sung degree pattern (U03.L02 S8, "Sing 1 3 5 3 1" in C) taken with every wrong way a
// learner sings into Chromium's fake microphone — flat, sharp, an octave low, late, in blips too short to count,
// silently, and in a noisy room. Each take must finish, say per target how it went in words, give the step a
// kind and specific line, and leave Continue open (singing never gates, contracts §7.6, §8).
import { expect, test } from "@playwright/test";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { micPage, noHmr, type ReviewWav, resetClock, seed, shootAll, watch } from "./support.ts";

// Every take holds home (1) or nothing: the pattern's 3s and 5 are "another note", the 1s say how close they
// were. `status` is the check's verdict: a take with no voice is not graded ("error", nothing counted).
// The lesson's own words for a sung pattern that missed (Wave 3 integration): how many notes to sing again, then
// note by note what was sung against what the pattern has.
const SUNG_WRONG = /Not there yet: \d+ notes? to sing again|Note \d: you sang/;
const TAKES: { wav: ReviewWav; status: RegExp; says: RegExp; ones: RegExp }[] = [
  { wav: "flat-c4.wav", status: /fail/, says: SUNG_WRONG, ones: /−60¢/ },
  { wav: "sharp-c4.wav", status: /fail/, says: SUNG_WRONG, ones: /\+60¢/ },
  { wav: "octave-c3.wav", status: /fail/, says: SUNG_WRONG, ones: /¢/ },
  { wav: "late-c4.wav", status: /fail/, says: SUNG_WRONG, ones: /¢|not heard/ },
  {
    wav: "short-c4.wav",
    status: /error|fail/,
    says: /Hold each note|short sounds|voice|Not there yet/,
    ones: /not heard|¢/,
  },
  { wav: "silent.wav", status: /error/, says: /didn't hear a voice/, ones: /not heard/ },
  { wav: "noisy-c4.wav", status: /fail/, says: /noisy|Not there yet|you sang/, ones: /¢/ },
];

for (const take of TAKES) {
  test(`a take sung ${take.wav.replace(".wav", "")} finishes, explains itself and never gates`, async ({
    playwright,
    request,
  }) => {
    test.setTimeout(180_000);
    const { page, done } = await micPage(playwright, take.wav);
    try {
      await resetClock(request);
      await seed(request, "after U02.CP");
      await noHmr(page);
      await setUiPrefs(page, { theme: "paper" });
      const problems = watch(page);
      await page.goto("/learn/U03.L02?step=S8");
      await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S8", { timeout: 60_000 });
      await expect(page.getByTestId("continue")).toBeEnabled();
      await page.getByRole("button", { name: "Sing", exact: true }).click();
      await expect(page.getByTestId("sing-phase")).toHaveText(/Done/, { timeout: 60_000 });
      const name = `w3-sing-${take.wav.replace(".wav", "")}`;
      await shootAll(page, `${name}-done`);
      const marks = await page.getByRole("list", { name: "Notes" }).locator("li").allTextContents();
      // Never folded cents like "+440¢" for a note that was another note.
      for (const m of marks) expect(m).not.toMatch(/[1-9]\d\d¢/);
      expect(marks[0] ?? "").toMatch(take.ones);
      const phase = await page.getByTestId("sing-phase").textContent();
      await expect(page.getByTestId("continue")).toBeEnabled();
      await page.getByTestId("check").click();
      const fb = page.getByTestId("step-feedback");
      await expect(fb).toHaveAttribute("data-status", take.status, { timeout: 30_000 });
      // The verdict is on screen, not below the fold of the step's column.
      await expect(fb).toBeInViewport();
      await shootAll(page, `${name}-checked`);
      const said = await fb.textContent();
      console.log(`${take.wav}: phase=${phase} | marks=${marks.join(" / ")} | feedback=${said}`);
      expect(said ?? "").toMatch(take.says);
      expect(said ?? "").not.toMatch(/0 things/);
      await expect(page.getByTestId("continue")).toBeEnabled();
      expect(problems).toEqual([]);
    } finally {
      await done();
    }
  });
}

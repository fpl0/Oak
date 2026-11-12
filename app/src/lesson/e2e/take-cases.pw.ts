// A sung take the pitch tracker could not grade, through the real lesson player with Chromium's fake microphone
// (U03.L02 S8, 1 3 5 3 1): a silent room, a loud room with no pitch in it, only short blips, and an input that
// clips. Each says what happened in its own words, always with a way forward (sing closer, a quieter spot or the
// quiet check, hold each note, turn the input down; Quiet mode for today when there is no voice), and singing
// never holds Continue.
import { expect, stepIs, test } from "./support.ts";
import { FAKE_TAKES, reseedFresh, seed, setQuiet } from "./w3support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const CASES = [
  {
    name: "silent",
    kind: "no-voice",
    flags: FAKE_TAKES.silent,
    says: /didn't hear a voice.*try again/s,
    hint: true,
  },
  {
    name: "noisy",
    kind: "too-noisy",
    flags: FAKE_TAKES.noisy,
    says: /too much noise.*quieter spot/s,
    hint: true,
  },
  { name: "blips", kind: "too-short", flags: FAKE_TAKES.blips, says: /Hold each note/, hint: false },
  {
    name: "clipped",
    kind: "clipped",
    flags: FAKE_TAKES.clipped,
    says: /3 notes to sing again.*too loud.*Turn the input down/s,
    hint: false,
  },
] as const;

let seeded = false;
for (const c of CASES) {
  // Each take needs its own fake microphone, so its own browser (a launch option cannot change per test).
  test(`a ${c.name} take: its own words and a way forward, Continue open`, async ({
    playwright,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const browser = await playwright.chromium.launch({ args: c.flags() });
    try {
      const context = await browser.newContext({
        baseURL: baseURL as string,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\/(\?.*)?$/, (ws) => {
        ws.send(JSON.stringify({ type: "connected" }));
      });
      if (!seeded) {
        await seed(page, "after C1.S1");
        seeded = true;
      }
      await setQuiet(page, false);
      await page.goto("/learn/U03.L02?step=S8");
      await stepIs(page, "S8");
      await page.getByRole("button", { name: "Sing", exact: true }).click();
      await expect(page.getByTestId("sing-phase")).toHaveText(/Done/, { timeout: 60_000 });
      await page.getByTestId("check").click();
      const fb = page.getByTestId("step-feedback");
      await expect(fb).toHaveAttribute("data-status", /fail|error/, { timeout: 30_000 });
      const text = ((await fb.textContent()) ?? "").replace(/\s+/g, " ");
      console.log(`[${c.name}] ${text}`);
      expect(text).toMatch(c.says);
      await expect(fb).toHaveAttribute("data-take", c.kind);
      expect(text).not.toMatch(/Code didn't run|\btb\.|[{}]/);
      if (c.hint) await expect(page.getByTestId("recheck-hint")).toBeVisible();
      await expect(page.getByTestId("continue")).toBeEnabled();
    } finally {
      await browser.close();
    }
  });
}

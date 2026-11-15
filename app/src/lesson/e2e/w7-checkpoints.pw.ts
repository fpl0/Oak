// The track checkpoints in the real app from their dev seeds ("J.CP1 due" …, wave7.md §6; contracts §7.6): every
// item answered on screen through its own widget wherever it has one (cpwalk.ts; the first widget item wrong first,
// then right; a polyrhythm tapped with two hands on its two-lane pad), handed in and stored on the server. J.CP1 and
// R.CP go to a pass, A.CP to a soft pass (attempt 1 handed in empty, attempt 2 right but for one skill, "Continue
// anyway"; AC1 opens, and AC2, whose gate also wants J3.L04 and R1.L05, is said to wait). A track checkpoint gates ONLY its track's capstones (§7.6 rule 5; wave7.md §10 item 19): its result
// names the capstones it opens (by title, never by ID), the server opens them (`capstones.gate`; a soft pass meets
// the gate as a pass does, §4.3), and the track's next lesson was never waiting for it. J.CP1 also goes to "Not
// yet": the result says the next lessons are open either way and that it holds back only "ii–V Ballad", and on the
// server JC1 stays closed while the track's next lesson is not held. J.CP2's items and Make are graded, every
// authored test of them, through the player's own grading path in app/src/lesson/wave7-grading.test.ts.
import type { Page } from "@playwright/test";
import {
  answerAll,
  attemptItems,
  cpIdOf,
  cpStatus,
  handIn,
  oneSkillOut,
  RAW,
  startAttempt,
  type Unit,
  visibleText,
  written,
} from "./cpwalk.ts";
import { stack } from "./playwright.config.ts";
import { expect, test } from "./support.ts";
import { api, reseedFresh, setQuiet } from "./w3support.ts";
import { lookAt } from "./w7look.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

/** What each pass opens (contracts §4.3, `TRACK_CAPSTONE_GATES`); for J.CP1 the track's lesson after it. */
const TRACK_CPS: Record<
  "J.CP1" | "J.CP2" | "R.CP" | "A.CP",
  { capstones: { id: string; title: string }[]; next?: string }
> = {
  "J.CP1": { capstones: [{ id: "JC1", title: "ii–V Ballad" }], next: "J3.L01" },
  "J.CP2": {
    capstones: [
      { id: "JC3", title: "Rhythm-Changes Contrafact" },
      { id: "JC4", title: "Reharmonize a Standard" },
    ],
  },
  "R.CP": {
    capstones: [
      { id: "RC1", title: "16th-Note Funk" },
      { id: "RC2", title: "Clave & Polyrhythm" },
    ],
  },
  "A.CP": {
    capstones: [
      { id: "AC1", title: "One Tune, Two Genres" },
      { id: "AC2", title: "Neo-Soul Ballad" },
    ],
  },
};

const H = { "X-Oak": "1", "Content-Type": "application/json", Origin: stack.baseURL };

/** Seeds `<cp> due` (its items written, the point built: a refusal is a failure). */
async function seedDue(page: Page, cp: Unit): Promise<void> {
  expect(written(cp), `${cp}: its items and Make are written`).toBe(true);
  const r = await page.request.post(`${stack.apiURL}/api/dev/seed`, {
    headers: H,
    data: { point: `${cp} due` },
    timeout: 180_000,
  });
  expect(r.ok(), `seed "${cp} due": ${r.status()} ${(await r.text()).slice(0, 300)}`).toBe(true);
}

async function gateOpen(page: Page, id: string): Promise<boolean | undefined> {
  return (await api<{ open: boolean }>(page, "GET", `/capstones/${id}/gate`)).body?.open;
}

/** The intro says what the checkpoint holds back, before anything is asked; every capstone it opens is closed. */
async function introHolds(page: Page, cp: keyof typeof TRACK_CPS) {
  for (const c of TRACK_CPS[cp].capstones)
    expect(await gateOpen(page, c.id), `${c.id} closed before`).toBe(false);
  await page.goto(`/checkpoint/${cp}`);
  const holds = page.getByTestId("checkpoint-holds");
  for (const c of TRACK_CPS[cp].capstones) await expect(holds).toContainText(`“${c.title}”`);
  await expect(holds).toContainText("The track's lessons never wait for it.");
}

/**
 * What the result names and the server opens: the checkpoint's capstones (`opens`, by default all of them), by
 * title, and nothing about lessons; a capstone with other conditions still to meet is named as waiting, never open.
 */
async function opensOnlyItsCapstones(
  page: Page,
  cp: keyof typeof TRACK_CPS,
  status: string,
  opens: readonly string[] = TRACK_CPS[cp].capstones.map((c) => c.id),
) {
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toHaveAttribute("data-track", cp.slice(0, 1));
  for (const c of TRACK_CPS[cp].capstones)
    await expect(result).toContainText(
      opens.includes(c.id) ? c.title : `“${c.title}” also waits for its other lessons.`,
    );
  // A track checkpoint never speaks of the core's "next lessons" opening: they were never waiting.
  await expect(result).not.toContainText("The next lessons are open.");
  expect(await visibleText(page, "checkpoint-result"), "named by title").not.toMatch(
    /\b[JRA]C\d\b|\b[JRA]\.CP/,
  );
  expect(await cpStatus(page, cp), `${cpIdOf(cp)} on the server`).toMatchObject({ status });
  for (const c of TRACK_CPS[cp].capstones)
    expect(
      await gateOpen(page, c.id),
      `${c.id} ${opens.includes(c.id) ? "open" : "still closed"} after`,
    ).toBe(opens.includes(c.id));
}

for (const cp of ["J.CP1", "R.CP"] as const) {
  test(`${cp}: every item answered on screen, handed in, passed; it opens only its capstones`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await seedDue(page, cp);
    await setQuiet(page, false);
    await introHolds(page, cp);
    await startAttempt(page, cp);
    const kinds = await answerAll(page, cp, { quiet: false });
    expect(kinds).toContain("make");
    expect(kinds, "the first widget item answered wrong first").toContain("wrong-first");
    const result = await handIn(page, cp);
    await expect(result).toHaveAttribute("data-passed", "1");
    await expect(page.getByRole("heading", { name: "Checkpoint passed" })).toBeVisible();
    await opensOnlyItsCapstones(page, cp, "passed");
    if (cp === "J.CP1") await lookAt(page, "w7-jcp1-passed");
  });
}

test("A.CP to a soft pass: not yet on the first attempt, Continue anyway on the retake; AC1 opens, AC2 waits for J3.L04 and R1.L05", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seedDue(page, "A.CP");
  await setQuiet(page, false);
  await introHolds(page, "A.CP");
  // Attempt 1: every item left for later but the Make: well under the line, and no "Continue anyway" yet.
  await startAttempt(page, "A.CP");
  const first = await attemptItems(page, "A.CP");
  expect(first.attemptNo).toBe(1);
  await answerAll(page, "A.CP", { quiet: false, skip: new Set(first.items.map((i) => i.idx)) });
  await expect(page.getByTestId("continue-anyway")).toHaveCount(0);
  const r1 = await handIn(page, "A.CP");
  await expect(r1).toHaveAttribute("data-passed", "0");
  await expect(r1).not.toContainText(/fail/i);
  // Attempt 2: all right but one gated skill: over the soft-pass line, under the pass.
  await startAttempt(page, "A.CP");
  const second = await attemptItems(page, "A.CP");
  expect(second.attemptNo).toBe(2);
  const out = oneSkillOut(second.items);
  await answerAll(page, "A.CP", { quiet: false, skip: out });
  const anyway = page.getByTestId("continue-anyway");
  await expect(anyway).toBeVisible();
  await anyway.click();
  await expect(page.getByTestId("checkpoint-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "On you go" })).toBeVisible();
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  await expect(page.getByTestId("checkpoint-result")).not.toContainText(/failed|debt/i);
  const skill = second.items.find((i) => out.has(i.idx))?.skillId as string;
  await expect(page.locator(`[data-skill="${skill}"]`)).toBeVisible();
  // A soft pass meets the capstones' gate as a pass does (contracts §4.3). AC1 (A.CP + U11.CP) opens; AC2's gate is
  // three-way (A.CP + J3.L04 + R1.L05) and this learner has taken neither jazz nor rhythm: its A.CP line is met,
  // the other two are named, and the result says it waits rather than calling it open.
  await opensOnlyItsCapstones(page, "A.CP", "soft-passed", ["AC1"]);
  const ac2 = (await api<{ conditions: { ref: string; met: boolean }[] }>(page, "GET", "/capstones/AC2/gate"))
    .body?.conditions;
  expect(Object.fromEntries((ac2 ?? []).map((c) => [c.ref, c.met]))).toMatchObject({
    "A.CP": true,
    "J3.L04": false,
    "R1.L05": false,
  });
  await lookAt(page, "w7-acp-soft-pass");
});

test("J.CP1 not yet: it holds back only ii–V Ballad; the track's next lesson is not held", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seedDue(page, "J.CP1");
  await setQuiet(page, false);
  await startAttempt(page, "J.CP1");
  // Every item left for later but the Make: well under the line.
  const items = await api<{ items: { idx: number }[] }>(page, "POST", "/checkpoints/J.CP1/start");
  await answerAll(page, "J.CP1", {
    quiet: false,
    skip: new Set((items.body?.items ?? []).map((i) => i.idx)),
  });
  const result = await handIn(page, "J.CP1");
  await expect(result).toHaveAttribute("data-passed", "0");
  await expect(page.getByRole("heading", { name: "Not yet" })).toBeVisible();
  await expect(result).toContainText("next lessons are open either way");
  await expect(result).toContainText("holds back only “ii–V Ballad”");
  await expect(result).not.toContainText(/fail/i);
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  // On the server: JC1 closed, the track's next lesson not held by the checkpoint (DoD 19).
  expect(await gateOpen(page, "JC1")).toBe(false);
  const prog = await api<{ lessons: { lessonId: string; status: string }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  const next = prog.body?.lessons.find((l) => l.lessonId === TRACK_CPS["J.CP1"].next);
  expect(next?.status, "J3.L01 is not locked by J.CP1").not.toBe("locked");
});

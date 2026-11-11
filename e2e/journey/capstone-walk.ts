// Makes a capstone in the real workspace: start the session, write the piece (into the editor, as one change),
// watch the living checklist tick, check the track, release it through the dialog with a real recording, and
// take the ceremony's way on.
import { expect, type Page } from "@playwright/test";

/** Writes `code` into an editor of the Strudel adapter (`oak_<slug>_<n>_`), as the tutor's Apply would. */
export async function setEditorCode(page: Page, editorId: string, code: string): Promise<void> {
  await page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    editorId,
    { timeout: 60_000 },
  );
  await page.evaluate(
    ([id, c]) => {
      const o = (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel;
      o.editors.get(id as string)?.setCode(c as string);
    },
    [editorId, code],
  );
}

export interface CapstoneRun {
  id: string;
  code: string;
  rules: number;
  linerLine: string;
}

export async function walkCapstone(page: Page, c: CapstoneRun): Promise<void> {
  const start = page.getByRole("button", { name: /^Start session 1 of/ });
  const workspace = page.getByTestId("capstone-workspace");
  await expect(start.or(workspace)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(workspace).toBeVisible({ timeout: 60_000 });
  await setEditorCode(page, `oak_capstone-${c.id}_0_`, c.code);
  await expect(page.getByTestId("req-count")).toHaveText(`${c.rules} of ${c.rules} met`, { timeout: 60_000 });
  const checked = page.waitForResponse((r) => /\/api\/capstones\/[^/]+\/checks$/.test(r.url()), {
    timeout: 60_000,
  });
  await page.getByTestId("check-track").click();
  const res = await checked;
  expect(res.ok()).toBe(true);
  expect((await res.json()) as { status?: string; lastResult?: { status: string } }).toBeTruthy();
  await page.getByTestId("release").click();
  const dialog = page.getByRole("dialog", { name: "Release to the album" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel(/One line for the liner notes/).fill(c.linerLine);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
}

// Ports the S2 proofs: three editors under StrictMode, solo, mute by label, the mutex over the mirror's
// own entry points, Oak's CM6 extensions, read-only regions, the live-mirror budget, dispose x20 leak check.
import { expect, test } from "@playwright/test";
import { openPage } from "./helpers.ts";

type W = Window & {
  // biome-ignore lint/suspicious/noExplicitAny: the test API is driven untyped from page.evaluate
  __oak: any;
  __instr: { audioContexts: number; window: Map<string, number>; document: Map<string, number> };
  __setMounted(v: boolean): void;
};

const ids = ["oak_e2e_1_", "oak_e2e_2_", "oak_e2e_3_"] as const;

test("three editors under StrictMode load clean, one AudioContext, one prebake, no side effects", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const errors = await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const s = await page.evaluate(() => {
    const w = window as unknown as W;
    const settings = JSON.parse(localStorage.getItem("codemirror-settings") ?? "{}");
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("#test-canvas")];
    return {
      contexts: w.__instr.audioContexts,
      created: w.__oak.events.created,
      disposed: w.__oak.events.disposed,
      views: document.querySelectorAll(".cm-editor").length,
      htmlClass: document.documentElement.className,
      themeVars: document.getElementById("strudel-theme-vars")?.textContent ?? null,
      canvases: canvases.map((c) => ({ visible: c.checkVisibility(), w: c.width })),
      autocompletion: settings.isAutoCompletionEnabled,
      sounds: w.__oak.oak.sounds().length,
    };
  });
  expect(s.contexts).toBe(1);
  expect(s.created).toBe(6); // StrictMode mounts, unmounts, mounts again
  expect(s.disposed).toBe(3);
  expect(s.views).toBe(3);
  expect(s.htmlClass).toBe("oak");
  expect(s.themeVars).toBe("");
  expect(s.canvases).toEqual([{ visible: false, w: 1 }]);
  expect(s.autocompletion).toBe(false);
  expect(s.sounds).toBeGreaterThan(150);
  expect(requests.filter((u) => u.endsWith("/manifest.json"))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("solo: starting one editor stops the other; stop is silent; coordinator follows", async ({ page }) => {
  await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const r = await page.evaluate(async (ids) => {
    const { oak, maxLevel, events } = (window as unknown as W).__oak;
    const [a, b] = ids.map((id: string) => oak.editors.get(id));
    const outA = await a.play();
    const rmsA = (await maxLevel(600)).rms;
    await b.play();
    const after = {
      a: a.playing,
      b: b.playing,
      active: oak.coordinator.get().activeId,
      transport: oak.transport.activeEditorId,
    };
    const rmsB = (await maxLevel(600)).rms;
    const cycle1 = oak.transport.cycle();
    await new Promise((x) => setTimeout(x, 300));
    const cycle2 = oak.transport.cycle();
    b.stop();
    await new Promise((x) => setTimeout(x, 1500));
    const rmsStopped = (await maxLevel(300)).rms;
    return {
      outA,
      rmsA,
      rmsB,
      rmsStopped,
      after,
      cycle1,
      cycle2,
      toggles: events.toggles[ids[0]],
      active: oak.coordinator.get().activeId,
    };
  }, ids);
  expect(r.outA.ok).toBe(true);
  expect(r.outA.cps).toBeCloseTo(0.5); // 120 bpm in 4/4 from the lesson default
  expect(r.rmsA).toBeGreaterThan(0.02);
  expect(r.after).toEqual({ a: false, b: true, active: ids[1], transport: ids[1] });
  expect(r.rmsB).toBeGreaterThan(0.02);
  expect(r.cycle2).toBeGreaterThan(r.cycle1);
  expect(r.toggles).toEqual([true, false]);
  expect(r.rmsStopped).toBeLessThan(0.001);
  expect(r.active).toBeNull();
});

test("mute and solo by label act live, without re-evaluation, and never touch the text", async ({ page }) => {
  await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const r = await page.evaluate(async (id) => {
    const { oak, maxLevel, events } = (window as unknown as W).__oak;
    const e = oak.editors.get(id);
    const code = e.getCode();
    const out = await e.play();
    const count = () => {
      const c: Record<string, number> = {};
      for (const h of e.queryHaps(0, 1)) c[h.value.s] = (c[h.value.s] ?? 0) + 1;
      return c;
    };
    const all = count();
    const evals = events.evaluated[id];
    e.setMutes({ muted: new Set(["drums"]), solo: null });
    const noDrums = count();
    e.setMutes({ muted: new Set(), solo: "drums" });
    const onlyDrums = count();
    e.setMutes({ muted: new Set(["drums", "bass"]), solo: null });
    await new Promise((x) => setTimeout(x, 1500)); // notes already triggered ring out (1 s at cps 0.5)
    const silent = (await maxLevel(500)).rms;
    e.setMutes({ muted: new Set(), solo: null });
    const back = (await maxLevel(800)).rms;
    e.stop();
    return {
      tracks: out.tracks,
      all,
      noDrums,
      onlyDrums,
      silent,
      back,
      evalsBefore: evals,
      evalsAfter: events.evaluated[id],
      same: e.getCode() === code,
    };
  }, ids[1]);
  expect(r.tracks).toEqual(["drums", "bass"]);
  expect(r.all).toEqual({ square: 4, sawtooth: 2 });
  expect(r.noDrums).toEqual({ sawtooth: 2 });
  expect(r.onlyDrums).toEqual({ square: 4 });
  expect(r.silent).toBeLessThan(0.001);
  expect(r.back).toBeGreaterThan(0.02);
  expect(r.evalsAfter).toBe(r.evalsBefore);
  expect(r.same).toBe(true);
});

test("Ctrl-Enter goes through the mutex; lint errors block; completion lists only unlocked tools", async ({
  page,
}) => {
  const errors = await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const content = page.locator(`[data-testid="${ids[2]}"] .cm-content`);
  await content.click();
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction((id) => (window as unknown as W).__oak.events.evaluated[id] === 1, ids[2]);
  expect(
    await page.evaluate((id) => (window as unknown as W).__oak.oak.editors.get(id).playing, ids[2]),
  ).toBe(true);
  await page.keyboard.press("Control+.");
  await page.waitForFunction((id) => !(window as unknown as W).__oak.oak.editors.get(id).playing, ids[2]);

  // completion: `voicing` is locked, `velocity` is not in the unlocked set either; `note` is.
  await page.keyboard.press("End");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nno");
  await page.waitForSelector(".cm-tooltip-autocomplete");
  const labels = await page.locator(".cm-tooltip-autocomplete .cm-completionLabel").allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(["note"]);
  await page.keyboard.press("Escape");
  await page.keyboard.type("\n.vo");
  await page.waitForTimeout(300);
  expect(await page.locator(".cm-tooltip-autocomplete").count()).toBe(0);

  // lint: FORBIDDEN is an error: shown in the editor and evaluation refused
  const out = await page.evaluate(async (id) => {
    const e = (window as unknown as W).__oak.oak.editors.get(id);
    e.setCode('note("c4").s("sine") // FORBIDDEN');
    const o = await e.evaluate({ autostart: false });
    await new Promise((x) => setTimeout(x, 400));
    return { ok: o.ok, ids: o.diagnostics.map((d: { id: string }) => d.id), playing: e.playing };
  }, ids[2]);
  expect(out).toEqual({ ok: false, ids: ["code.locked-tool"], playing: false });
  await expect(page.locator(`[data-testid="${ids[2]}"] .cm-lintRange-error`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("read-only regions, marks, flash and diagnostics pushed from outside", async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    const w = window as unknown as W;
    // only the number 2 in `.fast(2)` is editable
    w.__oak.mountImperative("oak_ro_0_", 's("bd").fast(2)', {
      readOnly: { editable: [{ from: 13, to: 14 }] },
    });
  });
  const content = page.locator('[data-testid="oak_ro_0_"] .cm-content');
  await content.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("XX");
  expect(
    await page.evaluate(() => (window as unknown as W).__oak.oak.editors.get("oak_ro_0_").getCode()),
  ).toBe('s("bd").fast(2)');
  const r = await page.evaluate(async () => {
    const e = (window as unknown as W).__oak.oak.editors.get("oak_ro_0_");
    e.focusRanges([{ from: 13, to: 14 }]);
    const sel = e.view.state.selection.main;
    e.view.dispatch({ changes: { from: 13, to: 14, insert: "4" }, userEvent: "input" });
    const afterEdit = e.getCode();
    e.setMarks([{ range: { from: 0, to: 1 }, kind: "hint" }]);
    e.flashRanges([{ from: 2, to: 4 }], 300);
    const flash = document.querySelectorAll('[data-testid="oak_ro_0_"] .oak-flash').length;
    e.setDiagnostics([
      { id: "eval.runtime", severity: "error", range: { from: 0, to: 1 }, line: 1, params: {}, message: "x" },
    ]);
    await new Promise((x) => setTimeout(x, 500));
    e.setEditable(true);
    e.view.dispatch({ changes: { from: 13, to: 14, insert: "8" }, userEvent: "input" });
    return {
      sel: [sel.from, sel.to],
      afterEdit,
      afterLock: e.getCode(),
      hint: document.querySelectorAll('[data-testid="oak_ro_0_"] .oak-mark-hint').length,
      flash,
      flashGone: document.querySelectorAll('[data-testid="oak_ro_0_"] .oak-flash').length,
      lint: document.querySelectorAll('[data-testid="oak_ro_0_"] .cm-lintRange-error').length,
    };
  });
  expect(r).toEqual({
    sel: [13, 14],
    afterEdit: 's("bd").fast(4)',
    afterLock: 's("bd").fast(4)',
    hint: 1,
    flash: 1,
    flashGone: 0,
    lint: 1,
  });
});

test("live-mirror budget: at most 6 mirrors, the least recently used becomes a static <pre>", async ({
  page,
}) => {
  await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const r = await page.evaluate(() => {
    const w = window as unknown as W;
    const evicted: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `oak_lru_${i}_`;
      w.__oak.mountImperative(id, `s("bd*${i + 1}")`, { onEvicted: () => evicted.push(id) });
    }
    return {
      size: w.__oak.oak.editors.size,
      views: document.querySelectorAll(".cm-editor").length,
      pres: [...document.querySelectorAll("pre.oak-static-code")].map((p) => p.textContent),
      evicted,
    };
  });
  expect(r.size).toBe(6);
  expect(r.views).toBe(6);
  expect(r.pres).toHaveLength(2);
  expect(r.evicted).toEqual([]); // the evicted ones are the StrictMode editors (no onEvicted given)
});

test("dispose is complete: 20 mount/unmount cycles leave no listener, view or interval behind", async ({
  page,
}) => {
  const errors = await openPage(page);
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  const sample = () =>
    page.evaluate(() => {
      const w = window as unknown as W;
      const strip = (m: Map<string, number>) =>
        Object.fromEntries(
          [...m].filter(([t]) => t !== "storage" && t !== "pageshow").filter(([, n]) => n !== 0),
        );
      return {
        views: document.querySelectorAll(".cm-editor").length,
        editors: w.__oak.oak.editors.size,
        win: strip(w.__instr.window),
        doc: strip(w.__instr.document),
      };
    });
  const samples: Awaited<ReturnType<typeof sample>>[] = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    await page.evaluate(
      async ([cycle, ids]) => {
        const w = window as unknown as W;
        const e = w.__oak.oak.editors.get(ids[cycle % 3]);
        if (cycle % 3 === 0) await e.play();
        else if (cycle % 3 === 1) void e.evaluate({ autostart: true });
        else {
          await e.play();
          e.setMutes({ muted: new Set(), solo: "bass" });
        }
        w.__setMounted(false);
      },
      [cycle, ids] as const,
    );
    await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 0);
    await page.waitForTimeout(1200); // nanostores' storage/pageshow flicker settles
    samples.push(await sample());
    await page.evaluate(() => (window as unknown as W).__setMounted(true));
    await page.waitForFunction(() => (window as unknown as W).__oak.oak.editors.size === 3);
  }
  console.log(JSON.stringify(samples.map((s) => s.win)));
  for (const s of samples.slice(1)) expect(s).toEqual(samples[0]);
  expect(samples[0]?.views).toBe(0);
  expect(samples[0]?.win.message ?? 0).toBeLessThanOrEqual(2); // only the adapter-independent ones (vite, react)
  expect(errors.filter((e) => !/oak: editor was disposed/.test(e))).toEqual([]);
});

test("audio unlocks only from a real gesture; a failed unlock does not dead-lock evaluation @gesture", async ({
  page,
}) => {
  // No page.evaluate before the gesture: Playwright's evaluate runs with a user activation.
  const probe = new Promise<string>((resolve) => {
    page.on("console", (m) => {
      if (m.text().startsWith("OAK_PROBE ")) resolve(m.text().slice("OAK_PROBE ".length));
    });
  });
  await page.goto("/?probe=nogesture");
  const before = JSON.parse(await probe);
  expect(before.state).toBe("locked");
  expect(before.ids).toContain("eval.audio-locked");
  expect(before.ok).toBe(true); // the code ran; it just could not start
  expect(before.playing).toBe(false);
  expect(before.second).toBe(true); // the mutex is not dead-locked
  expect(before.ms).toBeLessThan(2500);
  await page.mouse.click(5, 5); // a real gesture: the autoUnlock listener resumes the context
  await page.waitForFunction(() => (window as unknown as W).__oak.oak.audio.get() === "running");
  const after = await page.evaluate(async () => {
    const { oak, maxLevel } = (window as unknown as W).__oak;
    await oak.editors.get("oak_e2e_1_").play();
    return (await maxLevel(600)).rms;
  });
  expect(after).toBeGreaterThan(0.02);
});

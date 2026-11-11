// Spike S2 e2e: three StrudelMirror editors in Vite 8 + React 19 StrictMode.
//   sh spikes/s2-editors/run-e2e.sh           (runs everything below, in order)
//   MODE=dev     bunx playwright test      (Vite dev server, StrictMode double-mount active)
//   MODE=preview bunx playwright test      (production build served by `vite preview`; run `vite build` first)
// Every test records what it observed into results/<mode>-<project>.json (the evidence for the spike result).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test as base, type CDPSession, expect, type Page } from '@playwright/test';

const MODE = process.env.MODE === 'preview' ? 'preview' : 'dev';
const E1 = 'oak_s2_1_';
const E2 = 'oak_s2_2_';
const E3 = 'oak_s2_3_';
const results: Record<string, unknown> = {};

type Cap = { all: string[]; errors: string[] };
const test = base.extend<{ cap: Cap }>({
  cap: async ({ page }, use) => {
    const cap: Cap = { all: [], errors: [] };
    page.on('console', (m) => {
      const line = `[${m.type()}] ${m.text()}`;
      cap.all.push(line);
      if (m.type() === 'error') cap.errors.push(line);
    });
    page.on('pageerror', (e) => {
      cap.all.push(`[pageerror] ${e.message}`);
      cap.errors.push(`[pageerror] ${e.message}`);
    });
    await use(cap);
  },
});
test.afterAll(async ({}, testInfo) => {
  // merge: Playwright restarts the worker after a failed test, and each worker has its own `results`
  mkdirSync('results', { recursive: true });
  const file = `results/${MODE}-${testInfo.project.name}.json`;
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...previous, ...results }, null, 2));
});

async function open(page: Page, path = '/', editors = 3) {
  await page.goto(path);
  await page.waitForFunction(() => (window as any).__oak?.ready === true);
  await expect(page.locator('.cm-editor')).toHaveCount(editors);
}
const state = (page: Page, id: string) => page.getByTestId(`state-${id}`);
const play = (page: Page, id: string) => page.getByTestId(`play-${id}`).click();
const stop = (page: Page, id: string) => page.getByTestId(`stop-${id}`).click();
/** max RMS seen on the AnalyserNode tapped off superdough's destinationGain during `ms` */
const maxRms = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const o = (window as any).__oak;
    let max = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      max = Math.max(max, o.rms());
      await new Promise((r) => setTimeout(r, 15));
    }
    return max;
  }, ms);
const noStrudelNoise = (lines: string[]) => lines.filter((l) => !l.includes('process is not defined'));

/** true heap-level instance counts via CDP (after a forced GC) */
async function heapCounts(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const out: Record<string, number | null> = {};
  for (const name of ['EditorView', 'StrudelMirror', 'Cyclist', 'Drawer']) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `window.__oak.protos.${name}`,
      objectGroup: 'heap',
    });
    if (!result.objectId) {
      out[name] = null;
      continue;
    }
    const { objects } = await cdp.send('Runtime.queryObjects', {
      prototypeObjectId: result.objectId,
      objectGroup: 'heap',
    });
    const len = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId!,
      functionDeclaration: 'function(){return this.length}',
      returnByValue: true,
    });
    out[name] = len.result.value;
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'heap' });
  return out;
}
async function metrics(page: Page, cdp?: CDPSession) {
  await page.waitForTimeout(250); // let CodeMirror's measure cycle and the 200ms flash timer settle
  const m = await page.evaluate(async () => {
    const o = (window as any).__oak;
    const i = (window as any).__instr;
    const raf = await i.sampleRaf(20);
    return {
      cmEditorsInDom: document.querySelectorAll('.cm-editor').length,
      liveEditorViews: o.stats.liveViews.size as number,
      rafCallbacksPerFrame: raf.perFrame as number,
      rafPendingMax: raf.pendingMax as number,
      schedulerIntervals: o.stats.liveIntervals.size as number,
      windowIntervals: i.intervals() as number,
      documentListeners: i.listenerTotals().document as number,
      windowListeners: i.listenerTotals().window as number,
      listenerDetail: i.listeners(),
      headStyles: document.head.querySelectorAll('style').length,
      testCanvases: document.querySelectorAll('#test-canvas').length,
      created: o.stats.created as number,
      disposed: o.stats.disposed as number,
    };
  });
  // nanostores' persistentAtom (codemirrorSettings) adds window 'storage' + 'pageshow' listeners whenever it is
  // read and removes them by itself ~1s later (STORE_UNMOUNT_DELAY). Transient, not a leak: count them apart.
  const w = m.listenerDetail.window as Record<string, number>;
  const transientNanostoresListeners = (w.storage ?? 0) + (w.pageshow ?? 0);
  return {
    ...m,
    windowListeners: m.windowListeners - transientNanostoresListeners,
    transientNanostoresListeners,
    heap: cdp ? await heapCounts(cdp) : undefined,
  };
}
type Metrics = Awaited<ReturnType<typeof metrics>>;
const light = (m: Metrics) => ({
  cmEditorsInDom: m.cmEditorsInDom,
  liveEditorViews: m.liveEditorViews,
  rafCallbacksPerFrame: m.rafCallbacksPerFrame,
  schedulerIntervals: m.schedulerIntervals,
  windowIntervals: m.windowIntervals,
  documentListeners: m.documentListeners,
  windowListeners: m.windowListeners,
  headStyles: m.headStyles,
  testCanvases: m.testCanvases,
});
const toggleMount = async (page: Page, expectEditors: number) => {
  await page.locator('#toggle-mount').click();
  await expect(page.locator('.cm-editor')).toHaveCount(expectEditors);
};

// -------------------------------------------------------------------------------------------------
test('1. page loads with no errors; StrictMode double-mount; one prebake, one AudioContext', async ({ page, cap }) => {
  await open(page);
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const o = (window as any).__oak;
    return {
      created: o.stats.created,
      disposed: o.stats.disposed,
      prebakeRuns: o.stats.prebakeRuns,
      audioContextsConstructed: (window as any).__instr.audioContexts(),
      superdoughUsesOurContext: o.sameAudioContext(),
      capturedKabelsalatWindowListeners: o.stats.capturedWindowListeners,
      inPageErrors: (window as any).__instr.errors,
      editorIds: [...o.editors.keys()],
    };
  });
  results['1.load'] = { mode: MODE, ...info, consoleErrors: cap.errors, console: cap.all };
  expect(cap.errors).toEqual([]);
  expect(cap.all.join('\n')).not.toContain('process is not defined');
  expect(info.inPageErrors).toEqual([]);
  // dev: StrictMode mounts, cleans up and re-mounts every editor. prod build: single mount.
  expect({ created: info.created, disposed: info.disposed }).toEqual(
    MODE === 'dev' ? { created: 6, disposed: 3 } : { created: 3, disposed: 0 },
  );
  expect(info.prebakeRuns).toBe(1);
  expect(info.audioContextsConstructed).toBe(1);
  expect(info.superdoughUsesOurContext).toBe(true);
  // creation order: the ref-callback editor (E3) is created before the useEffect editors (refs attach first)
  expect([...info.editorIds].sort()).toEqual([E1, E2, E3]);
});

test('1b. process.env.NODE_ENV is replaced: a runtime trigger error goes through errorLogger cleanly', async ({ page, cap }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).__logs = [];
    document.addEventListener('strudel.log', (e: any) => (window as any).__logs.push(e.detail.message));
    (window as any).__oak.editors.get('oak_s2_1_').setCode('note("c4").s("oak_no_such_sound")');
  });
  await play(page, E1);
  await expect(state(page, E1)).toHaveText('playing');
  await page.waitForFunction(() => (window as any).__logs.some((m: string) => m.includes('error')));
  await stop(page, E1);
  const logs: string[] = await page.evaluate(() => (window as any).__logs);
  const errLog = logs.find((m) => m.includes('error'));
  results['1b.errorLogger'] = { mode: MODE, strudelLog: errLog, consoleErrors: cap.errors };
  expect(errLog).toContain('oak_no_such_sound');
  expect(cap.all.join('\n')).not.toContain('process is not defined');
  // errorLogger does `if (process.env.NODE_ENV === 'development') console.error(e)`:
  // the dev server defines it as "development" (console.error is emitted), the build as "production" (silent).
  if (MODE === 'dev') expect(cap.errors.some((e) => e.includes('oak_no_such_sound'))).toBe(true);
  else expect(cap.errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
test('2. playback: editor 1 sounds (RMS>0), editor 2 solos editor 1, stop silences, Ctrl-Enter works', async ({ page, cap }) => {
  await open(page);
  const r: Record<string, unknown> = { mode: MODE };

  await play(page, E1);
  await expect(state(page, E1)).toHaveText('playing');
  r.rmsWhileEditor1Plays = await maxRms(page, 1500);
  r.afterPlay1 = await page.evaluate(() => {
    const o = (window as any).__oak;
    const e = (id: string) => o.editors.get(id);
    return {
      started: [e('oak_s2_1_').playing, e('oak_s2_2_').playing, e('oak_s2_3_').playing],
      toggles1: e('oak_s2_1_').log.toggles,
      evals1: e('oak_s2_1_').log.evals,
      triggers1: e('oak_s2_1_').log.triggers.slice(0, 3),
      ctxState: o.audioCtx.state,
      currentTime: o.audioCtx.currentTime,
      audioLog: o.stats.audioLog,
    };
  });
  expect(r.rmsWhileEditor1Plays as number).toBeGreaterThan(0.005);
  expect((r.afterPlay1 as any).started).toEqual([true, false, false]);

  // solo: starting editor 2 stops editor 1 (document 'start-repl' event)
  await play(page, E2);
  await expect(state(page, E2)).toHaveText('playing');
  await expect(state(page, E1)).toHaveText('stopped');
  r.rmsWhileEditor2Plays = await maxRms(page, 1200);
  r.afterPlay2 = await page.evaluate(() => {
    const e = (id: string) => (window as any).__oak.editors.get(id);
    return {
      started: [e('oak_s2_1_').playing, e('oak_s2_2_').playing, e('oak_s2_3_').playing],
      toggles1: e('oak_s2_1_').log.toggles,
      toggles2: e('oak_s2_2_').log.toggles,
    };
  });
  expect((r.afterPlay2 as any).started).toEqual([false, true, false]);
  expect((r.afterPlay2 as any).toggles1).toEqual([true, false]);
  expect(r.rmsWhileEditor2Plays as number).toBeGreaterThan(0.005);

  // stop
  await stop(page, E2);
  await expect(state(page, E2)).toHaveText('stopped');
  await page.waitForTimeout(1500); // envelopes release
  r.rmsAfterStop = await maxRms(page, 500);
  expect(r.rmsAfterStop as number).toBeLessThan(1e-4);

  // keyboard: StrudelMirror's own Ctrl-Enter / Ctrl-. keymap (routed through our eval mutex)
  await page.locator(`[data-editor="${E3}"] .cm-content`).click();
  await page.keyboard.press('Control+Enter');
  await expect(state(page, E3)).toHaveText('playing');
  r.rmsWhileEditor3Plays = await maxRms(page, 1200);
  await page.keyboard.press('Control+.');
  await expect(state(page, E3)).toHaveText('stopped');
  expect(r.rmsWhileEditor3Plays as number).toBeGreaterThan(0.005);

  r.end = await page.evaluate(() => ({
    audioContextsConstructed: (window as any).__instr.audioContexts(),
    evals: (window as any).__oak.stats.evals,
    testCanvases: document.querySelectorAll('#test-canvas').length,
  }));
  expect((r.end as any).audioContextsConstructed).toBe(1);
  r.consoleErrors = cap.errors;
  results['2.playback'] = r;
  expect(cap.errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
test('3. Oak CM6 extensions via StateEffect.appendConfig: autocomplete override + linter; single @codemirror/state', async ({ page, cap }) => {
  await open(page);
  const ident = await page.evaluate(() => {
    const o = (window as any).__oak;
    return { ...o.cmIdentity(), extensionErrors: [...o.editors.values()].map((e: any) => e.extensionError) };
  });
  expect(ident.viewInstanceofOurEditorView).toBe(true);
  expect(ident.strudelEffectInstanceofOurStateEffect).toBe(true);
  expect(ident.extensionErrors).toEqual([null, null, null]);
  if (MODE === 'dev') expect(ident.codemirrorStateUrls).toHaveLength(1);

  // autocompletion: only OUR source answers (override)
  const content = page.locator(`[data-editor="${E2}"] .cm-content`);
  await content.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\noakN', { delay: 30 });
  const tooltip = page.locator('.cm-tooltip-autocomplete');
  await expect(tooltip).toBeVisible();
  const options = await tooltip.locator('li').allTextContents();
  const apiCompletions = await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_2_').cm.completions());
  await page.waitForTimeout(200); // autocompletion's default interactionDelay (75ms) ignores an earlier Enter
  await page.keyboard.press('Enter');
  await expect(tooltip).toBeHidden();
  const afterAccept = await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_2_').getCode());
  expect(apiCompletions).toEqual(['oakNote']);
  expect(afterAccept).toContain('oakNote');

  // linter(): a diagnostic from our lint source shows up in state + DOM
  await page.keyboard.type('\nFORBIDDEN', { delay: 10 });
  await page.keyboard.press('Escape');
  const lintRange = page.locator(`[data-editor="${E2}"] .cm-lintRange-error`);
  await expect(lintRange).toHaveCount(1);
  const lintCount = await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_2_').cm.diagnosticCount());
  expect(lintCount).toBe(1);
  expect(await lintRange.textContent()).toBe('FORBIDDEN');

  // push-style diagnostics (setDiagnostics) work too
  await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_1_').cm.pushDiagnostic(0, 4, 'oak: pushed'));
  await expect(page.locator(`[data-editor="${E1}"] .cm-lintRange-warning`)).toHaveCount(1);

  // gotcha probe: turning Strudel's OWN autocompletion on next to ours
  const conflict = await page.evaluate(() => {
    const m = (window as any).__oak.editors.get('oak_s2_3_').mirror;
    try {
      m.setAutocompletionEnabled(true);
      return 'no error';
    } catch (e) {
      const msg = String(e);
      try {
        m.setAutocompletionEnabled(false);
      } catch {}
      return msg;
    }
  });
  results['3.extensions'] = {
    mode: MODE,
    ...ident,
    autocompleteTooltipOptions: options,
    currentCompletions: apiCompletions,
    docAfterAccept: afterAccept,
    lintDiagnosticCount: lintCount,
    strudelAutocompleteEnabledNextToOurs: conflict,
    consoleErrors: cap.errors,
  };
  expect(cap.all.join('\n')).not.toContain('Unrecognized extension value');
  expect(cap.errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
test('4. full dispose(): 20 mount/unmount cycles leave no EditorViews / rAF loops / listeners / timers', async ({ page, cap }) => {
  test.setTimeout(240_000);
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  const series: Array<{ cycle: number; phase: string } & ReturnType<typeof light> & { heap?: unknown }> = [];
  const mounted0 = await metrics(page, cdp);
  series.push({ cycle: 0, phase: 'mounted', ...light(mounted0), heap: mounted0.heap });
  const unmounted: Record<number, Metrics> = {};
  const mounted: Record<number, Metrics> = { 0: mounted0 };

  for (let c = 1; c <= 20; c++) {
    if (c % 4 === 1) {
      // dispose WHILE PLAYING (scheduler interval + Drawer rAF loop are live)
      await play(page, E1);
      await expect(state(page, E1)).toHaveText('playing');
      await page.waitForTimeout(150);
    } else if (c % 4 === 2) {
      // dispose right after an evaluate (flash timer / afterEval dispatches still pending)
      await page.evaluate(() => {
        void (window as any).__oak.editors.get('oak_s2_3_').evaluate(false);
      });
    } else if (c % 4 === 3) {
      // play, switch (solo), then unmount
      await play(page, E2);
      await play(page, E3);
      await expect(state(page, E3)).toHaveText('playing');
    }
    await toggleMount(page, 0);
    const withHeap = c === 1 || c === 10 || c === 20;
    unmounted[c] = await metrics(page, withHeap ? cdp : undefined);
    series.push({ cycle: c, phase: 'unmounted', ...light(unmounted[c]), heap: unmounted[c].heap });
    await toggleMount(page, 3);
    if (withHeap) {
      mounted[c] = await metrics(page, cdp);
      series.push({ cycle: c, phase: 'mounted', ...light(mounted[c]), heap: mounted[c].heap });
    }
  }
  // which disposed mirrors does the heap still hold once everything is unmounted? (bounded global retention)
  await toggleMount(page, 0);
  await page.waitForTimeout(300);
  const finalHeap = await heapCounts(cdp);
  const end = await page.evaluate(() => ({
    created: (window as any).__oak.stats.created,
    disposed: (window as any).__oak.stats.disposed,
    totalEvals: (window as any).__oak.stats.evals,
    survivorsAfterFinalUnmountAndGC: (window as any).__oak.survivors(),
    inPageErrors: (window as any).__instr.errors,
  }));
  console.log(`[${MODE}] final unmount: heap=${JSON.stringify(finalHeap)} created=${end.created} disposed=${end.disposed} survivors=${JSON.stringify(end.survivorsAfterFinalUnmountAndGC)} (total evals ${end.totalEvals})`);
  results['4.leak'] = {
    mode: MODE,
    series,
    listenerDetailMounted: mounted[20].listenerDetail,
    listenerDetailUnmounted: unmounted[20].listenerDetail,
    finalHeap,
    maxTransientNanostoresListeners: Math.max(...Object.values(unmounted).map((m) => m.transientNanostoresListeners)),
    ...end,
    consoleErrors: cap.errors,
  };
  console.log(`\n[${MODE}] leak series (cycle phase views rAF/frame intervals docL winL | heap)`);
  for (const s of series.filter((s) => s.heap || s.cycle % 5 === 0))
    console.log(
      `  ${String(s.cycle).padStart(2)} ${s.phase.padEnd(9)} views=${s.liveEditorViews} dom=${s.cmEditorsInDom} raf=${s.rafCallbacksPerFrame} int=${s.schedulerIntervals}/${s.windowIntervals} docL=${s.documentListeners} winL=${s.windowListeners} ${s.heap ? JSON.stringify(s.heap) : ''}`,
    );

  // no growth: every unmounted sample is identical to the first one, every mounted sample to the initial page
  for (let c = 2; c <= 20; c++) expect(light(unmounted[c]), `unmounted cycle ${c}`).toEqual(light(unmounted[1]));
  for (const c of [1, 10, 20]) expect(light(mounted[c]), `mounted cycle ${c}`).toEqual(light(mounted0));
  expect(unmounted[20].liveEditorViews).toBe(0);
  expect(unmounted[20].cmEditorsInDom).toBe(0);
  expect(unmounted[20].rafCallbacksPerFrame).toBe(0);
  expect(unmounted[20].schedulerIntervals).toBe(0);
  // heap: destroyed EditorViews are actually collected (bounded, not growing with the cycle count)
  const h = (m: Metrics) => m.heap as Record<string, number>;
  expect(h(unmounted[20]).EditorView).toBeLessThanOrEqual(h(unmounted[1]).EditorView);
  expect(h(mounted[20]).EditorView).toBeLessThanOrEqual(h(mounted[1]).EditorView);
  expect(h(unmounted[20]).EditorView).toBeLessThanOrEqual(3);
  expect(end.inPageErrors).toEqual([]);
  expect(cap.errors).toEqual([]);
});

for (const mode of ['none', 'research'] as const) {
  test(`4-control. the same loop with dispose=${mode} DOES leak (proves the instrumentation is sensitive)`, async ({ page }) => {
    await open(page, `/?dispose=${mode}`);
    const cdp = await page.context().newCDPSession(page);
    await toggleMount(page, 0);
    const first = await metrics(page, cdp);
    for (let c = 0; c < 5; c++) {
      await toggleMount(page, 3);
      await toggleMount(page, 0);
    }
    const last = await metrics(page, cdp);
    const growth = {
      documentListeners: last.documentListeners - first.documentListeners,
      windowListeners: last.windowListeners - first.windowListeners,
      liveEditorViews: last.liveEditorViews - first.liveEditorViews,
      heapEditorView: (last.heap as any).EditorView - (first.heap as any).EditorView,
      heapStrudelMirror: (last.heap as any).StrudelMirror - (first.heap as any).StrudelMirror,
    };
    results[`4-control.${mode}`] = {
      mode: MODE,
      mountsBetweenSamples: MODE === 'dev' ? '5 cycles x 3 editors x 2 (StrictMode) = 30 mirrors' : '5 cycles x 3 editors = 15 mirrors',
      first: { ...light(first), heap: first.heap },
      last: { ...light(last), heap: last.heap },
      growth,
      windowListenerDetail: last.listenerDetail.window,
    };
    console.log(`\n[${MODE}] dispose=${mode} growth over 5 cycles: ${JSON.stringify(growth)}`);
    if (mode === 'none') {
      expect(growth.documentListeners).toBeGreaterThan(0);
      expect(growth.liveEditorViews).toBeGreaterThan(0);
    } else {
      // the research's 5-step dispose misses exactly one thing: kabelsalat's window 'message' listener per mirror
      expect(growth.documentListeners).toBe(0);
      expect(growth.windowListeners).toBe(MODE === 'dev' ? 30 : 15);
    }
  });
}

// -------------------------------------------------------------------------------------------------
test('5. mute without rewriting code: wrap Pattern.prototype.p inside beforeEval', async ({ page, cap }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const o = (window as any).__oak;
    const e = o.editors.get('oak_s2_3_');
    const original = e.getCode();
    const count = () => {
      const by: Record<string, number> = {};
      for (const h of e.queryHaps(0, 1)) by[h.value.s] = (by[h.value.s] ?? 0) + 1;
      return by;
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const triggersSince = (n: number) => {
      const by: Record<string, number> = {};
      for (const t of e.log.triggers.slice(n)) by[t.s] = (by[t.s] ?? 0) + 1;
      return by;
    };
    const out: Record<string, unknown> = { code: original };

    // A marker assigned to Pattern.prototype.p BEFORE evaluate() does not survive: repl.evaluate() calls
    // injectPatternMethods() first, then beforeEval. So beforeEval is the earliest hook that sees the fresh `.p`.
    (window as any).__oakMarkerP = function marker() {};
    o.core.Pattern.prototype.p = (window as any).__oakMarkerP;
    await e.evaluate(false);
    out.injectionSeenInBeforeEval = e.log.injection.at(-1);
    out.labelsSeen = [...e.labels];
    out.unmuted = count();

    // LIVE mute: no re-evaluation, code untouched
    const evalsBefore = o.stats.evals;
    e.setMuted('drums', true);
    out.liveMuted = count();
    out.codeUnchangedAfterLiveMute = e.getCode() === original && e.mirror.code === original;
    out.evalsDuringLiveMute = o.stats.evals - evalsBefore;

    // audible proof: count what the scheduler actually triggers (defaultOutput) while playing
    await e.play();
    await sleep(300);
    let n = e.log.triggers.length;
    await sleep(2100);
    out.triggeredWhileDrumsMuted = triggersSince(n);
    e.setMuted('drums', false); // unmute while playing, still no eval
    await sleep(300);
    n = e.log.triggers.length;
    await sleep(2100);
    out.triggeredAfterLiveUnmute = triggersSince(n);
    out.evalsDuringLiveToggleWhilePlaying = o.stats.evals - evalsBefore - 1;
    e.stop();

    // EVAL-time mute (the plan's literal wording: the label becomes silence at evaluation time)
    e.setMuteMode('eval');
    e.setMuted('drums', true);
    await e.evaluate(false);
    out.evalMuted = count();
    e.setMuted('drums', false);
    e.setMuted('bass', true);
    await e.evaluate(false);
    out.evalMutedBass = count();
    e.setMuted('drums', true); // everything muted -> silence
    await e.evaluate(false);
    out.evalMutedAll = count();
    out.codeUnchangedAtEnd = e.getCode() === original;
    out.evalLog = e.log.evals;
    return out;
  });
  results['5.mute'] = { mode: MODE, ...r, consoleErrors: cap.errors };
  expect(r.injectionSeenInBeforeEval).toBe('fresh .p injected');
  expect(r.labelsSeen).toEqual(['drums', 'bass']);
  expect(r.unmuted).toEqual({ square: 4, sawtooth: 2 });
  expect(r.liveMuted).toEqual({ sawtooth: 2 });
  expect(r.codeUnchangedAfterLiveMute).toBe(true);
  expect(r.evalsDuringLiveMute).toBe(0);
  expect((r.triggeredWhileDrumsMuted as any).square).toBeUndefined();
  expect((r.triggeredWhileDrumsMuted as any).sawtooth).toBeGreaterThan(0);
  expect((r.triggeredAfterLiveUnmute as any).square).toBeGreaterThan(0);
  expect(r.evalsDuringLiveToggleWhilePlaying).toBe(0);
  expect(r.evalMuted).toEqual({ sawtooth: 2 });
  expect(r.evalMutedBass).toEqual({ square: 4 });
  expect(r.evalMutedAll).toEqual({});
  expect(r.codeUnchangedAtEnd).toBe(true);
  expect(cap.errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
test('6. clock for visuals: scheduler.now()/cps in rAF, queryArc haps with locations, onPaint(ctx,time,haps,drawTime)', async ({ page, cap }) => {
  await open(page);
  await play(page, E1);
  await expect(state(page, E1)).toHaveText('playing');
  await page.waitForTimeout(400);
  const r = await page.evaluate(async () => {
    const o = (window as any).__oak;
    const e = o.editors.get('oak_s2_1_');
    const samples: Array<{ ms: number; now: number; cps: number; audio: number }> = [];
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const frame = () => {
        const { now, cps } = e.clock();
        samples.push({ ms: performance.now() - t0, now, cps, audio: o.audioCtx.currentTime });
        if (performance.now() - t0 < 2000) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    const { now } = e.clock();
    const haps = e.queryHaps(now, now + 1);
    const code = e.getCode();
    const first = samples[0];
    const last = samples.at(-1)!;
    let backwards = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].now < samples[i - 1].now - 1e-9) backwards++;
    return {
      frames: samples.length,
      firstSample: first,
      lastSample: last,
      cyclesPerAudioSecond: (last.now - first.now) / (last.audio - first.audio),
      cyclesPerWallSecond: (last.now - first.now) / ((last.ms - first.ms) / 1000),
      framesWhereNowWentBackwards: backwards,
      queriedAt: now,
      haps: haps.map((h: any) => ({ ...h, sourceText: h.locations.map((l: any) => code.slice(l.start, l.end)) })),
      onPaint: e.log.paint,
      onPaintCalls: e.log.paintCalls,
      drawerDrawTime: e.mirror.drawer.drawTime,
      stoppedNow: null as number | null,
    };
  });
  await stop(page, E1);
  r.stoppedNow = await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_1_').clock().now);
  results['6.clock'] = { mode: MODE, ...r, consoleErrors: cap.errors };
  expect(r.frames).toBeGreaterThan(30);
  expect(r.firstSample.cps).toBe(0.5);
  expect(r.cyclesPerAudioSecond).toBeGreaterThan(0.45);
  expect(r.cyclesPerAudioSecond).toBeLessThan(0.55);
  expect(r.haps).toHaveLength(3);
  for (const h of r.haps) {
    // locations are {start,end} offsets into the editor's code, one per mini-notation atom that contributed
    // to the hap: here the note atom AND the "triangle" atom of .s("triangle")
    expect(h.locations).toHaveLength(2);
    expect(h.sourceText).toContain(h.value.note);
    expect(h.sourceText).toContain('triangle');
    expect(h.value.s).toBe('triangle');
  }
  const p = r.onPaint as any;
  expect(p.ctxIsOurs).toBe(true);
  expect(typeof p.time).toBe('number');
  expect(p.hapCount).toBeGreaterThan(0);
  expect(p.drawTime).toEqual([-2, 2]);
  expect(r.drawerDrawTime).toEqual([-2, 2]);
  expect(r.onPaintCalls).toBeGreaterThan(30);
  expect(r.stoppedNow).toBe(0); // Cyclist.now() returns 0 while stopped
  expect(cap.errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
test('7. side effects: raw StrudelMirror vs Oak mitigations', async ({ browser }) => {
  const polluted = JSON.stringify({ theme: 'whitescreen', fontSize: 40, isAutoCompletionEnabled: true, keybindings: 'vim' });
  const run = async (path: string, presetStorage: boolean) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    if (presetStorage) await page.addInitScript((v) => localStorage.setItem('codemirror-settings', v), polluted);
    await open(page, path);
    await page.waitForTimeout(300);
    const snap = () =>
      page.evaluate(() => {
        const o = (window as any).__oak;
        return {
          ...o.sideEffects(),
          settings: o.settings(),
          extensionErrors: [...o.editors.values()].map((e: any) => e.extensionError),
          syntaxErrorIsNative: /\[native code\]/.test(Function.prototype.toString.call(window.SyntaxError)),
        };
      });
    const afterConstruct = await snap();
    await page.evaluate(() => (window as any).__oak.editors.get('oak_s2_1_').evaluate(false));
    const afterFirstEval = await snap();
    let blanked: unknown;
    if (!path.includes('raw')) {
      // optional extra mitigation: empty the injected `:root{--x:... !important}` sheet; it stays empty
      // (activateTheme early-returns while the theme name is unchanged), even after new mirrors are built.
      await page.evaluate(() => (window as any).__oak.blankThemeVars());
      await page.locator('#toggle-mount').click();
      await page.locator('#toggle-mount').click();
      await expect(page.locator('.cm-editor')).toHaveCount(3);
      const s = await snap();
      blanked = { themeVarsStyle: s.themeVarsStyle, rootVars: s.rootVars, htmlClass: s.htmlClass };
    }
    await ctx.close();
    return { afterConstruct, afterFirstEval, blanked, errors };
  };
  const raw = await run('/?raw=1', false);
  const rawPolluted = await run('/?raw=1', true);
  const mitigated = await run('/', false);
  const mitigatedPolluted = await run('/', true);
  results['7.sideEffects'] = { mode: MODE, raw, rawPolluted, mitigated, mitigatedPolluted };

  // RAW: what StrudelMirror does on its own
  expect(raw.afterConstruct.htmlClass.split(' ')).toContain('dark');
  expect(raw.afterConstruct.themeVarsStyle).toContain('--background: #222 !important');
  expect(raw.afterConstruct.testCanvas).toHaveLength(MODE === 'dev' ? 1 : 0); // dev: StrictMode dispose -> scheduler.stop -> cleanupDraw
  expect(raw.afterFirstEval.testCanvas).toHaveLength(1);
  expect(raw.afterFirstEval.testCanvas[0].parent).toBe('BODY');
  expect(raw.afterFirstEval.testCanvas[0].style).toMatch(/position:\s*fixed/);
  expect(raw.afterFirstEval.globals.added).toBeGreaterThan(900);
  expect(raw.afterFirstEval.windowFocusIsNative).toBe(false);
  // RAW + stale settings in localStorage: Strudel's own autocompletion({override}) collides with ours
  expect(rawPolluted.afterConstruct.settings.fontSize).toBe(40);
  expect(rawPolluted.afterConstruct.htmlClass.split(' ')).not.toContain('dark'); // whitescreen is a light theme

  // MITIGATED
  for (const m of [mitigated, mitigatedPolluted]) {
    expect(m.afterFirstEval.htmlClass).toBe('oak');
    expect(m.afterFirstEval.testCanvas).toEqual([{ parent: 'oak-visuals', style: null, width: 1, height: 1, visible: false }]);
    expect(m.afterFirstEval.settings.fontSize).toBe(15);
    expect(m.afterFirstEval.settings.theme).toBe('strudelTheme');
    expect(m.afterFirstEval.settings.isAutoCompletionEnabled).toBe(false);
    expect(m.afterFirstEval.extensionErrors).toEqual([null, null, null]);
    expect(Object.keys(m.afterFirstEval.localStorage)).toEqual(['codemirror-settings']);
    expect((m.blanked as any).themeVarsStyle).toBe('');
    expect((m.blanked as any).rootVars['--background']).toBe('');
    expect(m.errors).toEqual([]);
  }
});

// -------------------------------------------------------------------------------------------------
test('8. dispose during a pending evaluate; inline ref callback; why the eval mutex exists', async ({ page, cap, browser }) => {
  // (a) evaluate(autostart) then unmount before the audio unlock has finished
  await open(page);
  const a = await page.evaluate(async () => {
    const o = (window as any).__oak;
    const e = o.editors.get('oak_s2_1_');
    const p = e.evaluate(true).then(
      () => 'resolved',
      (err: unknown) => `rejected: ${err}`,
    );
    await new Promise((r) => setTimeout(r, 0));
    document.getElementById('toggle-mount')!.click(); // React unmount -> dispose()
    const outcome = await p;
    await new Promise((r) => setTimeout(r, 600));
    return {
      outcome,
      disposed: e.disposed,
      schedulerStarted: e.mirror.repl.scheduler.started,
      toggles: e.log.toggles,
      evalsRun: o.stats.evals,
      liveIntervals: o.stats.liveIntervals.size,
      liveViews: o.stats.liveViews.size,
      rms: o.rms(),
      inPageErrors: (window as any).__instr.errors,
    };
  });
  expect(a.schedulerStarted).toBe(false);
  expect(a.liveIntervals).toBe(0);
  expect(a.liveViews).toBe(0);
  expect(a.inPageErrors).toEqual([]);
  expect(cap.errors).toEqual([]);

  // (b) inline (unstable) ref callback: every parent re-render destroys and rebuilds the editor
  const p2 = await browser.newPage();
  await open(p2, '/?probe=inlineref', 4);
  const before = await p2.evaluate(() => (window as any).__oak.stats.created);
  for (let i = 0; i < 3; i++) await p2.locator('#rerender').click();
  await p2.waitForTimeout(200);
  const b = await p2.evaluate((before) => {
    const s = (window as any).__oak.stats;
    return { createdBefore: before, createdAfter3Rerenders: s.created, disposed: s.disposed, liveViews: s.liveViews.size };
  }, before);
  await p2.close();
  expect(b.createdAfter3Rerenders - b.createdBefore).toBe(3); // 1 rebuild per render (3 stable editors untouched)
  expect(b.liveViews).toBe(4);

  // (c) two un-serialized evaluations interleave and corrupt label registration; the mutex fixes it
  const p3 = await browser.newPage();
  await open(p3);
  const c = await p3.evaluate(async () => {
    const o = (window as any).__oak;
    const e1 = o.editors.get('oak_s2_1_');
    const e3 = o.editors.get('oak_s2_3_');
    const count = (e: any) => {
      const by: Record<string, number> = {};
      for (const h of e.queryHaps(0, 1)) by[h.value.s] = (by[h.value.s] ?? 0) + 1;
      return by;
    };
    await Promise.all([e3.rawEvaluate(false), e1.rawEvaluate(false)]); // bypasses the mutex
    const unserialized = { editor3: count(e3), editor1: count(e1) };
    await Promise.all([e3.evaluate(false), e1.evaluate(false)]); // through the mutex
    const serialized = { editor3: count(e3), editor1: count(e1) };
    return { unserialized, serialized };
  });
  await p3.close();
  results['8.misc'] = { mode: MODE, disposeDuringPendingEvaluate: a, inlineRefCallback: b, concurrentEvaluate: c };
  expect(c.serialized).toEqual({ editor3: { square: 4, sawtooth: 2 }, editor1: { triangle: 3 } });
  expect(c.unserialized).not.toEqual(c.serialized);
});

// -------------------------------------------------------------------------------------------------
// Chrome's DEFAULT autoplay policy (project "gesture": --autoplay-policy=document-user-activation-required).
// Playwright's page.evaluate()/waitForFunction()/locator actions run with userGesture:true, which would unlock
// audio by themselves. So until the real input event is sent these tests only LISTEN to the console
// (the page runs the no-gesture attempt itself, see ?probe=nogesture) and use raw page.mouse / page.keyboard.
const consoleLine = (page: Page, prefix: string) =>
  page.waitForEvent('console', { predicate: (m) => m.text().startsWith(prefix), timeout: 20_000 }).then((m) => m.text().slice(prefix.length).trim());

test('9. @gesture audio unlock: no gesture -> locked (and no deadlock); real click -> resume() + initAudio -> sound', async ({ page, cap }) => {
  const probeLine = consoleLine(page, 'OAK_PROBE');
  await page.goto('/?probe=nogesture');
  const probe = JSON.parse(await probeLine);
  expect(probe.ctxStateAtCreation).toContain('state=suspended');
  expect(probe.activationBefore).toBe(false);
  expect(probe.outcome).toContain('audio is locked'); // resume() stays pending without activation -> our 1.5s timeout
  expect(probe.startedAfterFailedUnlock).toBe(false);
  expect(probe.ctxStateAfter).toBe('suspended');
  expect(probe.activationAfter).toBe(false);
  expect(probe.patternHapsAfterEvaluateFalse).toBe(3); // evaluate(false) still worked: the mutex is not dead-locked

  const unlocked = consoleLine(page, 'OAK_UNLOCKED');
  await page.mouse.click(probe.playButton.x, probe.playButton.y); // a real (CDP Input) click on "play"
  expect(await unlocked).toBe('running');
  await expect(state(page, E1)).toHaveText('playing');
  const rmsAfterClick = await maxRms(page, 1500);
  const after = await page.evaluate(() => {
    const o = (window as any).__oak;
    return { ctxState: o.audioCtx.state, audioLog: o.stats.audioLog, audioContextsConstructed: (window as any).__instr.audioContexts() };
  });
  results['9.unlock.click'] = { mode: MODE, noGestureProbe: probe, rmsAfterClick, ...after, consoleErrors: cap.errors };
  expect(after.ctxState).toBe('running');
  expect(after.audioContextsConstructed).toBe(1);
  expect(rmsAfterClick).toBeGreaterThan(0.005);
  expect(cap.errors).toEqual([]);
});

test('9b. @gesture keyboard-only first play: programmatic focus + Ctrl-Enter unlocks audio', async ({ page, cap }) => {
  const probeLine = consoleLine(page, 'OAK_PROBE');
  await page.goto(`/?probe=nogesture&focus=${E2}`);
  const probe = JSON.parse(await probeLine);
  expect(probe.activationAfter).toBe(false);
  expect(probe.ctxStateAfter).toBe('suspended');

  const unlocked = consoleLine(page, 'OAK_UNLOCKED');
  await page.keyboard.press('Control+Enter'); // StrudelMirror keymap -> mirror.evaluate() -> our unlock()
  expect(await unlocked).toBe('running');
  await expect(state(page, E2)).toHaveText('playing');
  const rmsValue = await maxRms(page, 1500);
  const after = await page.evaluate(() => ({
    ctxState: (window as any).__oak.audioCtx.state,
    audioLog: (window as any).__oak.stats.audioLog,
  }));
  results['9b.unlock.keyboard'] = { mode: MODE, noGestureProbe: probe, ...after, rms: rmsValue, consoleErrors: cap.errors };
  expect(after.ctxState).toBe('running');
  expect(rmsValue).toBeGreaterThan(0.005);
  expect(cap.errors).toEqual([]);
});

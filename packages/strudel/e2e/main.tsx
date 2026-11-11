// Test page for @oak/strudel. Three editors under React StrictMode (mounted from useEffect, never an
// inline ref callback), plus `window.__oak` for the Playwright specs.
import type { LintContext, LintDiagnostic, LintResult, ToolEntry } from "@oak/content-kit";
import * as core from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHarness } from "../src/audibility/harness.ts";
import {
  createOakStrudel,
  type EditorHandle,
  type EditorOptions,
  editorId,
  type StrudelLog,
} from "../src/index.ts";

const entry = (id: string, code: string, matches: string[], kind: ToolEntry["kind"] = "tool"): ToolEntry =>
  ({
    id,
    kind,
    code,
    unlock: { at: "U01.L01", when: "complete" },
    concept: "test",
    catalog: { signature: code, meaning: `doc for ${id}`, demo: code },
    matches,
  }) as unknown as ToolEntry;

const TOOLBOX: ToolEntry[] = [
  entry("tb.note", 'note("c4")', ["note"]),
  entry("tb.voicing", ".voicing()", ["voicing"]),
  entry("tb.velocity", ".velocity(x)", ["velocity"]),
  entry("snd.piano", 's("piano")', [], "sound"),
  entry("snd.rhodes", 's("rhodes")', [], "sound"),
];

/** A stand-in for `lintOak`: `FORBIDDEN` is a locked-tool error, `LOCKEDINFO` an info finding. */
function fakeLint(code: string, ctx: LintContext): LintResult {
  const diagnostics: LintDiagnostic[] = [];
  const i = code.indexOf("FORBIDDEN");
  if (i >= 0) {
    diagnostics.push({
      id: "code.locked-tool",
      severity: ctx.profile === "studio" ? "info" : "error",
      range: { from: i, to: i + 9 },
      line: code.slice(0, i).split("\n").length,
      params: {},
      message: "not unlocked yet",
    } as LintDiagnostic);
  }
  return {
    ok: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    used: [],
    locked: [],
    lockedTools: [],
  };
}

const lintCtx: LintContext = {
  profile: "graded",
  unlocked: new Set(["tb.note", "snd.piano"] as never[]),
  allowPreview: false,
  meter: "4/4",
  key: null,
};

const oak = createOakStrudel({
  soundsRoot: "/sounds/v1",
  toolbox: TOOLBOX,
  lint: fakeLint,
  maxLiveEditors: 6,
});
const logs: StrudelLog[] = [];
oak.onLog((l) => logs.push(l));

const events = {
  toggles: {} as Record<string, boolean[]>,
  evaluated: {} as Record<string, number>,
  created: 0,
  disposed: 0,
};

function baseOptions(id: string, initialCode: string, extra: Partial<EditorOptions> = {}): EditorOptions {
  events.toggles[id] ??= [];
  return {
    id,
    initialCode,
    lessonCtx: { key: null, meter: "4/4", defaultBpm: 120, loopBars: 1 },
    lint: lintCtx,
    onToggle: (p) => events.toggles[id]?.push(p),
    onEvaluated: () => {
      events.evaluated[id] = (events.evaluated[id] ?? 0) + 1;
    },
    ...extra,
  };
}

function Editor({ id, code }: { id: string; code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    events.created++;
    const h = oak.createEditor(el, baseOptions(id, code));
    return () => {
      events.disposed++;
      h.dispose();
    };
  }, [id, code]);
  return <div className="slot" data-testid={id} ref={ref} />;
}

const CODES = [
  'note("c4 e4 g4").s("triangle")',
  'drums: note("c5*4").s("square")\nbass: note("c2 g2").s("sawtooth")',
  'note("c3 g3").s("sine")',
];

function App() {
  const [mounted, setMounted] = useState(true);
  (window as unknown as { __setMounted: (v: boolean) => void }).__setMounted = setMounted;
  return (
    <div>
      {mounted && CODES.map((code, i) => <Editor key={i} id={editorId("e2e", i + 1)} code={code} />)}
      <div id="imperative" />
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// --- helpers for the specs ----------------------------------------------------------------------------

function mountImperative(id: string, code: string, extra: Partial<EditorOptions> = {}): EditorHandle {
  const el = document.createElement("div");
  el.className = "slot";
  el.dataset.testid = id;
  document.getElementById("imperative")?.append(el);
  return oak.createEditor(el, baseOptions(id, code, extra));
}

async function maxLevel(ms: number): Promise<{ rms: number; peak: number }> {
  const end = performance.now() + ms;
  let rms = 0;
  let peak = 0;
  while (performance.now() < end) {
    const l = oak.master.level();
    rms = Math.max(rms, l.rms);
    peak = Math.max(peak, l.peak);
    await new Promise((r) => setTimeout(r, 20));
  }
  return { rms, peak };
}

/** A bare repl with no preload: the control for the skip-hap test. */
async function rawPlay(code: string): Promise<() => void> {
  await oak.ready;
  await oak.unlock();
  const repl = core.repl({
    defaultOutput: webaudio.webaudioOutput,
    getTime: () => oak.ctx.currentTime,
    transpiler,
  });
  await repl.evaluate(code, true);
  return () => repl.stop();
}

async function decodeRecording(blob: Blob): Promise<{ duration: number; rms: number; channels: number }> {
  const buf = await oak.ctx.decodeAudioData(await blob.arrayBuffer());
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    for (const x of buf.getChannelData(c)) {
      sum += x * x;
      n++;
    }
  }
  return { duration: buf.duration, rms: Math.sqrt(sum / Math.max(1, n)), channels: buf.numberOfChannels };
}

Object.assign(window, {
  __oak: {
    oak,
    logs,
    events,
    mountImperative,
    maxLevel,
    rawPlay,
    decodeRecording,
    harness: createHarness({ frameUrl: "/render.html" }),
    editorId,
    webaudio,
  },
});

// ?probe=nogesture: the PAGE tries to play without any user activation and prints the outcome.
if (new URLSearchParams(location.search).get("probe") === "nogesture") {
  const wait = setInterval(async () => {
    const e = oak.editors.get("oak_e2e_1_");
    if (!e) return;
    clearInterval(wait);
    await oak.ready;
    const t0 = performance.now();
    const o = await e.play();
    const ms = Math.round(performance.now() - t0);
    const second = (await e.evaluate({ autostart: false })).ok;
    console.log(
      `OAK_PROBE ${JSON.stringify({ state: oak.audio.get(), ok: o.ok, ids: o.diagnostics.map((d) => d.id), playing: e.playing, second, ms })}`,
    );
  }, 50);
}

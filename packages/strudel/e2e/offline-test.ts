/// <reference path="../../../types/signalsmith-stretch.d.ts" />
// Deterministic package-test seed, no server/database state. Each test gets one fresh page and editor.
import { lintOak } from "@oak/grader";
import { toolbox } from "../../../content/toolbox.ts";
import { createPcmRecorder } from "../../audio/src/pcm-recorder.ts";
import { createOakStrudel, type EditorHandle } from "../src/index.ts";
import { renderPiece } from "../src/offline/index.ts";
import type { BandSetup } from "../src/types.ts";
import { offlineChecks } from "./offline-checks.ts";
import { SOUNDS_ROOT } from "./pack-root.ts";

const ctx = new AudioContext({ sampleRate: 48000 });
const oak = createOakStrudel({
  ctx,
  soundsRoot: SOUNDS_ROOT,
  toolbox,
  lint: (code, context) => lintOak(code, context, toolbox),
});
const recorder = createPcmRecorder(ctx, oak.master.trim);
const logs: string[] = [];
oak.onLog((log) => logs.push(log.message));
let editor: EditorHandle | null = null;

async function seed(code: string, band: BandSetup | null = null) {
  await oak.ready;
  await oak.unlock();
  await recorder.prepare();
  editor?.dispose();
  const root = document.getElementById("editor");
  if (!root) throw new Error("missing editor root");
  root.replaceChildren();
  editor = oak.createEditor(root, {
    id: "oak_offline-test_",
    initialCode: code,
    lessonCtx: { key: null, meter: "4/4", defaultBpm: 120, loopBars: 1 },
    lint: {
      profile: "studio",
      unlocked: new Set(toolbox.map((tool) => tool.id)),
      allowPreview: true,
      key: null,
      meter: "4/4",
    },
    band,
  });
  return editor;
}

function envelope(left: Float32Array, right: Float32Array, rate: number, barSeconds: number, bars: number) {
  return Array.from({ length: bars }, (_, bar) => {
    const from = Math.round(bar * barSeconds * rate);
    const to = Math.min(left.length, Math.round((bar + 1) * barSeconds * rate));
    let sum = 0;
    for (let i = from; i < to; i++) sum += (left[i] ?? 0) ** 2 + (right[i] ?? 0) ** 2;
    return Math.sqrt(sum / (2 * (to - from)));
  });
}

async function capture(fromBar: number, bars: number) {
  const cps = oak.transport.cps();
  const recording = await recorder.record({
    seconds: bars / cps,
    at: oak.transport.timeOfCycle(fromBar),
    tailSec: 0,
  });
  const buffer = await ctx.decodeAudioData(await recording.blob.arrayBuffer());
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  return {
    left,
    right,
    rms: envelope(left, right, ctx.sampleRate, 1 / cps, bars),
    peak: recording.peak,
    late: recording.latePadFrames,
  };
}

export const offlineTest = {
  renderPiece,
  oak,
  ctx,
  seed,
  capture,
  envelope,
  logs,
  get editor() {
    return editor;
  },
  async dispose() {
    recorder.dispose();
    oak.dispose();
    await ctx.close();
  },
};

declare global {
  interface Window {
    __offline: typeof offlineTest;
    __offlineContexts?: OfflineAudioContext[];
  }
}
window.__offline = offlineTest;
window.__offlineChecks = offlineChecks;

// Experiment: the page imports NOTHING from pitch.ts/pitchy — only the worklet does.
// Question: does Vite dev's dependency optimizer find `pitchy` (ESM, depends on CJS `fft.js`) behind `?worker&url`?
import pitchWorkletUrl from './pitch.worklet.ts?worker&url';

(window as any).workletOnly = async () => {
  const ctx = new AudioContext();
  await ctx.resume();
  const t0 = performance.now();
  await ctx.audioWorklet.addModule(pitchWorkletUrl);
  const addModuleMs = performance.now() - t0;
  const node = new AudioWorkletNode(ctx, 'oak-pitch', { numberOfInputs: 1, numberOfOutputs: 0 });
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  osc.connect(node);
  osc.start();
  const frames: any[] = [];
  node.port.onmessage = (e) => frames.push(e.data);
  await new Promise((r) => setTimeout(r, 800));
  await ctx.close();
  const last = frames[frames.length - 1];
  return { url: pitchWorkletUrl, addModuleMs, frames: frames.length, lastHz: last?.hz, lastClarity: last?.clarity };
};

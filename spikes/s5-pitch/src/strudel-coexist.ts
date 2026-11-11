/**
 * Bonus: the pitch worklet on the SAME AudioContext as real superdough 1.3.0 output
 * (supersaw oscillator worklet + crush/coarse/distort effect worklets + reverb), i.e. "while Strudel plays".
 */
// @ts-expect-error superdough ships no types
import { getAudioContext, getSuperdoughAudioController, initAudio, registerSynthSounds, superdough } from 'superdough';
import { type PitchFrame, PitchTracker } from './pitch.ts';
import pitchWorkletUrl from './pitch.worklet.ts?worker&url';

(window as any).oakS5Strudel = async (seconds: number) => {
  const logs: string[] = [];
  const ctx: AudioContext = getAudioContext(); // superdough's singleton context
  await ctx.resume();
  await initAudio(); // loads superdough's own worklets (data: URLs) into the same AudioWorkletGlobalScope
  registerSynthSounds();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const src = ctx.createMediaStreamSource(stream);
  await ctx.audioWorklet.addModule(pitchWorkletUrl);
  const node = new AudioWorkletNode(ctx, 'oak-pitch', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: { warmUp: 8 },
  });
  src.connect(node);
  const tracker = new PitchTracker();
  const frames: (PitchFrame & { perf: number })[] = [];
  node.port.onmessage = (e) => {
    if (e.data?.type) return;
    frames.push({ ...e.data, perf: performance.now() });
    tracker.push(e.data);
  };

  // tap superdough's master output to prove it is really producing sound
  const tap = ctx.createAnalyser();
  getSuperdoughAudioController().output.destinationGain.connect(tap);
  const buf = new Float32Array(tap.fftSize);
  let peakRms = 0;
  const meter = setInterval(() => {
    tap.getFloatTimeDomainData(buf);
    let p = 0;
    for (const v of buf) p += v * v;
    peakRms = Math.max(peakRms, Math.sqrt(p / buf.length));
  }, 50);

  // a busy 16th-note arpeggio: every voice uses worklet-backed DSP
  const notes = [45, 52, 57, 60, 64, 57, 52, 48];
  const t0 = ctx.currentTime + 0.15;
  const step = 0.125;
  const count = Math.floor(seconds / step);
  let scheduled = 0;
  let failed = 0;
  for (let i = 0; i < count; i++) {
    try {
      await superdough(
        { s: 'supersaw', note: notes[i % notes.length], gain: 0.5, cutoff: 1800, resonance: 4, crush: 10, coarse: 2, distort: 0.3, room: 0.4, delay: 0.25 },
        t0 + i * step,
        step * 0.9,
      );
      scheduled++;
    } catch (e) {
      failed++;
      logs.push(String(e));
    }
  }
  await new Promise((r) => setTimeout(r, seconds * 1000 + 300));
  clearInterval(meter);
  for (const t of stream.getTracks()) t.stop();
  return {
    sampleRate: ctx.sampleRate,
    state: ctx.state,
    baseLatency: ctx.baseLatency,
    scheduled,
    failed,
    superdoughPeakRms: peakRms,
    frames,
    segments: tracker.segments(),
    logs,
  };
};

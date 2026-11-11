/**
 * S5 spike page. Exposes window.oakS5 for Playwright. Query params:
 *   loader = worker-url (default) | new-url | blob
 *   outputs = 0 (default) | 1      -> numberOfOutputs; 1 = fallback "pulled through GainNode(0) -> destination"
 *   sr = <number>                  -> force AudioContext sampleRate (default: device rate)
 *   warm = <n>                     -> processorOptions.warmUp (detector calls in the processor constructor)
 *   osc = 1 (default) | 0          -> play an OscillatorNode (330 Hz saw) to the destination on the same context
 */
import pitchWorkletUrl from './pitch.worklet.ts?worker&url';
import { type NoteSegment, type PitchFrame, PitchTracker } from './pitch.ts';

const q = new URLSearchParams(location.search);
const log = (m: string) => {
  const el = document.getElementById('log');
  if (el) el.textContent += `${m}\n`;
  console.log(m);
};

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  video: false,
};

async function resolveWorkletUrl(loader: string): Promise<{ url: string; revoke?: () => void }> {
  if (loader === 'worker-url') return { url: pitchWorkletUrl };
  if (loader === 'new-url') {
    // research says this is broken in build (inlined as data:video/mp2t, vitejs/vite#11823) — kept to verify
    return { url: new URL('./pitch.worklet.ts', import.meta.url).href };
  }
  if (loader === 'blob') {
    // fallback: self-contained IIFE prebuilt by scripts/build-worklet.ts, inlined as a string, loaded via Blob URL
    const { default: code } = await import('./generated/pitch.worklet.iife.js?raw');
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  throw new Error(`unknown loader ${loader}`);
}

interface Session {
  ctx: AudioContext;
  node: AudioWorkletNode;
  stream: MediaStream;
  frames: (PitchFrame & { recv: number; perf: number })[];
  tracker: PitchTracker;
  info: Record<string, unknown>;
  startedAt: number;
}
let session: Session | null = null;

async function start() {
  const loader = q.get('loader') ?? 'worker-url';
  const outputs = Number(q.get('outputs') ?? 0);
  const sr = q.get('sr') ? Number(q.get('sr')) : undefined;
  const withOsc = q.get('osc') !== '0';

  const ctx = new AudioContext(sr ? { sampleRate: sr, latencyHint: 'interactive' } : { latencyHint: 'interactive' });
  await ctx.resume();

  // 1. output: something audible running on the SAME context (stands in for superdough)
  let osc: OscillatorNode | null = null;
  const meter = ctx.createAnalyser();
  if (withOsc) {
    osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 329.63; // E4 — deliberately not the mic pitch
    const g = ctx.createGain();
    g.gain.value = 0.1;
    osc.connect(g).connect(ctx.destination);
    g.connect(meter);
    osc.start();
  }

  // 2. mic
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const track = stream.getAudioTracks()[0] as MediaStreamTrack;
  const src = ctx.createMediaStreamSource(stream); // never connected to the destination

  // 3. worklet
  const { url } = await resolveWorkletUrl(loader);
  const tAdd = performance.now();
  await ctx.audioWorklet.addModule(url);
  const addModuleMs = performance.now() - tAdd;
  const node = new AudioWorkletNode(ctx, 'oak-pitch', {
    numberOfInputs: 1,
    numberOfOutputs: outputs,
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: { warmUp: Number(q.get('warm') ?? 0) },
  });
  node.onprocessorerror = (e) => log(`processorerror: ${String((e as ErrorEvent).message ?? e)}`);
  src.connect(node);
  if (outputs > 0) {
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
  }

  const tracker = new PitchTracker();
  const frames: Session['frames'] = [];
  node.port.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d?.type === 'stats' || d?.type === 'bench') return;
    frames.push({ ...(d as PitchFrame), recv: ctx.currentTime, perf: performance.now() });
    tracker.push(d as PitchFrame);
  };

  session = {
    ctx,
    node,
    stream,
    frames,
    tracker,
    startedAt: ctx.currentTime,
    info: {
      loader,
      workletUrl: url.length > 200 ? `${url.slice(0, 200)}…(${url.length} chars)` : url,
      addModuleMs,
      numberOfOutputs: outputs,
      sampleRate: ctx.sampleRate,
      requestedSampleRate: sr ?? null,
      baseLatency: ctx.baseLatency,
      outputLatency: ctx.outputLatency,
      state: ctx.state,
      oscillator: withOsc,
      trackLabel: track.label,
      trackSettings: track.getSettings(),
      constraints: MIC_CONSTRAINTS,
      userAgent: navigator.userAgent,
    },
  };
  (session as any).meter = meter;
  log(`started: ${JSON.stringify(session.info)}`);
  return session.info;
}

function ask(kind: 'stats' | 'bench'): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const s = session as Session;
    const onmsg = (e: MessageEvent) => {
      if (e.data?.type === kind) {
        s.node.port.removeEventListener('message', onmsg);
        resolve(e.data);
      }
    };
    s.node.port.addEventListener('message', onmsg); // port already started by the onmessage setter
    s.node.port.postMessage(kind);
  });
}

async function snapshot() {
  const s = session as Session;
  const meter = (s as any).meter as AnalyserNode;
  const buf = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(buf);
  let p = 0;
  for (const v of buf) p += v * v;
  const frames = [...s.frames];
  const segments = s.tracker.segments() as NoteSegment[];
  const stats = await ask('stats');
  const workletBench = await ask('bench'); // after the capture: this stalls the render thread
  return {
    info: { ...s.info, outputLatencyNow: s.ctx.outputLatency, stateNow: s.ctx.state },
    now: s.ctx.currentTime,
    startedAt: s.startedAt,
    frames,
    segments,
    outputRms: Math.sqrt(p / buf.length),
    stats,
    workletBench,
  };
}

async function stop() {
  const s = session;
  if (!s) return;
  for (const t of s.stream.getTracks()) t.stop();
  s.node.port.close();
  await s.ctx.close();
  session = null;
}

/** main-thread cost of findPitch in this browser (V8), for the CPU budget */
async function bench() {
  const { detect } = await import('./pitch.ts');
  const buf = new Float32Array(2048);
  for (let i = 0; i < buf.length; i++) buf[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / 48000) + 0.2 * Math.sin((2 * Math.PI * 440 * i) / 48000);
  // cold: first calls in this realm (unoptimised code + FFT table setup) — the worklet realm pays the same once
  const cold: number[] = [];
  for (let i = 0; i < 5; i++) {
    const c0 = performance.now();
    detect(buf, 48000);
    cold.push(performance.now() - c0);
  }
  for (let i = 0; i < 300; i++) detect(buf, 48000);
  const N = 3000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) detect(buf, 48000);
  return { usPerCall: ((performance.now() - t0) / N) * 1000, coldMs: cold };
}

/**
 * Production lifecycle: load + create (+ warm) the node once at audio-unlock time with NO mic,
 * then open/close the mic per sing step by connecting/disconnecting a fresh MediaStreamSource.
 */
async function lifecycle() {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.resume();
  const osc = ctx.createOscillator();
  osc.frequency.value = 329.63;
  const g = ctx.createGain();
  g.gain.value = 0.1;
  osc.connect(g).connect(ctx.destination);
  osc.start();
  await ctx.audioWorklet.addModule(pitchWorkletUrl);
  const node = new AudioWorkletNode(ctx, 'oak-pitch', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: { warmUp: 8 },
  });
  const frames: PitchFrame[] = [];
  node.port.onmessage = (e) => {
    if (!e.data?.type) frames.push(e.data as PitchFrame);
  };
  const phases: Record<string, unknown>[] = [];
  const mark = (name: string, extra: Record<string, unknown> = {}) => phases.push({ name, t: ctx.currentTime, frames: frames.length, ...extra });

  await wait(400);
  mark('idle-before-mic');
  const sessions: { openedAt: number; firstFrameAt: number | null; medianHz: number; n: number; trackStateAfterStop: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    const src = ctx.createMediaStreamSource(stream);
    const from = frames.length;
    const openedAt = ctx.currentTime;
    src.connect(node);
    await wait(1000);
    src.disconnect();
    const track = stream.getAudioTracks()[0] as MediaStreamTrack;
    track.stop();
    const got = frames.slice(from);
    const hz = got.filter((f) => f.clarity >= 0.9).map((f) => f.hz).sort((a, b) => a - b);
    sessions.push({ openedAt, firstFrameAt: got[0]?.time ?? null, medianHz: hz[hz.length >> 1] ?? 0, n: got.length, trackStateAfterStop: track.readyState });
    mark(`mic-session-${i + 1}-closed`);
    await wait(400);
    mark(`idle-after-session-${i + 1}`);
  }
  const stats = await new Promise<Record<string, unknown>>((resolve) => {
    const on = (e: MessageEvent) => {
      if (e.data?.type === 'stats') {
        node.port.removeEventListener('message', on);
        resolve(e.data);
      }
    };
    node.port.addEventListener('message', on);
    node.port.postMessage('stats');
  });
  await ctx.close();
  return { sampleRate: ctx.sampleRate, phases, sessions, stats };
}

(window as any).oakS5 = { start, snapshot, stop, bench, lifecycle, pitchWorkletUrl };
document.getElementById('start')?.addEventListener('click', () => void start());
log(`ready; worklet url = ${pitchWorkletUrl.slice(0, 200)}`);

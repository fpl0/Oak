# S5 — pitchy in an AudioWorklet + Playwright fake microphone

**Status: GREEN.** Every goal was proven by execution; the planned design (`?worker&url`, `numberOfOutputs: 0`,
headless-shell fake mic) works as written in dev and in a production build. Three things in the
research/architecture are wrong or incomplete and must be carried into production (section 4).

Environment: macOS (Darwin 27.2), Node 26.13.0, Bun 1.4.4, Vite 8.3.7, @playwright/test 1.65.0,
pitchy 4.1.0, superdough 1.3.0. Browsers: `chromium_headless_shell` (HeadlessChrome/158.0.8127.18) and full
Chromium in new-headless mode (`channel: 'chromium'`, HeadlessChrome/158.0.0.0). Dev-server port 5185.

## 1. How to run

```sh
# from the repo root
bun spikes/s5-pitch/scripts/make-fixtures.ts          # WAV fixtures -> fixtures/
bun test spikes/s5-pitch/src                          # 34 pure tests (detector, analyzer, tracker, segmentation)
bun spikes/s5-pitch/scripts/noise-probe.ts            # noise + SNR behaviour of pitchy
node node_modules/typescript/bin/tsc -p spikes/s5-pitch/tsconfig.json --noEmit   # TS 7 typecheck: clean

# from spikes/s5-pitch (Playwright starts/stops Vite itself on :5185)
S5_MODE=dev     bunx playwright test -c playwright.config.ts    # Vite dev server
S5_MODE=preview bunx playwright test -c playwright.config.ts    # vite build && vite preview
node e2e/cold-worklet-only.mjs                                  # cold dep-cache experiment
bun scripts/summarize-results.ts                                # table of results/*.json
bun scripts/build-worklet.ts                                    # fallback: self-contained IIFE worklet via Bun.build
```

Final runs (logs in `results/run-dev.log`, `results/run-preview.log`, per-test JSON in `results/*.json`,
table in `results/summary.txt`):

```
== dev      28 passed (2.4m)   EXIT 0      (14 tests x 2 browsers)
== preview  28 passed (2.3m)   EXIT 0
bun test:   34 pass, 0 fail, 139 expect() calls
tsc:        exit 0
```

## 2. What was proven

### 2.1 Pure module (`src/pitch.ts`, `bun test`)

`createDetector()/detect(buf, sampleRate) -> {hz, clarity}`, `PitchFrameAnalyzer` (ring buffer + 512 hop — the
exact code the worklet runs), `PitchTracker` (clarity >= 0.9, RMS gate, median-of-5, segmentation:
>70 cents for >=3 frames, 3 unvoiced frames close a note, min note 120 ms), `centsVsTarget(hz, target, {foldOctaves})`.

Cents error, 2048 window / 512 hop, fed in 128-sample quanta, -40 dBFS white noise added
(`results/bun-test.log`):

| wave | Hz | 44.1 kHz median / max abs cents | 48 kHz median / max abs cents | min clarity | voiced |
|---|---|---|---|---|---|
| sine | 110 | -0.061 / 0.911 | 0.099 / 0.969 | 0.9991 | 100% |
| sine | 220 | 0.000 / 0.606 | 0.001 / 0.602 | 0.9991 | 100% |
| sine | 440 | 0.019 / 0.273 | -0.034 / 0.224 | 0.9992 | 100% |
| sine | 660 | -0.001 / 0.183 | 0.001 / 0.231 | 0.9991 | 100% |
| saw (band-limited) | 110 | -0.018 / 0.183 | 0.019 / 0.237 | 0.9949 | 100% |
| saw | 220 | 0.084 / 0.189 | 0.107 / 0.234 | 0.9944 | 100% |
| saw | 440 | 0.804 / 0.891 | 0.338 / 0.401 | 0.9937 | 100% |
| saw | 660 | -1.022 / 1.225 | -1.193 / 1.349 | 0.9920 | 100% |
| voice + vibrato (+-20 c @ 5.5 Hz) | 110-660 | mean 0.02..0.08, tracks true pitch within 2.5 c | mean 0.05..0.08, within 2.1 c | 0.9945 | 100% |

Vibrato is followed, not smeared: detected range is -18.9..+19.4 cents for a true +-20 cents, and every frame is
within 2.5 cents of the true instantaneous pitch **at the window centre** (`time - 1024/sampleRate`).

SNR sweep (voice timbre, 48 kHz; `results/noise-probe.log`): 100% voiced with median error <= 2.2 cents and
zero gross errors down to **10 dB SNR**; at 5 dB SNR nothing is voiced (clarity < 0.9) — it fails closed, never wrong.

Cost under Bun/JSC: `findPitch: 71.7 us/call; hop = 10.67 ms => 0.67% of one core`.

### 2.2 Worklet loading under Vite 8 — `?worker&url` works in dev AND build

```ts
import pitchWorkletUrl from './pitch.worklet.ts?worker&url';
await ctx.audioWorklet.addModule(pitchWorkletUrl);
```

* **Dev**: URL is `/src/pitch.worklet.ts?worker_file&type=module`. The served module does start with the
  flagged prelude — observed first line:
  `import "/@fs/Users/fpl0/Code/Oak/node_modules/.bun/vite@8.3.7+47d058d098868c7b/node_modules/vite/dist/client/env.mjs"`
  (an `/@fs/` path because of Bun's isolated linker, not `/@vite/env`). **It is harmless in
  AudioWorkletGlobalScope**: `env.mjs` only resolves `globalThis` and iterates an empty `defines = {}` object.
  The worklet's own imports (`/src/pitch.ts` -> `/.vite-cache/deps/pitchy.js`, which bundles CJS `fft.js`)
  load fine as static ESM imports inside the worklet. `addModule` takes 4-6 ms warm.
* **Build**: emitted as a self-contained IIFE asset, `dist/assets/pitch.worklet-CiabVPbq.js` (11.33 kB, pitchy + fft.js
  inlined, no imports). `addModule` 3-12 ms.
* **Cold dep cache, pitchy imported ONLY by the worklet** (`e2e/cold-worklet-only.mjs`, scanner restricted to a
  page that does not import pitchy): works on the first attempt, no 504 "Outdated Optimize Dep", no forced
  reload. Vite log: `[vite] (client) dependency optimized: pitchy`; first `addModule` 142 ms, second 4.3 ms.
  `optimizeDeps.include: ['pitchy']` is therefore optional (it only moves the 140 ms to server start).
* `new URL('./pitch.worklet.ts', import.meta.url)`: works in dev, **broken in build** exactly as the research
  said — `AbortError: Failed to load worklet module script: data:video/mp2t;base64,...` (the raw TS inlined
  as a data URL). Never use it.
* **Fallback proven in dev and build** (not needed, kept for an all-Bun future): `scripts/build-worklet.ts`
  bundles the worklet with `Bun.build({ target: 'browser', format: 'iife', minify: true })` into one 11.9 kB
  file; the page loads it with `import code from './generated/pitch.worklet.iife.js?raw'` +
  `URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))` (`loader=blob` variant, all 4 runs green).

Inside AudioWorkletGlobalScope (reported by the processor): `self: undefined`, `performance: undefined`,
`process: undefined`. So: no `performance.now()` in the worklet (only `Date.now()`, 1 ms resolution), and any
dependency that touches `self`/`process.env` at module scope would throw there. pitchy and fft.js touch neither.

### 2.3 Chromium fake microphone — works on the installed headless shell

```ts
// e2e/helpers.ts — the path MUST be absolute
[
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream',      // auto-grants the permission prompt
  '--use-fake-device-for-media-stream',  // fake capture devices
  `--use-file-for-fake-audio-capture=${abs}`,          // loops forever
  // `--use-file-for-fake-audio-capture=${abs}%noloop` // plays once, then silence
]
```

Both `chromium_headless_shell` (Playwright default `headless: true`) and full Chromium new-headless
(`channel: 'chromium'`) pass every test; no headed mode needed. Per-file fixtures via
`test.use({ launchOptions: { args: fakeMicArgs('x.wav') } })` work (one browser per file).

* Fixture format that works: **16-bit PCM mono WAV** at 48 kHz *or* 44.1 kHz (`scripts/make-fixtures.ts`,
  no dependencies). The 44.1 kHz file reads 440.0001 Hz — Chromium resamples, it does not pitch-shift.
* The file starts playing when the capture stream opens (first note appears ~0.41 s into the context, the
  fixture has 0.4 s of leading silence), so `%noloop` gives a deterministic "sing once" take.
* `track.getSettings()` of the fake device:
  `{"autoGainControl":false,"channelCount":2,"echoCancellation":false,"noiseSuppression":false,"sampleRate":44100,"sampleSize":16,"latency":0.01,"voiceIsolation":false}`,
  label `"Fake Default Audio Input"`. Note `channelCount: 2` and `sampleRate: 44100` regardless of the WAV and of
  the `channelCount: 1` constraint — the fake device is always 44.1 kHz stereo; the graph resamples to the
  context rate (48 kHz here) with < 0.002 cents error.

### 2.4 440 Hz within +-5 cents while output plays on the same context

Primary configuration (`loader=worker-url`, `numberOfOutputs: 0`, device sample rate), a 329.63 Hz sawtooth
`OscillatorNode -> Gain(0.1) -> destination` playing on the same `AudioContext`; median over the last 1 s:

```
[dev/headless-shell]            sr=48000 rate=93.75/s (expected 93.75) median=440.0001 Hz (0 c, range -0.001..0.002) voiced=100% clarity=1 rms=-9.03 dB oscRms=0.0487 gap(med/p95/max)=10.7/10.8/10.8 ms lag(med/p95/max)=0.13/0.23/4.23 ms findPitch(worklet)=118.5 us => 1.11% of render thread; maxBlock=4 ms @block 16 url=/src/pitch.worklet.ts?worker_file&type=module problems=[]
[dev/chromium-new-headless]     sr=48000 rate=93.75/s median=440.0001 Hz (0 c, range -0.001..0.002) voiced=100% ... findPitch(worklet)=116 us => 1.09% ... problems=[]
[preview/headless-shell]        sr=48000 rate=93.75/s median=440.0001 Hz (0 c, range -0.001..0.002) voiced=100% ... findPitch(worklet)=116 us => 1.09% ... url=/assets/pitch.worklet-CiabVPbq.js problems=[]
[preview/chromium-new-headless] sr=48000 rate=93.75/s median=440.0001 Hz (0 c, range -0.001..0.002) voiced=100% ... findPitch(worklet)=116 us => 1.09% ... url=/assets/pitch.worklet-CiabVPbq.js problems=[]
```

* **Context sampleRate: 48000** (device default on this machine). **Worklet message rate: 93.75 /s**
  (= 48000/512, exact). Forced `new AudioContext({ sampleRate: 44100 })` also works with the mic
  (no "different sample rate" error in Chromium): 86.133 msg/s, 440.0003 Hz (0.001 c) — but delivery gets bursty
  (see 2.6), so do not force a rate.
* Median error **0.000 cents** (range -0.001..+0.002) — the +-5 cent budget is met with ~3 orders of magnitude to spare.
* `problems=[]`: no page errors, no console errors/warnings, no failed requests in any passing variant.
* Oscillator really is rendering (`oscRms=0.0487` measured on an AnalyserNode); `osc=0` variant gives identical pitch results.

**Bonus — real Strudel output** (`strudel.html`, `e2e/strudel-coexist.e2e.ts`): the pitch worklet on
**superdough 1.3.0's own singleton context** (`getAudioContext()` + `initAudio()` + `registerSynthSounds()`),
with 24 `supersaw` voices using worklet-backed DSP (`crush`, `coarse`, `distort`) plus `room` and `delay`:

```
[preview/headless-shell/strudel-coexist] {"sr":48000,"voices":24,"peakRms":0.0979,"rate":93.75,"cents":0.0003,"range":[-0.0012,0.0017],"gap":{"median":10.7,"p95":10.8,"max":11},"segs":["A4+0.00c"],"problems":[]}
```

Green in dev + build on both browsers: superdough's `data:` URL worklets and our `?worker&url` worklet share one
AudioWorkletGlobalScope without conflict, message cadence is unchanged, no sample-rate errors.

### 2.5 Three-note segmentation (A3 - C#4 - E4, voice-like harmonics, 5.5 Hz +-15 cent vibrato, -50 dB noise)

```
[preview/headless-shell/sung-once]   sr=48000 A3+2.1c[0.411-1.008] C#4+1.3c[1.104-1.712] E4+1.5c[1.808-2.405] | IOI=0.693,0.704 dur=0.597,0.608,0.597
[preview/headless-shell/sung-legato] A3+0.9c[0.432-1.093] C#4+1.0c[1.147-1.701] E4+1.6c[1.840-2.416]
[preview/headless-shell/sung-loop]   A3+2.1c[0.427-1.024] C#4+1.3c[1.120-1.728] E4+1.5c[1.824-2.421] A3+2.3c[3.435-4.021] C#4+1.2c[4.128-4.725] E4+1.6c[4.832-5.429] A3+1.3c[6.432-7.029] C#4+1.1c[7.136-7.509]
```

* `%noloop` take: exactly `['A3','C#4','E4']`, each within 2.3 cents, inter-onset 0.693/0.704 s (fixture: 0.700),
  durations 0.597-0.608 s (fixture: 0.600). Same result in dev/preview x both browsers.
* Legato variant (no silence between notes): still three notes, split on the pitch jump alone.
* Looping variant: the melody repeats every 3.0 s as expected.
* Timing semantics: `frame.time` is the context time of the **last** sample of the window, so a note is first
  reported ~1 window (43 ms) after its acoustic onset, plus up to one hop (10.7 ms). Grade onsets against
  `time - windowSize/2/sampleRate` (window centre) and keep `latencySec` calibration on top.

### 2.6 CPU / latency

| quantity | value | how measured |
|---|---|---|
| `findPitch` warm, inside the worklet | **115-120 us/call** (final runs; up to 123 in earlier runs) | 2000 calls timed with `Date.now()` in AudioWorkletGlobalScope |
| render-thread load | **1.0-1.1 %** | 116 us per 10.67 ms hop (same figure on the main thread: 116-125 us) |
| share of one render quantum (2.67 ms) | ~4.4 % in 1 of every 4 quanta | derived |
| **first `findPitch` in a fresh realm** | **3.8-5.8 ms** typical, one 14.3 ms outlier (then 0.3-0.9 ms for the next few calls) | main-thread cold bench; in the worklet the single slow block is `maxBlock = 3-5 ms @ block 16` (6 ms once in an earlier run) = the first hop |
| same with `processorOptions.warmUp = 8` | constructor 6-12 ms once; **max process() block <= 1 ms**, first-frame delivery lag 0.5 ms instead of ~4 ms | `warm8` variant |
| message cadence on the main thread (48 kHz) | gap median 10.7, p95 10.8, max 10.8-11.6 ms | `performance.now()` at `port.onmessage` |
| message cadence with forced 44.1 kHz context on a 48 kHz device | gap p95 16 ms, max 21.5 ms; lag median ~5 ms, max ~10.5 ms | same |
| algorithmic latency | window 2048 = 42.7 ms (estimate centred 21.3 ms back) + hop <= 10.7 ms | by construction; first frame arrives exactly 2048 samples after connect |
| `ctx.baseLatency` / `ctx.outputLatency` (headless, fake sink) | 5.33 ms / 28-32 ms | not representative of real hardware |
| `addModule` | 2-22 ms typical (one 98 ms outlier: blob loader, dev) | `performance.now()` around the call |

The per-block `Date.now()` sum inside `process()` is not trustworthy (1 ms clock, phase-locks with the render
callback: the same build reads anywhere between 0.1 % and 3.3 %); the 2000-call in-worklet bench is the number to use.

### 2.7 Constraints and node options that work

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  video: false,
});
const src = ctx.createMediaStreamSource(stream);          // SAME context as the output; never connected to destination
await ctx.audioWorklet.addModule(pitchWorkletUrl);        // '?worker&url'
const node = new AudioWorkletNode(ctx, 'oak-pitch', {
  numberOfInputs: 1,
  numberOfOutputs: 0,                 // VERIFIED: process() runs at full rate with no output and no connection to destination
  channelCount: 1,
  channelCountMode: 'explicit',       // the device may ignore channelCount:1 (fake mic is stereo) -> let the graph downmix
  channelInterpretation: 'speakers',
  processorOptions: { warmUp: 8 },    // see 4.3
});
src.connect(node);
node.port.onmessage = (e) => tracker.push(e.data as PitchFrame);
```

`numberOfOutputs: 0` works; the documented fallback (`numberOfOutputs: 1 -> GainNode(0) -> destination`,
`outputs=1` variant) also works and gives identical numbers, but is not needed.

**Lifecycle proven** (`e2e/lifecycle.e2e.ts`): node created once with no mic, then the mic opened and closed twice:

```
[preview/headless-shell/lifecycle] phases={"idle-before-mic":0,"mic-session-1-closed":91,"idle-after-session-1":91,"mic-session-2-closed":182,"idle-after-session-2":182}
  sessions=[{"openedAt":0.3733,"firstFrameAt":0.416,"medianHz":440.0001,"n":91,"trackStateAfterStop":"ended"},{"openedAt":1.8027,"firstFrameAt":1.8453,"medianHz":440.0001,"n":91,...}]
  stats={"blocks":1200,"emptyBlocks":448,"warmUpMs":10,"maxBlockMs":1}
```

While nothing is connected `process()` still runs with `inputs[0].length === 0` (448 empty blocks): the processor
then does no analysis, posts nothing and resets its ring, so after reconnect the first frame arrives exactly one
fresh window (42.67 ms) later and never contains audio from the previous take.

## 3. Code the production adapter should copy

* `src/pitch.ts` -> `@oak/pitch` (pure; `createDetector`, `PitchFrameAnalyzer`, `PitchTracker`, `centsVsTarget`,
  `hzToMidi`, `midiToNoteName`). The architecture's `PitchFrame.t` is called `time` here per the task text — rename freely.
* `src/pitch.worklet.ts` -> `packages/audio/src/worklets/pitch.worklet.ts` (delete the block marked
  "spike-only instrumentation" and the `stats`/`bench` messages). Core of it:

```ts
import { type DetectorOptions, PitchFrameAnalyzer } from './pitch.ts';
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; constructor(options?: unknown); }
declare function registerProcessor(name: string, ctor: new (options?: any) => AudioWorkletProcessor): void;

class OakPitchProcessor extends AudioWorkletProcessor {
  private readonly analyzer: PitchFrameAnalyzer;
  private readonly post = (f: unknown) => this.port.postMessage(f);
  private active = false;
  constructor(options?: { processorOptions?: DetectorOptions & { hop?: number; warmUp?: number } }) {
    super();
    const o = options?.processorOptions ?? {};
    this.analyzer = new PitchFrameAnalyzer(sampleRate, o);
    if (o.warmUp) this.analyzer.warmUp(o.warmUp);
  }
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) {                                   // nothing connected: idle, drop stale audio
      if (this.active) { this.active = false; this.analyzer.reset(); }
      return true;
    }
    this.active = true;
    this.analyzer.push(ch, currentFrame, this.post);   // emits {time, hz, clarity, rms} every 512 samples
    return true;
  }
}
registerProcessor('oak-pitch', OakPitchProcessor);
```

* Detector construction (both gotchas 4.1 and 4.2 are encoded here):

```ts
const d = PitchDetector.forFloat32Array(windowSize);
d.minVolumeAbsolute = 10 ** (-45 / 20);                 // NOT d.minVolumeDecibels = -45
const [hz, clarity] = d.findPitch(buf, sampleRate);
if (hz < (2 * sampleRate) / windowSize) return { hz: 0, clarity: 0 };   // need >= 2 periods in the window
```

* `e2e/helpers.ts#fakeMicArgs`, `scripts/make-fixtures.ts` + `src/synth.ts` (deterministic WAV synthesis:
  sine / band-limited saw / voice-like harmonics, vibrato, seeded noise, 16-bit WAV encode/decode).
* `vite.config.ts`: `cacheDir` inside the package; Vite 8 uses `build.rolldownOptions.input` for multi-page builds.
* TS: `/// <reference types="vite/client" />` types `?worker&url` and `?raw`; AudioWorklet globals must be
  declared by hand (not in `lib.dom`). `tsc` (TS 7) passes with the base config's
  `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/`verbatimModuleSyntax`.

## 4. Surprises / gotchas vs the research and architecture

1. **`detector.minVolumeDecibels = -45` does not gate at -45 dBFS.** pitchy computes
   `10 ** (db / 10)` (power convention) and compares it with an RMS *amplitude*, so -45 means
   RMS < 3.2e-5 = **-90 dBFS** — effectively no gate. Observed: a -60 dBFS tone was detected with clarity 1.
   Architecture section 2.6 specifies `minVolumeDecibels = -45`; use `minVolumeAbsolute = 10 ** (dB / 20)` instead.
2. **Clarity alone does not reject noise in pitchy 4.1.** On pure white noise ~4 % of frames (pink: ~0.7 %)
   come back with clarity >= 0.9 — always at lag ~= windowSize-2, i.e. 21.6 Hz @ 44.1 kHz / 23.5 Hz @ 48 kHz
   (the NSDF out there is built from one or two sample products). `results/noise-probe.log`:
   `minPeriods=0 white -20dB @48000: frames=934 clarity>=0.9: 39 (4.2%) hz[min/median/max]=23.5/23.5/23.5`
   vs `minPeriods=2 ... clarity>=0.9: 0 (0.0%)`. Fix: reject `hz < 2*sampleRate/windowSize` (46.9 Hz @ 48 kHz)
   in the detector, and keep a `minHz` (60) / `maxHz` (1600) gate in the tracker. Side effect: 2048 @ 48 kHz
   cannot report below ~47 Hz (irrelevant for voice; lowest bass voice ~80 Hz).
3. **The first `findPitch` costs ~4-6 ms — more than one 2.67 ms render quantum** (cold V8 code), on the render
   thread shared with superdough. Without mitigation that is one potential dropout at the first hop of the first
   sing step. Mitigation proven: `warmUp: 8` in the processor constructor (6-12 ms, once) brings the worst
   `process()` block to <= 1 ms. Because the constructor also runs on the render thread, **create the node once
   at audio unlock / calibration (nothing audible yet) and keep it for the session**; open and close only the
   `MediaStream` + `MediaStreamAudioSourceNode` per sing step (lifecycle test above). Do not create the node lazily
   at the start of a sing step while a cadence is playing.
4. The dev prelude is `import "/@fs/<abs>/node_modules/.bun/vite@8.3.7+.../vite/dist/client/env.mjs"`, not
   `/@vite/env` — harmless, but it means the worklet needs Vite's `server.fs.allow` to cover the repo root
   (true by default: the workspace root is auto-detected). Do not set a restrictive `server.fs.strict` allow-list
   that excludes `node_modules/.bun`.
5. AudioWorkletGlobalScope has no `self`, no `performance`, no `process`. Only `Date.now()` for timing.
6. Vite's default `cacheDir` resolves to `<repo>/node_modules/.vite` for a folder without its own
   `package.json`; parallel dev servers would share it. Set `cacheDir` per app.
7. `bun test` discovers `*.spec.ts` — a Playwright spec anywhere under the repo is executed by the root
   `bun test` and fails ("Playwright Test did not expect test.use() to be called here"). Verified. Name
   Playwright files `*.e2e.ts` with `testMatch: /.*\.e2e\.ts$/` (done here), or keep them outside bun's roots.
8. Full Chromium (new headless) requests `/favicon.ico`; with a strict "no console errors" assertion that 404
   fails every test (and Playwright does not surface the request). The headless shell does not request it.
   Add `<link rel="icon" href="data:,">` or a real favicon.
9. The fake mic ignores `channelCount: 1` (reports stereo, 44.1 kHz). Real devices may too — hence
   `channelCount: 1, channelCountMode: 'explicit'` on the node rather than trusting the constraint.
10. Forcing `AudioContext({ sampleRate })` to a rate other than the device's works but makes message delivery
    bursty (p95 gap 16 ms, max 21.5 ms vs 10.8 ms). Leave superdough's default context rate alone; all maths
    takes `sampleRate` from the worklet global, so 44.1 and 48 kHz devices both work (tested both).
11. pitchy's `findPitch` allocates per call (`getKeyMaximumIndices` returns a fresh array, `Math.max(...map())`);
    at 94 calls/s this is a few kB/s of garbage on the render thread. No GC stall was visible (max gap 10.8 ms
    over ~3.5 s runs) but the runs are short — see open items.
12. Not a problem, contrary to my expectation: a dependency imported only by the worklet is still discovered and
    pre-bundled by Vite 8.3.7 dev on a cold cache with no reload.

## 5. Fallbacks chosen

None needed — the primary path is green everywhere. Proven spare paths, in order of preference:

1. `numberOfOutputs: 1 -> GainNode(gain 0) -> destination` if some browser stops pulling output-less worklets.
2. Bun-prebuilt IIFE + `?raw` + Blob URL (`scripts/build-worklet.ts`, `loader=blob`) if `?worker&url` ever
   regresses or the frontend leaves Vite. Needs CSP `worker-src`/`script-src blob:`.
3. Full Chromium (`channel: 'chromium'`) if the headless shell ever loses the fake-device flags.

## 6. Open items

* **Real voices.** All inputs are synthetic (harmonic stacks with vibrato and noise). Breathiness, vocal fry,
  consonants, scoops and room reverb are untested; the W3 gate (>= 95 % of voiced frames within +-25 cents,
  octave errors < 2 %) needs recorded fixtures. The fake-mic harness accepts any 16-bit PCM WAV.
* **Audible glitch check on real hardware.** Headless uses a fake sink, so "no dropout while Strudel plays"
  is inferred from timing (1.1 % render load, <= 1 ms worst block after warm-up), not heard. Worth one manual
  listen with a dense pattern + mic open, and a longer soak (minutes) to see whether pitchy's per-call
  allocations ever cause a GC pause on the render thread. If they do: fork `findPitch` to be allocation-free
  (~30 lines) or move detection to a Worker fed by a SharedArrayBuffer ring.
* **Octave-continuity prior** from the architecture is not implemented; median-of-5 alone rejected single-frame
  octave errors in tests, and no octave error occurred on any fixture. Revisit with real voices.
* `gradeSungNote` (pass rule, held ratio, onset error) was out of scope; `NoteSegment` + `centsVsTarget`
  are the inputs it needs.
* Bluetooth/HFP, `enumerateDevices` labels, bleed test and latency calibration (architecture 6.7) are untouched.
* Chromium only, by decision. Firefox/Safari were not run (WebKit has no fake-audio-file flag).

## 7. Files

```
src/pitch.ts               pure module (detector, analyzer/ring buffer, tracker, cents maths)
src/pitch.test.ts          34 bun tests incl. the cents-error table
src/pitch.worklet.ts       AudioWorkletProcessor 'oak-pitch'
src/synth.ts               deterministic tone/WAV synthesis shared by tests and fixtures
src/main.ts, index.html    spike page (window.oakS5: start/snapshot/stop/bench/lifecycle)
src/strudel-coexist.ts, strudel.html      superdough 1.3.0 on the same context
src/worklet-only.ts, worklet-only.html, vite.cold.config.ts, e2e/cold-worklet-only.mjs   cold dep-cache experiment
src/generated/pitch.worklet.iife.js       Bun.build fallback artifact (scripts/build-worklet.ts)
scripts/make-fixtures.ts   -> fixtures/sine-440.wav, sine-440-44k1.wav, sung-a3-cs4-e4.wav, sung-a3-cs4-e4-legato.wav
scripts/noise-probe.ts, scripts/summarize-results.ts
e2e/*.e2e.ts, e2e/helpers.ts, playwright.config.ts    Playwright suite (S5_MODE=dev|preview, 2 browser projects)
vite.config.ts, tsconfig.json
results/                   run logs, per-test JSON, summary table
```

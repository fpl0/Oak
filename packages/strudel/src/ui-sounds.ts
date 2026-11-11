// The UI-sound bus (ux §7.7): Oak's own tiny triangle synth at −24 dBFS, straight to the destination,
// past the limiter and the recorder. Suppressed during ear trials, mic capture, transcription audio and
// recordings.
import type { UiSoundBus } from "./types.ts";

/** −24 dBFS. */
export const UI_BUS_GAIN = 10 ** (-24 / 20);

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export function createUiSoundBus(ctx: AudioContext): UiSoundBus & { dispose(): void } {
  const bus = new GainNode(ctx, { gain: UI_BUS_GAIN });
  const lowpass = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 4000, Q: 0.5 });
  lowpass.connect(bus);
  bus.connect(ctx.destination);
  let enabled = true;
  let volume = 1;
  const suppressions = new Map<number, string>();
  let nextToken = 1;
  const audible = (): boolean => enabled && suppressions.size === 0 && volume > 0;

  return {
    bus,
    get audible() {
      return audible();
    },
    play(notes) {
      if (!audible() || ctx.state !== "running") return;
      const now = ctx.currentTime;
      for (const note of notes) {
        const t = now + Math.max(0, note.at ?? 0) + 0.005;
        const dur = Math.max(0.03, note.dur ?? 0.18);
        const peak = Math.max(0, Math.min(1, note.gain ?? 0.8)) * volume;
        const osc = new OscillatorNode(ctx, { type: "triangle", frequency: midiToHz(note.midi) });
        const env = new GainNode(ctx, { gain: 0 });
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(peak, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.005 + dur);
        osc.connect(env);
        env.connect(lowpass);
        osc.start(t);
        osc.stop(t + 0.01 + dur);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
      }
    },
    setEnabled(on) {
      enabled = on;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
    },
    suppress(reason) {
      const token = nextToken++;
      suppressions.set(token, reason);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
      return () => {
        if (!suppressions.delete(token)) return;
        if (suppressions.size === 0) bus.gain.setTargetAtTime(UI_BUS_GAIN, ctx.currentTime, 0.005);
      };
    },
    dispose() {
      bus.disconnect();
      lowpass.disconnect();
    },
  };
}

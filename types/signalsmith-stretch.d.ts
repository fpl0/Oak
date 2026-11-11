// signalsmith-stretch 1.3.2 ships no types. Declared from its README and the calls spike S5/architecture §6.8 use.
declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    /** AudioContext time (seconds) at which this change takes effect. */
    output?: number;
    active?: boolean;
    /** Position in the input buffer, seconds. */
    input?: number;
    /** Playback rate; 0.5 is half speed. Oak uses 0.25 to 1. */
    rate?: number;
    /** Pitch shift. Fractions are allowed (Oak's ±50¢ fine-tune is ±0.5). */
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    /** Auto-loop region of the input buffer, seconds. Disabled when both are equal. */
    loopStart?: number;
    loopEnd?: number;
  }

  export interface StretchConfig {
    blockMs?: number | null;
    intervalMs?: number;
    splitComputation?: boolean;
    preset?: "default" | "cheaper";
  }

  export interface StretchNode extends AudioWorkletNode {
    /** Current input time inside the sample buffer, seconds. */
    readonly inputTime: number;
    setUpdateInterval(seconds: number, callback?: (inputTime: number) => void): void;
    schedule(change: StretchSchedule): Promise<unknown>;
    start(
      when?: number,
      offset?: number,
      duration?: number,
      rate?: number,
      semitones?: number,
    ): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    /** One typed array per channel, equal lengths. Resolves to the new end time of the buffer, seconds. */
    addBuffers(buffers: ArrayLike<Float32Array>): Promise<number>;
    dropBuffers(): Promise<{ start: number; end: number }>;
    dropBuffers(toSeconds: number): Promise<{ start: number; end: number }>;
    /** Latency in live-input mode, seconds. */
    latency(): Promise<number>;
    configure(config: StretchConfig): Promise<unknown>;
  }

  export default function SignalsmithStretch(
    audioContext: BaseAudioContext,
    channelOptions?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>;
}

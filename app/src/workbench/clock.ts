// The workbench's view of the one transport clock (architecture §2.2 "Clock"). The adapter's paint loop
// (`EditorOptions.onPaint`, one call per animation frame while this editor plays) feeds it; the roll's
// playhead, the bar counter and the keyboard read it without React re-renders. Nothing here keeps time.
export interface ClockFrame {
  playing: boolean;
  /** What is heard now, in cycles (scheduler latency, output latency and the visual offset applied). */
  audibleCycle: number;
}

export class WorkbenchClock {
  private frame: ClockFrame = { playing: false, audibleCycle: 0 };
  private readonly listeners = new Set<(f: ClockFrame) => void>();

  get(): ClockFrame {
    return this.frame;
  }

  subscribe(cb: (f: ClockFrame) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  tick(audibleCycle: number): void {
    this.emit({ playing: true, audibleCycle });
  }

  stop(): void {
    if (!this.frame.playing) return;
    this.emit({ playing: false, audibleCycle: this.frame.audibleCycle });
  }

  private emit(f: ClockFrame): void {
    this.frame = f;
    for (const cb of this.listeners) cb(f);
  }
}

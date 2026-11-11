// The dev clock (OAK_DEV=1 only): the server's one `Clock`, wrapped so a dev endpoint (`PUT /api/dev/clock`)
// or `OAK_NOW=<ISO>` can move it. Every service, the SRS wiring and the tutor read time through it, so a
// moved clock moves the learner's day, due dates and streak weeks together. Production uses the plain clock.
import type { Clock } from "./context.ts";

export interface DevClockState {
  now: Date;
  offsetMs: number;
  frozen: boolean;
}

export class DevClock implements Clock {
  #offsetMs = 0;
  #frozenAt: number | null = null;

  constructor(
    private readonly base: Clock,
    init: { at?: string | null } = {},
  ) {
    if (init.at !== undefined && init.at !== null) this.jump(init.at);
  }

  now(): Date {
    return new Date(this.#frozenAt ?? this.base.now().getTime() + this.#offsetMs);
  }

  state(): DevClockState {
    const now = this.now();
    return { now, offsetMs: now.getTime() - this.base.now().getTime(), frozen: this.#frozenAt !== null };
  }

  /** Jump to an instant; a frozen clock stays frozen there. */
  jump(at: string | Date): void {
    const t = typeof at === "string" ? Date.parse(at) : at.getTime();
    if (!Number.isFinite(t)) throw new RangeError(`not an instant: ${String(at)}`);
    if (this.#frozenAt !== null) this.#frozenAt = t;
    else this.#offsetMs = t - this.base.now().getTime();
  }

  advance(ms: number): void {
    this.jump(new Date(this.now().getTime() + ms));
  }

  freeze(on: boolean): void {
    if (on && this.#frozenAt === null) this.#frozenAt = this.now().getTime();
    else if (!on && this.#frozenAt !== null) {
      this.#offsetMs = this.#frozenAt - this.base.now().getTime();
      this.#frozenAt = null;
    }
  }

  reset(): void {
    this.#offsetMs = 0;
    this.#frozenAt = null;
  }

  /** Run `fn` with the clock frozen at `at`, then put the clock back as it was (the seeder's time travel). */
  async at<T>(at: Date, fn: () => Promise<T> | T): Promise<T> {
    const saved = { offset: this.#offsetMs, frozen: this.#frozenAt };
    this.#frozenAt = at.getTime();
    try {
      return await fn();
    } finally {
      this.#offsetMs = saved.offset;
      this.#frozenAt = saved.frozen;
    }
  }
}

// Turn serialisation. Two turns on one conversation must not interleave: both would read the same
// history, and both would append to it. Different conversations run side by side.
import { TutorError } from "./errors.ts";

/** Runs one task at a time per key, in arrival order. A waiter that is aborted leaves the queue. */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<void>>();

  async acquire(key: string, signal: AbortSignal): Promise<() => void> {
    const prev = this.#tails.get(key) ?? Promise.resolve();
    let open!: () => void;
    const mine = new Promise<void>((resolve) => {
      open = resolve;
    });
    const tail = prev.then(() => mine);
    this.#tails.set(key, tail);
    const release = () => {
      open();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    };
    if (signal.aborted) {
      release();
      throw new TutorError("aborted");
    }
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new TutorError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      await Promise.race([prev, aborted]);
    } catch (e) {
      release();
      throw e;
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
    return release;
  }
}

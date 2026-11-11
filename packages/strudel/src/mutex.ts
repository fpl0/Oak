// The evaluation mutex. `repl.evaluate()` re-assigns `Pattern.prototype.p` and the scope functions
// (`setcpm`, `hush`, `all`, …) of the realm, so two evaluations that interleave register their labels into
// each other's repl (docs/spikes.md, s2 EXTRAS). One chain for every editor and every pattern player.

export class EvalMutex {
  #tail: Promise<unknown> = Promise.resolve();
  #pending = 0;

  /** Runs `fn` after everything queued before it, whether those settled or failed. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    this.#pending++;
    const run = this.#tail.then(fn, fn);
    this.#tail = run.then(
      () => {
        this.#pending--;
      },
      () => {
        this.#pending--;
      },
    );
    return run;
  }
  /** Queued plus running. */
  get pending(): number {
    return this.#pending;
  }
}

/** Resolves with `value` of the promise, or rejects with `error()` after `ms`. The timer is always cleared. */
export function withTimeout<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(error()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

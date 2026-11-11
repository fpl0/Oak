// Taps from a `TapInput` as the async iterable `Calibration.tapLatency` consumes (AudioContext seconds).
import type { TapEvent } from "@oak/audio";

export interface TapStream extends AsyncIterable<number> {
  push(tap: Pick<TapEvent, "time">): void;
  end(): void;
  readonly count: number;
}

export function createTapStream(): TapStream {
  const queue: number[] = [];
  let waiting: ((r: IteratorResult<number>) => void) | null = null;
  let ended = false;
  let count = 0;
  return {
    push(tap) {
      if (ended) return;
      count++;
      if (waiting) {
        const w = waiting;
        waiting = null;
        w({ value: tap.time, done: false });
      } else queue.push(tap.time);
    },
    end() {
      ended = true;
      if (waiting) {
        const w = waiting;
        waiting = null;
        w({ value: undefined, done: true });
      }
    },
    get count() {
      return count;
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<number>> {
          const v = queue.shift();
          if (v !== undefined) return Promise.resolve({ value: v, done: false });
          if (ended) return Promise.resolve({ value: undefined, done: true });
          return new Promise((r) => {
            waiting = r;
          });
        },
        return(): Promise<IteratorResult<number>> {
          ended = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

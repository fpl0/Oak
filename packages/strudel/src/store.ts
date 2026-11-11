// A minimal observable value. No DOM, no Strudel.
import type { Readable } from "./types.ts";

export interface Store<T> extends Readable<T> {
  set(value: T): void;
  /** Number of live subscribers (leak checks). */
  readonly size: number;
}

export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Store<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      if (equals(value, next)) return;
      value = next;
      for (const cb of [...subscribers]) cb(value);
    },
    subscribe(cb) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    get size() {
      return subscribers.size;
    },
  };
}

/** Field-by-field equality for the flat state objects the adapter publishes. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => v === y[i]);
    return Object.is(x, y);
  });
}

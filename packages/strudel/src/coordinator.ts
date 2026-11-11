// PlaybackCoordinator (ux §2.1): only one source plays at a time. Pure bookkeeping; the adapter supplies
// what "panic" does to the audio graph.
import { createStore, shallowEqual } from "./store.ts";
import type { CoordinatorState, PlaybackCoordinator, PlaybackSource } from "./types.ts";

export interface CoordinatorInternals extends PlaybackCoordinator {
  /** Stops and forgets every source (panic and dispose). */
  stopAll(): void;
  readonly sources: ReadonlyMap<string, PlaybackSource>;
}

export function createCoordinator(onPanic: () => void = () => {}): CoordinatorInternals {
  const store = createStore<CoordinatorState>({ activeId: null, kind: null }, shallowEqual);
  /** Everything that claimed and has not released: normally one, briefly two while a claim stops the others. */
  const sources = new Map<string, PlaybackSource>();

  const publish = (): void => {
    const last = [...sources.values()].at(-1);
    store.set(last ? { activeId: last.id, kind: last.kind } : { activeId: null, kind: null });
  };
  const safeStop = (source: PlaybackSource): void => {
    try {
      source.stop();
    } catch (err) {
      console.warn(`[oak] stopping ${source.id} failed`, err);
    }
  };

  const release = (id: string): void => {
    if (sources.delete(id)) publish();
  };
  const stopAll = (): void => {
    const all = [...sources.values()];
    sources.clear();
    for (const s of all) safeStop(s);
    publish();
  };

  return {
    get: store.get,
    subscribe: store.subscribe,
    sources,
    claim(source) {
      const others = [...sources.values()].filter((s) => s.id !== source.id);
      // Register first: a stop() below may synchronously release, and must not clear the new claim.
      sources.delete(source.id);
      sources.set(source.id, source);
      for (const other of others) {
        sources.delete(other.id);
        safeStop(other);
      }
      publish();
      return () => release(source.id);
    },
    release,
    stopAll,
    panic() {
      stopAll();
      onPanic();
    },
  };
}

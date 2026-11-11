// Shared Playwright helpers for the @oak/strudel specs.
import type { Page } from "@playwright/test";

/** Counts AudioContext constructions and live listeners per target, before any page script runs. */
export const INSTRUMENT = () => {
  const w = window as unknown as Record<string, unknown>;
  const counts = { audioContexts: 0, window: new Map<string, number>(), document: new Map<string, number>() };
  w.__instr = counts;
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args: ConstructorParameters<typeof AudioContext>) {
      super(...args);
      counts.audioContexts++;
    }
  } as typeof AudioContext;
  const realAdd = EventTarget.prototype.addEventListener;
  const realRemove = EventTarget.prototype.removeEventListener;
  const seen = new WeakMap<object, Set<string>>();
  const mapOf = (t: EventTarget) => (t === window ? counts.window : t === document ? counts.document : null);
  EventTarget.prototype.addEventListener = function (type: string, l: unknown, o?: unknown) {
    const m = mapOf(this);
    if (m && l) {
      const key = `${type}|${typeof o === "boolean" ? o : !!(o as { capture?: boolean })?.capture}`;
      const set = seen.get(l as object) ?? new Set();
      if (!set.has(key)) {
        set.add(key);
        seen.set(l as object, set);
        m.set(type, (m.get(type) ?? 0) + 1);
      }
    }
    return realAdd.call(this, type, l as EventListener, o as AddEventListenerOptions);
  };
  EventTarget.prototype.removeEventListener = function (type: string, l: unknown, o?: unknown) {
    const m = mapOf(this);
    if (m && l) {
      const key = `${type}|${typeof o === "boolean" ? o : !!(o as { capture?: boolean })?.capture}`;
      const set = seen.get(l as object);
      if (set?.delete(key)) m.set(type, (m.get(type) ?? 1) - 1);
    }
    return realRemove.call(this, type, l as EventListener, o as EventListenerOptions);
  };
};

export async function openPage(page: Page, errors: string[] = []): Promise<string[]> {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.addInitScript(INSTRUMENT);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __oak?: unknown }).__oak !== undefined);
  await page.evaluate(
    () => (window as unknown as { __oak: { oak: { ready: Promise<void> } } }).__oak.oak.ready,
  );
  return errors;
}

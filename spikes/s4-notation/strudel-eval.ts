/** Headless Strudel evaluation (same approach as tests/smoke/strudel-import.test.ts). Bun/Node only. */
import { type HapLike, type OakEvent, hapsToEvents } from "./quantize.ts";

// biome-ignore lint/suspicious/noExplicitAny: Strudel ships no types
let ready: Promise<{ core: any; transpiler: any }> | null = null;

function init() {
  ready ??= (async () => {
    // biome-ignore lint/suspicious/noExplicitAny: Strudel ships no types
    const core: any = await import("@strudel/core");
    // biome-ignore lint/suspicious/noExplicitAny: Strudel ships no types
    const mini: any = await import("@strudel/mini");
    // biome-ignore lint/suspicious/noExplicitAny: Strudel ships no types
    const tonal: any = await import("@strudel/tonal");
    // biome-ignore lint/suspicious/noExplicitAny: Strudel ships no types
    const { transpiler }: any = await import("@strudel/transpiler");
    await core.evalScope(core, mini, tonal);
    return { core, transpiler };
  })();
  return ready;
}

/** Evaluate Strudel code and return normalized events for cycles [0, bars). 1 cycle = 1 bar. */
export async function evalToEvents(code: string, bars: number): Promise<{ events: OakEvent[]; skipped: number }> {
  const { core, transpiler } = await init();
  const { pattern } = await core.evaluate(code, transpiler);
  const haps: HapLike[] = pattern.queryArc(0, bars);
  return hapsToEvents(haps);
}

// Throwaway harness for the contracts adversarial pass: headless Strudel 1.2.6 (core+mini+tonal+transpiler).
// biome-ignore-all lint/suspicious/noExplicitAny: untyped Strudel interop
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";

const c = core as any;
let ready = false;
export let logs: string[] = [];
let tracks: Record<string, any> = {};
let cps = 0.5;

export async function init() {
  if (ready) return;
  await c.evalScope(core, mini, tonal, {
    setcpm: (x: number) => { cps = x / 60; },
    setcps: (x: number) => { cps = x; },
  });
  c.Pattern.prototype.p = function (id: string) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return c.silence;
    tracks[id] = this;
    return this;
  };
  c.setLogger?.((msg: string) => logs.push(String(msg)));
  // logger in core dispatches a DOM-less callback; also capture console
  const origLog = console.log, origWarn = console.warn, origErr = console.error;
  console.log = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
  console.warn = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
  console.error = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
  (globalThis as any).__restore = () => { console.log = origLog; console.warn = origWarn; console.error = origErr; };
  (globalThis as any).__out = origLog;
  ready = true;
}

const __origLog = console.log.bind(console);
export const out = (...a: any[]) => __origLog(...a);

export interface Ev { track: string; b: string; e: string; bf: number; ef: number; v: any; ctx: any }

export async function run(code: string, from = 0, to = 1): Promise<{ ev: Ev[]; err: string | null; logs: string[]; cps: number; tracks: string[] }> {
  await init();
  logs = []; tracks = {}; cps = 0.5;
  let err: string | null = null;
  const ev: Ev[] = [];
  try {
    const { pattern } = await c.evaluate(code, transpiler);
    if (Object.keys(tracks).length === 0 && pattern?.queryArc) tracks.main = pattern;
    for (const [t, p] of Object.entries(tracks)) {
      for (const h of (p as any).queryArc(from, to)) {
        if (!h.hasOnset()) continue;
        ev.push({ track: t, b: h.whole.begin.toFraction(), e: h.whole.end.toFraction(), bf: Number(h.whole.begin), ef: Number(h.whole.end), v: h.value, ctx: h.context });
      }
    }
    ev.sort((a, b) => a.bf - b.bf || a.track.localeCompare(b.track));
  } catch (e: any) {
    err = String(e?.message ?? e);
  }
  return { ev, err, logs: [...logs], cps, tracks: Object.keys(tracks) };
}

export function midi(v: any): number | null {
  const n = v?.note ?? (typeof v === "string" || typeof v === "number" ? v : null);
  if (n == null) return null;
  if (typeof n === "number") return n;
  try { return c.noteToMidi(n); } catch { return null; }
}
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const pc = (m: number) => NAMES[((m % 12) + 12) % 12];
export const nm = (m: number) => `${pc(m)}${Math.floor(m / 12) - 1}`;
export function notes(ev: Ev[], track?: string) {
  return ev.filter((e) => !track || e.track === track).map((e) => { const m = midi(e.v); return m == null ? (e.v?.s ?? "?") : nm(m); });
}
export function show(ev: Ev[]) {
  return ev.map((e) => { const m = midi(e.v); return `${e.track}@${e.b}:${m == null ? (e.v?.s ?? JSON.stringify(e.v)) : nm(m)}`; }).join(" ");
}

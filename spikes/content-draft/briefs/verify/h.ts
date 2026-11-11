// Headless Strudel 1.2.6 harness for checking the musical examples named in the unit briefs.
// Usage: bun spikes/content-draft/briefs/verify/run.ts  (prints every example's events; exits 1 on any error)
// biome-ignore-all lint/suspicious/noExplicitAny: untyped Strudel interop
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";

const c = core as any;
let ready = false;
let logs: string[] = [];
let tracks: Record<string, any> = {};
let cps = 0.5;
const realLog = console.log.bind(console);
export const out = (...a: unknown[]) => realLog(...a);

async function init() {
  if (ready) return;
  await c.evalScope(core, mini, tonal, {
    setcpm: (x: number) => {
      cps = x / 60;
    },
  });
  c.Pattern.prototype.p = function (id: string) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return c.silence;
    tracks[id] = this;
    return this;
  };
  c.setLogger?.((msg: string) => logs.push(String(msg)));
  console.log = (...a: any[]) => {
    logs.push(a.map(String).join(" "));
  };
  console.warn = console.log;
  console.error = console.log;
  ready = true;
}

export interface Ev {
  track: string;
  b: number;
  e: number;
  bs: string;
  midi: number | null;
  s?: string;
  v: any;
}
export async function run(code: string, bars = 1) {
  await init();
  logs = [];
  tracks = {};
  cps = 0.5;
  let err: string | null = null;
  const ev: Ev[] = [];
  try {
    const { pattern } = await c.evaluate(code, transpiler);
    if (Object.keys(tracks).length === 0 && pattern?.queryArc) tracks.main = pattern;
    for (const [t, p] of Object.entries(tracks)) {
      for (const h of (p as any).queryArc(0, bars)) {
        if (!h.hasOnset()) continue;
        const v = h.value;
        let m: number | null = null;
        const n = v?.note;
        if (typeof n === "number") m = n;
        else if (typeof n === "string") {
          try {
            m = c.noteToMidi(n);
          } catch {
            m = null;
          }
        }
        ev.push({ track: t, b: Number(h.whole.begin), e: Number(h.whole.end), bs: h.whole.begin.toFraction(), midi: m, s: v?.s, v });
      }
    }
    ev.sort((a, b) => a.b - b.b || a.track.localeCompare(b.track) || (a.midi ?? 0) - (b.midi ?? 0));
  } catch (e: any) {
    err = String(e?.message ?? e);
  }
  const bad = logs.filter((l) => /error|warn|Can't|invalid|not found|incomplete/i.test(l));
  return { ev, err, logs: bad, bpmOver: cps * 60, tracks: Object.keys(tracks) };
}

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const nm = (m: number, flats = false) => `${(flats ? FLAT : SHARP)[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** One line per track per bar: notes (or drum names), chords in [ ]. */
export function show(ev: Ev[], bars: number, flats = false): string {
  const lines: string[] = [];
  const byTrack = new Map<string, Ev[]>();
  for (const e of ev) byTrack.set(e.track, [...(byTrack.get(e.track) ?? []), e]);
  for (const [t, es] of byTrack) {
    const barsOut: string[] = [];
    for (let bar = 0; bar < bars; bar++) {
      const inBar = es.filter((e) => e.b >= bar && e.b < bar + 1);
      const groups = new Map<number, Ev[]>();
      for (const e of inBar) groups.set(e.b, [...(groups.get(e.b) ?? []), e]);
      const toks = [...groups.values()].map((g) => {
        const names = g.map((e) => (e.midi == null ? (e.s ?? "?") : nm(e.midi, flats)));
        return names.length > 1 ? `[${names.join(",")}]` : names[0];
      });
      barsOut.push(toks.join(" "));
    }
    lines.push(`  ${t.padEnd(7)}| ${barsOut.join(" | ")}`);
  }
  return lines.join("\n");
}

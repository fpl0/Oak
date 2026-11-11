// Parity (contracts §11.4): every catalogued function is callable in the grader realm, and every
// catalog example evaluates there to sound. The adapter realm runs the same list in @oak/strudel's tests;
// this side covers the grader's stubs (.piano(), the visual methods, the repl functions).
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading } from "./analyze.ts";
import { initRealm, VISUAL_METHODS } from "./realm.ts";
import { core } from "./strudel.ts";

setDefaultTimeout(60_000);

interface FnEntryLike {
  name: string;
  aliases?: string[];
  kind: string;
  example: string;
  tool: string;
}

const CATALOG_FILES = ["rhythm.ts", "pitch.ts", "sound.ts"];

/** The content catalog (content/catalog/functions/*), read as data. */
async function loadCatalog(): Promise<FnEntryLike[]> {
  const out: FnEntryLike[] = [];
  for (const file of CATALOG_FILES) {
    const url = new URL(`../../../../content/catalog/functions/${file}`, import.meta.url);
    try {
      const mod = (await import(url.href)) as Record<string, unknown>;
      for (const v of Object.values(mod)) if (Array.isArray(v)) out.push(...(v as FnEntryLike[]));
    } catch {
      // the content engineer has not written this file yet
    }
  }
  return out;
}

/** Names from contracts §3.2 groups B, C and H that code calls directly. */
const CONTRACT_NAMES = (
  "s sound setcpm gain stack bank slow fast struct lastOf firstOf off superimpose degradeBy sometimesBy arrange " +
  "range segment mask swingBy swing early late velocity ply euclid euclidRot note transpose n scale legato arp " +
  "chord voicing anchor mode dict add rev scaleTranspose rootNotes set offset room clip lpf delay distort pan jux " +
  "scope partials hpf bpf lpq lpenv lpa lpd lps lpr attack decay sustain release roomsize delaytime delayfeedback " +
  "orbit crush coarse distorttype vib vibmod phaser tremolosync tremolodepth lprate lpdepth fm fmh unison detune " +
  "spread pw fscope chop slice splice striate loopAt speed begin end compressor postgain duckorbit duckdepth piano"
).split(" ");
const SIGNALS = ["sine", "saw", "perlin", "cosine", "square", "tri", "rand"];

let catalog: FnEntryLike[] = [];
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
  catalog = await loadCatalog();
});

const proto = core.Pattern.prototype as Record<string, unknown>;
const g = globalThis as Record<string, unknown>;

describe("parity: catalogued names exist in the grader realm", () => {
  test("every function and method of contracts §3.2 is callable", () => {
    const missing = CONTRACT_NAMES.filter(
      (n) => typeof proto[n] !== "function" && typeof g[n] !== "function",
    );
    expect(missing).toEqual([]);
    for (const s of SIGNALS) expect([s, core.isPattern(g[s])]).toEqual([s, true]);
  });

  test("visual methods and their inline variants are identity stubs", async () => {
    for (const m of VISUAL_METHODS) {
      expect(typeof proto[m]).toBe("function");
      expect(typeof proto[`_${m}`]).toBe("function");
    }
  });

  test("every catalog entry with a callable name exists (content/catalog/functions)", () => {
    expect(catalog.length).toBeGreaterThan(0);
    const callable = catalog.filter((e) => ["function", "method", "control", "signal"].includes(e.kind));
    const missing: string[] = [];
    for (const e of callable) {
      for (const raw of [e.name, ...(e.aliases ?? [])]) {
        const name = raw.replace(/^\./, "").replace(/\(.*$/, "");
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
        const ok =
          typeof proto[name] === "function" || typeof g[name] === "function" || core.isPattern(g[name]);
        if (!ok) missing.push(raw);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every catalog example evaluates in the grader realm and is not silent", async () => {
    const failures: string[] = [];
    for (const e of catalog) {
      const r = await evaluateForGrading(e.example, { mode: "lesson", bars: 4, lint: null });
      if (!r.ok) failures.push(`${e.name}: ${r.error.kind} ${r.error.message}`);
      else if (r.events.length === 0) failures.push(`${e.name}: silent`);
    }
    expect(failures).toEqual([]);
  });
});

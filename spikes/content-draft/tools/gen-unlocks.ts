// Regenerates tools/unlocks.data.ts from docs/design/contracts.md §3.2 (the unlock table) and §2.5 (the
// default session order). Run it again whenever contracts §2 or §3 change:
//   bun spikes/content-draft/tools/gen-unlocks.ts
// The table cells are copied verbatim; `gates` (what each row gates in CODE) is the hand-written map below.
// The generator fails if a row of groups B to H has no `gates` entry, so nothing is silently unchecked.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const md = readFileSync(join(ROOT, "docs/design/contracts.md"), "utf8");

interface Gates {
  /** Callee or method names: `s`, `scale`, `swingBy`. */
  fn?: string[];
  /** Mini-notation operators, by the checker's names (see MINI_OPS in unlocks.ts). */
  mini?: string[];
  /** Sound names inside s("…"). */
  sound?: string[];
  /** Bank names inside .bank("…"). */
  bank?: string[];
  /** Scale names after the tonic, with ':' for spaces: "harmonic:minor". */
  scale?: string[];
  /** Chord-symbol suffixes (the symbol minus its root): "" "m" "^7". */
  chord?: string[];
  /** .dict("…") values. */
  dict?: string[];
  /** Bare identifiers that are not calls: sine, saw, perlin. */
  ident?: string[];
  /** A usage the checker detects structurally; the name is documented in unlocks.ts SPECIAL. */
  special?: string[];
  /** Not visible in code (app features, lenses, templates). */
  none?: true;
}

const G: Record<string, Gates> = {
  // --- B ---
  "tb.label": { special: ["label"] },
  "tb.s": { fn: ["s", "sound"] },
  "tb.setcpm": { fn: ["setcpm"] },
  "tb.mini.seq": { mini: ["seq"] },
  "tb.mini.repeat": { mini: ["*"] },
  "tb.mini.rest": { mini: ["~"] },
  "tb.gain": { fn: ["gain"] },
  "tb.stack": { fn: ["stack"] },
  "tb.bank": { fn: ["bank"] },
  "tb.mini.sub": { mini: ["[]"] },
  "tb.mini.elongate": { mini: ["@"] },
  "tb.mini.hold": { mini: ["_"] },
  "tb.mini.replicate": { mini: ["!"] },
  "tb.mini.alt": { mini: ["<>"] },
  "tb.label.mute": { special: ["label-mute"] },
  "tb.meter.3-4": { special: ["meter:3/4"] },
  "tb.meter.2-4": { special: ["meter:2/4"] },
  "tb.slow": { fn: ["slow"] },
  "tb.fast": { fn: ["fast"] },
  "tb.mini.stack": { mini: [","] },
  "tb.struct": { fn: ["struct"] },
  "tb.lastOf": { fn: ["lastOf"] },
  "tb.firstOf": { fn: ["firstOf"] },
  "tb.off": { fn: ["off"] },
  "tb.superimpose": { fn: ["superimpose"] },
  "tb.mini.maybe": { mini: ["?"] },
  "tb.degradeBy": { fn: ["degradeBy"] },
  "tb.sometimesBy": { fn: ["sometimesBy"] },
  "tb.const": { special: ["const"] },
  "tb.arrange": { fn: ["arrange"], ident: ["silence"] },
  "tb.signal": { ident: ["sine", "saw", "perlin"] },
  "tb.range": { fn: ["range"] },
  "tb.segment": { fn: ["segment"] },
  "tb.mask": { fn: ["mask"] },
  "tb.swingBy": { fn: ["swingBy"] },
  "tb.swing": { fn: ["swing"] },
  "tb.early": { fn: ["early"] },
  "tb.late": { fn: ["late"] },
  "tb.velocity": { fn: ["velocity"] },
  "tb.meter.compound": { special: ["meter:6/8", "meter:9/8", "meter:12/8"] },
  "tb.ply": { fn: ["ply"] },
  "tb.swing.patterned": { special: ["swing-patterned"] },
  "tb.meter.odd": { special: ["meter:5/4", "meter:5/8", "meter:7/8", "meter:9/8i"] },
  "tb.mini.polymeter": { mini: ["{}"] },
  "tb.mini.euclid": { mini: ["(k,n)"] },
  "tb.mini.euclid-rot": { mini: ["(k,n,r)"] },
  "tb.euclid": { fn: ["euclid"] },
  "tb.euclidRot": { fn: ["euclidRot"] },
  // --- C ---
  "tb.note": { fn: ["note"] },
  "tb.note.names": { special: ["note-names"] },
  "tb.note.accidentals": { special: ["note-accidentals"] },
  "tb.transpose": { fn: ["transpose"] },
  "tb.note.midi": { special: ["note-midi"] },
  "tb.s.pitched": { special: ["s-on-pitched"] },
  "tb.n": { fn: ["n"] },
  "tb.scale": { fn: ["scale"] },
  "tb.n.range": { special: ["n-range"] },
  "tb.mini.range": { mini: [".."] },
  "tb.scale.patterned": { special: ["scale-patterned"] },
  "tb.legato": { fn: ["legato"] },
  "tb.transpose.interval": { special: ["transpose-interval"] },
  "tb.arp": { fn: ["arp"] },
  "tb.chord": { fn: ["chord"] },
  "tb.voicing": { fn: ["voicing"] },
  "tb.anchor": { fn: ["anchor"] },
  "tb.mode.below": { special: ["mode:below"] },
  "tb.dict.triads": { dict: ["triads"] },
  "tb.add": { fn: ["add"] },
  "tb.mode.root": { special: ["mode:root"] },
  "tb.rev": { fn: ["rev"] },
  "tb.scaleTranspose": { fn: ["scaleTranspose"] },
  "tb.rootNotes": { fn: ["rootNotes"] },
  "tb.dict.lefthand": { dict: ["lefthand"] },
  "tb.n.chromatic": { special: ["n-chromatic"] },
  "tb.dict.guidetones": { dict: ["guidetones"] },
  "tb.set": { fn: ["set"] },
  "tb.voicing.n": { special: ["chord-as-method"] },
  "tb.dict.ireal-ext": { dict: ["ireal-ext"] },
  "tb.mode.duck": { special: ["mode:duck"] },
  "tb.offset": { fn: ["offset"] },
  // --- D ---
  "scale.major": { scale: ["major"] },
  "scale.minor": { scale: ["minor", "aeolian"] },
  "scale.harmonic-minor": { scale: ["harmonic:minor"] },
  "scale.melodic-minor": { scale: ["melodic:minor"] },
  "scale.major-pentatonic": { scale: ["major:pentatonic"] },
  "scale.minor-pentatonic": { scale: ["minor:pentatonic"] },
  "scale.blues": { scale: ["blues"] },
  "scale.mixolydian": { scale: ["mixolydian"] },
  "scale.dorian": { scale: ["dorian"] },
  "scale.lydian": { scale: ["lydian"] },
  "scale.phrygian": { scale: ["phrygian"] },
  "scale.locrian": { scale: ["locrian"] },
  "scale.altered": { scale: ["altered"] },
  "scale.lydian-dominant": { scale: ["lydian:dominant"] },
  "scale.bebop": { scale: ["bebop", "bebop:major"] },
  // --- E --- (suffix = symbol minus root)
  "chord.triad": { chord: ["", "m", "o", "aug"] },
  "chord.dom7": { chord: ["7"] },
  "chord.seventh": { chord: ["^7", "m7"] },
  "chord.seventh-dim": { chord: ["m7b5", "o7"] },
  "chord.sixth-sus": { chord: ["6", "m6", "69", "sus", "7sus", "2", "add9"] },
  "chord.alt": { chord: ["7b9", "7#9", "7#11", "7b13", "7alt", "m^7", "mM7"] },
  // `^7#11` is in STYLE §5.1 but in no row of contracts §3.2 E; it is filed with the extensions here.
  "chord.ext": { chord: ["^9", "m9", "9", "13", "m11", "^7#11"] },
  // --- F ---
  "snd.drum.bd": { sound: ["bd"] },
  "snd.drum.sd": { sound: ["sd"] },
  "snd.drum.hh": { sound: ["hh"] },
  "snd.drum.cp": { sound: ["cp"] },
  "snd.drum.rim": { sound: ["rim"] },
  "snd.drum.oh": { sound: ["oh"] },
  "snd.drum.cr": { sound: ["cr"] },
  "snd.drum.rd": { sound: ["rd"] },
  "snd.bank.RolandTR909": { bank: ["RolandTR909"] },
  "snd.bank.RolandTR808": { bank: ["RolandTR808"] },
  "snd.drum.lt": { sound: ["lt"] },
  "snd.drum.mt": { sound: ["mt"] },
  "snd.drum.ht": { sound: ["ht"] },
  "snd.bank.LinnDrum": { bank: ["LinnDrum"] },
  "snd.bank.AkaiLinn": { bank: ["AkaiLinn"] },
  "snd.bank.RolandTR707": { bank: ["RolandTR707"] },
  "snd.drum.sh": { sound: ["sh"] },
  "snd.drum.cb": { sound: ["cb"] },
  "snd.drum.tb": { sound: ["tb"] },
  "snd.jazzkit": { bank: ["jazzkit"] },
  "snd.brk": { sound: ["brk"] },
  // --- G ---
  "snd.piano": { sound: ["piano"] },
  "snd.wave.sine": { sound: ["sine"] },
  "snd.wave.triangle": { sound: ["triangle"] },
  "snd.wave.square": { sound: ["square"] },
  "snd.wave.sawtooth": { sound: ["sawtooth"] },
  "snd.ebass": { sound: ["ebass"] },
  "snd.acgtr": { sound: ["acgtr"] },
  "snd.upright": { sound: ["upright"] },
  "snd.rhodes": { sound: ["rhodes"] },
  "snd.organ": { sound: ["organ"] },
  "snd.pad": { sound: ["pad"] },
  "snd.fingerbass": { sound: ["fingerbass"] },
  "tb.template.synthbass": { none: true },
  "snd.strings": { sound: ["strings"] },
  "snd.crunch": { sound: ["crunch"] },
  "snd.jazzgtr": { sound: ["jazzgtr"] },
  "snd.cleangtr": { sound: ["cleangtr"] },
  "snd.horns": { sound: ["horns"] },
  "snd.trumpet": { sound: ["trumpet"] },
  "snd.tenor": { sound: ["tenor"] },
  "snd.vibes": { sound: ["vibes"] },
  "snd.mutetpt": { sound: ["mutetpt"] },
  "snd.clav": { sound: ["clav"] },
  "snd.choir": { sound: ["choir"] },
  "snd.wave.supersaw": { sound: ["supersaw"] },
  "snd.wave.pulse": { sound: ["pulse"] },
  // --- H ---
  "tb.room": { fn: ["room"] },
  "tb.clip": { fn: ["clip"] },
  "tb.lpf": { fn: ["lpf"] },
  "tb.delay": { fn: ["delay"] },
  "tb.distort": { fn: ["distort"] },
  "tb.pan": { fn: ["pan"] },
  "tb.jux": { fn: ["jux"] },
  "tb.scope": { fn: ["scope"] },
  "tb.partials": { fn: ["partials"] },
  "tb.hpf": { fn: ["hpf"] },
  "tb.bpf": { fn: ["bpf"] },
  "tb.lpq": { fn: ["lpq"] },
  "tb.lpenv": { fn: ["lpenv", "lpa", "lpd", "lps", "lpr"] },
  "tb.adsr": { fn: ["attack", "decay", "sustain", "release"] },
  "tb.roomsize": { fn: ["roomsize"] },
  "tb.delaytime": { fn: ["delaytime"] },
  "tb.delayfeedback": { fn: ["delayfeedback"] },
  "tb.orbit": { fn: ["orbit"] },
  "tb.crush": { fn: ["crush"] },
  "tb.coarse": { fn: ["coarse"] },
  "tb.distorttype": { fn: ["distorttype"] },
  "tb.vib": { fn: ["vib", "vibmod"] },
  "tb.phaser": { fn: ["phaser"] },
  "tb.tremolo": { fn: ["tremolosync", "tremolodepth"] },
  "tb.lpmod": { fn: ["lprate", "lpdepth"] },
  "tb.fm": { fn: ["fm", "fmh"] },
  "tb.unison": { fn: ["unison", "detune", "spread"] },
  "tb.pw": { fn: ["pw"] },
  "tb.fscope": { fn: ["fscope"] },
  "tb.chop": { fn: ["chop", "slice", "splice", "striate"] },
  "tb.loopAt": { fn: ["loopAt"] },
  "tb.speed": { fn: ["speed", "begin", "end"] },
  "tb.compressor": { fn: ["compressor"] },
  "tb.postgain": { fn: ["postgain"] },
  "tb.duck": { fn: ["duckorbit", "duckdepth"] },
};

/** Per-site `when` and the rule-12 fallback, from the Notes column and §3.1 rules 11 and 12. */
const START_SITES: Record<string, string[]> = {
  "tb.feature.album": ["C0.S1"],
  "snd.ebass": ["C1.S1"],
  "tb.lpf": ["C1.S1"],
  "snd.horns": ["RC1.S2"],
  "snd.choir": ["AC2.S1"],
};
const FALLBACK: Record<string, string> = { "snd.ebass": "U03.L03", "tb.lpf": "U03.L03" };

const section = md.slice(md.indexOf("### 3.2 The table"), md.indexOf("### 3.3 The toolbox-aware lint"));
const rows: unknown[] = [];
let group = "";
const seen = new Set<string>();
for (const line of section.split("\n")) {
  const head = /^\*\*([A-H])\. /.exec(line);
  if (head) {
    group = head[1] as string;
    continue;
  }
  if (!line.startsWith("| `")) continue;
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  if (cells.length !== 6) throw new Error(`unexpected row shape: ${line}`);
  const [idCell, code, atCell, concept, previewCell, notes] = cells as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const id = idCell.replace(/`/g, "");
  if (seen.has(id)) throw new Error(`duplicate row ${id}`);
  seen.add(id);
  const gated = atCell.includes("*");
  const sites = atCell
    .replace("*", "")
    .split(" or ")
    .map((s) => s.trim())
    .map((at) => ({ at, when: START_SITES[id]?.includes(at) ? "start" : "complete" }));
  const gates = G[id] ?? (group === "A" ? { none: true } : undefined);
  if (!gates) throw new Error(`row ${id} (group ${group}) has no gates entry in gen-unlocks.ts`);
  const kind = id.startsWith("snd.")
    ? "sound"
    : id.startsWith("scale.")
      ? "scale"
      : id.startsWith("chord.")
        ? "chord"
        : id.startsWith("tb.feature.")
          ? "feature"
          : id.startsWith("tb.lens.")
            ? "lens"
            : id.startsWith("tb.template.")
              ? "template"
              : "tool";
  rows.push({
    id,
    kind,
    group,
    code: code.replace(/\s*†\s*$/, ""),
    sites,
    ...(FALLBACK[id] ? { fallbackAt: FALLBACK[id] } : {}),
    ...(gated ? { voicingGate: true } : {}),
    ...(code.includes("†") ? { audibilityPending: true } : {}),
    concept,
    preview: previewCell === "—" ? null : previewCell,
    ...(notes ? { notes } : {}),
    gates,
  });
}
for (const id of Object.keys(G)) if (!seen.has(id)) throw new Error(`gates entry ${id} has no table row`);

const orderBlock = /```\n(1:U00\.L01[\s\S]*?)```/.exec(md);
if (!orderBlock) throw new Error("default order block not found in §2.5");
const order = (orderBlock[1] as string)
  .trim()
  .split(/\s+/)
  .map((tok) => {
    const m = /^(\d+):(\S+)$/.exec(tok);
    if (!m) throw new Error(`bad order token ${tok}`);
    return m[2] as string;
  });
if (order.length !== 183) throw new Error(`expected 183 core sessions, found ${order.length}`);

/** Lessons of every unit, in order, from the §2.3 and §2.6 tables. */
const lessons = [...md.matchAll(/^\| ((?:U\d{2}|[JRA]\d)\.L\d{2}) \| ([^|]+) \|/gm)].map((m) => ({
  id: m[1] as string,
  title: (m[2] as string).trim(),
}));

const out = `// GENERATED by tools/gen-unlocks.ts from docs/design/contracts.md §3.2, §2.3, §2.5, §2.6. Do not edit by hand.
// ${rows.length} unlock rows, ${order.length} core sessions in the default order, ${lessons.length} lessons.
import type { UnlockRow } from "./unlocks.ts";

export const UNLOCK_ROWS: readonly UnlockRow[] = ${JSON.stringify(rows, null, 2)};

/** Contracts §2.5: the default linear order of the core (session number = index + 1). */
export const DEFAULT_ORDER: readonly string[] = ${JSON.stringify(order)};

/** Every lesson of the course map, core then tracks, in table order. */
export const LESSONS: readonly { id: string; title: string }[] = ${JSON.stringify(lessons, null, 2)};
`;
writeFileSync(join(import.meta.dir, "unlocks.data.ts"), out);
console.log(`wrote unlocks.data.ts: ${rows.length} rows, ${order.length} sessions, ${lessons.length} lessons`);

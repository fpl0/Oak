// Sound families (contracts §7.3, track A): `fam.snd.params` (what changed in the sound between bar 1 and
// bar 2: filter cutoff, resonance, attack, release, reverb, delay, or two of them) and `fam.snd.roles`
// (which instrument plays the bass, the pad or the lead; which part muddies the bass).
import type { KeySpec } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "../build.ts";
import { spellMidi, stepToMidi } from "../kernel.ts";
import { above, rn, voiceProgression } from "../music.ts";
import { atom, chordOf, line, type Node, seq } from "../pat.ts";
import { cueOf, type Generator, jitter, pickKey, pickTempo, trialOf } from "./common.ts";

// --- fam.snd.params -----------------------------------------------------------------------------

/** One audible change: the Strudel control, its superdough name, the value in bar 1 and in bar 2. */
interface Change {
  id: string;
  label: string;
  control: string;
  internal: string;
  from: number;
  to: number;
  /** Extra controls the change needs to be heard (a delay's time and feedback). */
  with?: Record<string, { internal: string; value: number }>;
}
export const SOUND_CHANGES: Readonly<Record<string, Change>> = {
  brighter: {
    id: "brighter",
    label: "Brighter (filter opened)",
    control: "lpf",
    internal: "cutoff",
    from: 700,
    to: 3200,
  },
  darker: {
    id: "darker",
    label: "Darker (filter closed)",
    control: "lpf",
    internal: "cutoff",
    from: 3200,
    to: 700,
  },
  resonance: {
    id: "resonance",
    label: "A ringing peak (resonance up)",
    control: "lpq",
    internal: "resonance",
    from: 1,
    to: 18,
  },
  "slow-attack": {
    id: "slow-attack",
    label: "Softer start (longer attack)",
    control: "attack",
    internal: "attack",
    from: 0.005,
    to: 0.25,
  },
  "long-release": {
    id: "long-release",
    label: "Longer tail (longer release)",
    control: "release",
    internal: "release",
    from: 0.05,
    to: 0.9,
  },
  room: { id: "room", label: "More room (reverb)", control: "room", internal: "room", from: 0, to: 0.8 },
  delay: {
    id: "delay",
    label: "Echoes (delay)",
    control: "delay",
    internal: "delay",
    from: 0,
    to: 0.55,
    with: {
      delaytime: { internal: "delaytime", value: 0.375 },
      delayfeedback: { internal: "delayfeedback", value: 0.45 },
    },
  },
};
/** The changes each category asks about. */
export const CHANGES_OF: Readonly<Record<string, string[]>> = {
  cutoff: ["brighter", "darker"],
  resonance: ["resonance"],
  "attack-release": ["slow-attack", "long-release"],
  "room-delay": ["room", "delay"],
  "two-changes": [],
};

/** Base values every bar starts from, so a change is the only difference between the bars. */
const BASE: Readonly<Record<string, { internal: string; value: number }>> = {
  lpf: { internal: "cutoff", value: 1800 },
  lpq: { internal: "resonance", value: 1 },
  attack: { internal: "attack", value: 0.005 },
  release: { internal: "release", value: 0.05 },
  room: { internal: "room", value: 0 },
  delay: { internal: "delay", value: 0 },
};

export const soundParams: Generator = {
  name: "sound-params",
  generate(ctx) {
    const key: KeySpec = pickKey(ctx, "major");
    const openChanges = ctx.level.categories
      .filter((c) => ctx.openCategories.includes(c) || c === ctx.category)
      .flatMap((c) => CHANGES_OF[c] ?? []);
    let picked: Change[];
    if (ctx.category === "two-changes") {
      // Two changes on different controls.
      const pool = ctx.rng.shuffle(openChanges.length >= 2 ? openChanges : Object.keys(SOUND_CHANGES));
      const first = SOUND_CHANGES[pool[0] as string] as Change;
      const second = pool
        .map((id) => SOUND_CHANGES[id] as Change)
        .find((c) => c.control !== first.control) as Change;
      picked = [first, second];
    } else {
      picked = [SOUND_CHANGES[ctx.rng.pick(CHANGES_OF[ctx.category] ?? ["brighter"])] as Change];
    }
    // The same phrase twice: bar 1 with the base sound, bar 2 with the change.
    const steps = ctx.rng.pick([
      [0, 2, 4, 2],
      [0, 4, 2, 4],
      [4, 2, 0, null],
      [0, null, 4, null],
    ]);
    const names = steps.map((s) => (s === null ? null : spellMidi(stepToMidi(s, key, 3), key).code));
    const bar1: Record<string, number> = {};
    const bar2: Record<string, number> = {};
    const controls: Record<string, number | Node> = {};
    const used = new Set(picked.map((c) => c.control));
    for (const [control, b] of Object.entries(BASE)) {
      const change = picked.find((c) => c.control === control);
      const v1 = change ? change.from : b.value;
      const v2 = change ? change.to : b.value;
      bar1[b.internal] = v1;
      bar2[b.internal] = v2;
      if (used.has(control) || control === "lpf")
        controls[control] = v1 === v2 ? v1 : { t: "alt", items: [atom(v1), atom(v2)] };
    }
    for (const c of picked)
      for (const [control, w] of Object.entries(c.with ?? {})) {
        controls[control] = w.value;
        bar1[w.internal] = w.value;
        bar2[w.internal] = w.value;
      }
    const track: TrackSpec = {
      label: "synth",
      src: "note",
      pat: line(names),
      s: ctx.rng.pick(["sawtooth", "square"]),
      gain: jitter(ctx, 0.6),
      controls,
    };
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: 2, tracks: [track] });
    const options = [...new Set(openChanges)];
    return trialOf(piece, { choice: picked.map((c) => c.id) }, cueOf(ctx), {
      mode: "choice",
      multi: picked.length > 1,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, (SOUND_CHANGES[o] as Change).label])),
      controlsByBar: [bar1, bar2],
      prompt: picked.length > 1 ? "Bar 2 changed in two ways. Which two?" : "What changed in bar 2?",
    });
  },
};

// --- fam.snd.roles ------------------------------------------------------------------------------

const ROLE_SOUNDS = {
  bass: ["ebass", "upright", "fingerbass"],
  pad: ["pad", "strings", "organ"],
  lead: ["vibes", "piano", "trumpet"],
} as const;
type Role = keyof typeof ROLE_SOUNDS;
const SOUND_LABELS: Readonly<Record<string, string>> = {
  ebass: "Electric bass",
  upright: "Upright bass",
  fingerbass: "Finger bass",
  pad: "Warm pad",
  strings: "Strings",
  organ: "Organ",
  vibes: "Vibraphone",
  piano: "Piano",
  trumpet: "Trumpet",
};

export const soundRoles: Generator = {
  name: "sound-roles",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const sounds = {
      bass: ctx.rng.pick(ROLE_SOUNDS.bass),
      pad: ctx.rng.pick(ROLE_SOUNDS.pad),
      lead: ctx.rng.pick(ROLE_SOUNDS.lead),
    };
    const chords = [rn("1", "maj"), rn("6", "min"), rn("4", "maj"), rn("5", "maj")];
    const masking = ctx.category === "masking";
    // Masking: one of the two upper parts is voiced down in the bass register (close thirds under C3).
    const muddy: Role = ctx.rng.pick(["pad", "lead"]);
    const voiced = voiceProgression(chords, key);
    // A muddy pad: the same chord tones packed in close position from E2 up, inside the bass register.
    const padNotes = voiced.map((v) => {
      if (!(masking && muddy === "pad")) return v.midis.slice(1);
      const pcs = [...new Set(v.midis.map((m) => ((m % 12) + 12) % 12))];
      let floor = 40;
      return pcs
        .sort((a, b) => above(a, 40) - above(b, 40))
        .map((pc) => {
          const m = above(pc, floor);
          floor = m + 1;
          return m;
        });
    });
    const padBars = padNotes.map((ns) => seq([chordOf(ns.map((m) => spellMidi(m, key).code))]));
    const bassBars = voiced.map((v) =>
      line([spellMidi(above(v.rootPc, 33), key).code, null, spellMidi(above(v.rootPc, 33), key).code, null]),
    );
    const leadOct = masking && muddy === "lead" ? 2 : 4;
    const leadBars = chords.map((_c, i) =>
      line(
        [0, 2, 4, 2].map(
          (s) => spellMidi(stepToMidi(s + ([0, 5, 3, 4][i] as number), key, leadOct), key).code,
        ),
      ),
    );
    const alt = (items: Node[]): Node => ({ t: "alt", items });
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      bars: 4,
      tracks: [
        { label: "bass", src: "note", pat: alt(bassBars), s: sounds.bass, gain: jitter(ctx, 0.8) },
        { label: "pad", src: "note", pat: alt(padBars), s: sounds.pad, gain: jitter(ctx, 0.45) },
        { label: "mel", src: "note", pat: alt(leadBars), s: sounds.lead, gain: jitter(ctx, 0.65) },
      ],
    });
    if (masking) {
      const options = [sounds.pad, sounds.lead];
      return trialOf(piece, { choice: [sounds[muddy]] }, cueOf(ctx), {
        mode: "choice",
        key,
        options,
        optionLabels: Object.fromEntries(options.map((o) => [o, SOUND_LABELS[o] ?? o])),
        muddy,
        prompt: "One part sits down in the bass register and muddies it. Which one?",
      });
    }
    const role = ctx.rng.pick(["bass", "pad", "lead"] as const);
    const options = ctx.rng.shuffle([sounds.bass, sounds.pad, sounds.lead]);
    return trialOf(piece, { choice: [sounds[role]] }, cueOf(ctx), {
      mode: "choice",
      key,
      options,
      optionLabels: Object.fromEntries(options.map((o) => [o, SOUND_LABELS[o] ?? o])),
      role,
      prompt: `Which instrument plays the ${role === "pad" ? "pad (the sustained chords)" : role === "lead" ? "lead (the tune)" : "bass"}?`,
    });
  },
};

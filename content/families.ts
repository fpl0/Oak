// Drill family and fact-deck metadata (contracts §7.3; exercises §4.4 for the ladders). The generators
// and graders live in @oak/drills, bound by `generator`; this file holds the data: ladders, level gates,
// categories with the lesson that teaches each, mastery level, set size and the composite a family joins.
// Rule of §7.3: a category opens only when its lesson is completed, and a level is filled from its open
// categories, so no trial asks for something untaught. Level k samples every category whose gate is at
// or before level k (cumulative ladders).
import {
  type AnswerUiKind,
  type CompositeGroup,
  type DeckId,
  defineDeck,
  defineFamily,
  type FactCardDef,
  type FactDeck,
  type FactId,
  type FamilyCategory,
  type FamilyDef,
  type FamilyDomain,
  type FamilyId,
  type FamilyKind,
  type KeyPool,
  type LessonId,
  type LevelParams,
  type SkillId,
  type SoundId,
} from "@oak/content-kit";
import { FAMILIES as DRILL_FAMILIES, isPendingGenerator } from "@oak/drills";

type KindCode = "C" | "P" | "Pr" | "P/Pr" | "C/P" | "P/C" | "Pr/P";
const KIND: Record<KindCode, [FamilyKind, FamilyKind?]> = {
  C: ["concept"],
  P: ["perceptual"],
  Pr: ["production"],
  "P/Pr": ["perceptual", "production"],
  // A concept family joins no composite (defineFamily), so the C/P row that has a mix leads with P.
  "C/P": ["perceptual", "concept"],
  "P/C": ["perceptual", "concept"],
  "Pr/P": ["production", "perceptual"],
};
const DOMAIN: Record<string, FamilyDomain> = {
  rhy: "rhythm",
  pit: "pitch",
  deg: "degree",
  int: "interval",
  chd: "chord",
  har: "harmony",
  mel: "melody",
  key: "key",
  frm: "form",
  jzz: "jazz",
  snd: "sound",
  code: "code",
  not: "notation",
};

/** [category id, lesson that teaches it, level it first appears at (default 1)]. */
type Cat = [id: string, unlockAt: LessonId, level?: number, contrastOf?: string[]];

interface Row {
  id: FamilyId;
  title: string;
  kind: KindCode;
  nodes: SkillId[];
  mix: CompositeGroup | null;
  cats: Cat[];
  /** Number of levels; default: the highest category level, at least 3. */
  levels?: number;
  mastery?: number;
  answer: AnswerUiKind;
  mic?: boolean;
  trials?: number;
  fastRtMs?: number;
  estTrialSec?: number;
  context?: LevelParams["context"];
  extra?: (level: number) => Record<string, unknown>;
}

const RHYTHM_DOMAINS = new Set(["rhythm", "code", "notation"]);
const KEY_POOLS: KeyPool[] = ["C", "≤2acc", "≤4acc", "all"];

function family(r: Row): FamilyDef {
  const domain = DOMAIN[r.id.split(".")[1] as string] as FamilyDomain;
  const [kind, alsoKind] = KIND[r.kind];
  const n = r.levels ?? Math.max(3, ...r.cats.map((c) => c[2] ?? 1));
  const categories: FamilyCategory[] = r.cats.map(([id, unlockAt, , contrastOf]) => ({
    id,
    unlockAt,
    ...(contrastOf ? { contrastOf } : {}),
  }));
  const levelGates: Record<number, LessonId | LessonId[]> = {};
  for (let k = 2; k <= n; k++) {
    const gates = [...new Set(r.cats.filter((c) => (c[2] ?? 1) === k).map((c) => c[1]))];
    if (gates.length === 1) levelGates[k] = gates[0] as LessonId;
    else if (gates.length > 1) levelGates[k] = gates;
  }
  const instruments: SoundId[] | "drums" = RHYTHM_DOMAINS.has(domain) ? "drums" : ["snd.piano"];
  const levels: LevelParams[] = Array.from({ length: n }, (_, i) => {
    const level = i + 1;
    return {
      categories: r.cats.filter((c) => (c[2] ?? 1) <= level).map((c) => c[0]),
      replays: level <= 2 ? 3 : level <= 4 ? 2 : 1,
      instruments,
      keys: KEY_POOLS[Math.min(KEY_POOLS.length - 1, Math.floor(i / 2))] as KeyPool,
      tempo: [70 + 5 * i, 96 + 8 * i] as [number, number],
      ...(r.context ? { context: r.context } : {}),
      ...(r.extra?.(level) ?? {}),
    };
  });
  const first = r.cats[0]?.[1] as LessonId;
  return defineFamily({
    id: r.id,
    title: r.title,
    kind,
    ...(alsoKind ? { alsoKind } : {}),
    domain,
    skills: r.nodes.map((skill) => ({ skill, w: 1 / r.nodes.length })),
    unlock: { lesson: first, ...(Object.keys(levelGates).length > 0 ? { levelGates } : {}) },
    categories,
    levels,
    masteryLevel: r.mastery ?? Math.min(3, n),
    trialsPerSet: r.trials ?? 6,
    fastRtMs: r.fastRtMs ?? (kind === "concept" ? 4000 : 2500),
    estTrialSec: r.estTrialSec ?? (kind === "production" ? 12 : kind === "concept" ? 10 : 8),
    retention: kind === "concept" ? 0.9 : 0.85,
    mix: kind === "concept" ? null : r.mix,
    answer: r.answer,
    ...(r.mic ? { mic: true } : {}),
    generator: r.id.slice("fam.".length),
  });
}

// biome-ignore format: one family to a block, in the order of contracts §7.3
const ROWS: Row[] = [
  { id: "fam.rhy.pulse", title: "Tap the pulse", kind: "Pr", nodes: ["R01", "E01"], mix: "rhythm", answer: "tap", cats: [["pulse.straight", "U01.L01"], ["pulse.backbeat", "U01.L03", 2], ["pulse.syncopated", "U01.L04", 3]] },
  { id: "fam.rhy.echo", title: "Rhythm echo", kind: "Pr", nodes: ["E01"], mix: "rhythm", answer: "tap", cats: [["echo.quarters", "U01.L04"], ["echo.rests", "U01.L04"], ["echo.eighths", "U01.L04", 2], ["echo.sixteenths", "U01.L06", 3], ["echo.mixed", "U01.L07", 4], ["echo.syncopation", "U13.L01", 5], ["echo.swing", "U11.L07", 6], ["echo.triplets", "U13.L05", 6], ["echo.compound", "U13.L04", 7]] },
  { id: "fam.rhy.read", title: "Read a rhythm", kind: "Pr", nodes: ["N01"], mix: "rhythm", answer: "tap", cats: [["read.quarters", "U01.L05"], ["read.eighths", "U01.L05", 2], ["read.sixteenths", "U01.L06", 3], ["read.dotted-tied", "U13.L03", 4]] },
  { id: "fam.rhy.count", title: "Count the subdivision", kind: "C", nodes: ["R05", "R07"], mix: null, answer: "choice", cats: [["count.eighths", "U01.L04"], ["count.sixteenths", "U01.L06", 2], ["count.triplets", "U13.L05", 3], ["count.compound", "U13.L04", 4]] },
  { id: "fam.rhy.meter", title: "Hear the meter", kind: "P", nodes: ["R08", "R11", "R16"], mix: "rhythm", answer: "choice", levels: 5, cats: [["meter.2-vs-3", "U01.L08"], ["meter.4-vs-3", "U01.L08", 2], ["meter.compound", "U13.L04", 3], ["meter.simple-vs-compound", "U13.L04", 4], ["meter.odd", "R2.L01", 5]] },
  { id: "fam.rhy.dictation", title: "Rhythm dictation", kind: "P", nodes: ["E01", "E14"], mix: "rhythm", answer: "grid", cats: [["dict.quarters", "U01.L09"], ["dict.eighths", "U01.L09", 2], ["dict.sixteenths", "U01.L09", 3], ["dict.fills", "U01.L09", 4], ["dict.syncopated", "U13.L06", 5], ["dict.swung", "U13.L06", 6], ["dict.compound", "U13.L06", 7]] },
  { id: "fam.rhy.groove-lock", title: "Does the bass lock with the kick?", kind: "P", nodes: ["B04"], mix: "rhythm", answer: "choice", cats: [["lock.same", "U08.L04"], ["lock.near", "U08.L04", 2], ["lock.syncopated", "U08.L04", 3]] },
  { id: "fam.rhy.swing", title: "Straight or swung", kind: "P", nodes: ["R13"], mix: "rhythm", answer: "choice", levels: 4, cats: [["swing.straight-vs-shuffle", "U11.L07"], ["swing.amount", "U11.L07", 2], ["swing.subtle", "U11.L07", 3], ["swing.16th", "R1.L02", 4]] },
  { id: "fam.rhy.syncopation", title: "Where is the push?", kind: "P", nodes: ["R10"], mix: "rhythm", answer: "bar-buttons", cats: [["sync.anticipation", "U13.L01"], ["sync.offbeat", "U13.L01", 2], ["sync.sixteenth", "U13.L02", 3]] },
  { id: "fam.rhy.subdivision", title: "Duplets or triplets", kind: "P", nodes: ["R12"], mix: "rhythm", answer: "choice", cats: [["sub.two-vs-three", "U13.L05"], ["sub.four-vs-six", "U13.L05", 2], ["sub.mixed", "U13.L05", 3]] },
  { id: "fam.rhy.odd-grouping", title: "Odd groupings", kind: "P", nodes: ["R16"], mix: "rhythm", answer: "choice", cats: [["odd.5", "R2.L01"], ["odd.7", "R2.L01", 2], ["odd.9", "R2.L02", 3]] },
  { id: "fam.rhy.polyrhythm", title: "Polyrhythm", kind: "P/Pr", nodes: ["R17"], mix: "rhythm", answer: "choice", cats: [["poly.3-2", "R2.L04"], ["poly.hemiola", "R2.L03"], ["poly.4-3", "R2.L04", 2], ["poly.cross-bar", "R2.L05", 3]] },
  { id: "fam.rhy.clave", title: "Clave and direction", kind: "P", nodes: ["R18"], mix: "rhythm", answer: "choice", cats: [["clave.tresillo", "R3.L01"], ["clave.cinquillo", "R3.L01"], ["clave.direction", "R3.L02", 2], ["clave.rumba", "R3.L02", 3]] },
  { id: "fam.pit.match", title: "Match a pitch", kind: "Pr", nodes: ["V01"], mix: "pitch", answer: "mic", mic: true, cats: [["match.tonic", "U00.L02"], ["match.step", "U02.L07", 2], ["match.echo", "U02.L07", 3]] },
  { id: "fam.pit.compare", title: "Higher or lower", kind: "P", nodes: ["E02"], mix: "pitch", answer: "choice", cats: [["cmp.octave", "U02.L01"], ["cmp.fifth", "U02.L01", 2], ["cmp.step", "U02.L01", 3]] },
  { id: "fam.pit.keyboard", title: "Find it on the keyboard", kind: "C", nodes: ["P02", "P04"], mix: null, answer: "keyboard", cats: [["kb.white", "U02.L02"], ["kb.black", "U02.L03", 2], ["kb.enharmonic", "U02.L03", 3]] },
  { id: "fam.pit.steps", title: "Half step or whole step", kind: "P", nodes: ["P03"], mix: "pitch", answer: "choice", cats: [["steps.half-whole", "U02.L03"], ["steps.descending", "U02.L03", 2], ["steps.in-melody", "U02.L03", 3]] },
  { id: "fam.not.read", title: "Read it", kind: "C", nodes: ["N02", "N03", "N07"], mix: null, answer: "code", levels: 4, cats: [["read.treble", "U02.L08"], ["read.accidentals", "U03.L06", 2], ["read.bass", "U05.L06", 3], ["read.leadsheet", "U07.L09", 4]] },
  { id: "fam.key.scale-spell", title: "Spell the scale", kind: "C", nodes: ["S01"], mix: null, answer: "text", levels: 5, cats: [["spell.major-c", "U03.L01"], ["spell.major", "U03.L01", 2], ["spell.natural-minor", "U10.L01", 3], ["spell.harmonic-minor", "U10.L06", 3], ["spell.melodic-minor", "U10.L08", 3], ["spell.pentatonic", "U11.L01", 4], ["spell.blues", "U11.L03", 4], ["spell.mixolydian", "U14.L01", 5], ["spell.dorian", "U14.L03", 5], ["spell.lydian", "U14.L04", 5], ["spell.phrygian", "U14.L05", 5]] },
  { id: "fam.deg.tonic", title: "Find home", kind: "P/Pr", nodes: ["E03"], mix: "pitch", answer: "choice", levels: 5, context: "drone", cats: [["tonic.major-drone", "U03.L01"], ["tonic.major-melody", "U03.L01", 2], ["tonic.major-any", "U03.L01", 3], ["tonic.minor", "U10.L01", 4], ["tonic.modal", "U14.L01", 5]] },
  { id: "fam.deg.fet-major", title: "Degrees in major (functional ear)", kind: "P", nodes: ["E04", "E05"], mix: "pitch", answer: "degree-pad", context: "cadence", cats: [["deg.1", "U03.L02"], ["deg.5", "U03.L02", 1, ["deg.1"]], ["deg.3", "U03.L02", 1, ["deg.1", "deg.5"]], ["deg.2", "U03.L03", 2, ["deg.1", "deg.3"]], ["deg.4", "U03.L03", 2, ["deg.3", "deg.5"]], ["deg.6", "U03.L04", 3, ["deg.5", "deg.7"]], ["deg.7", "U03.L04", 3, ["deg.6", "deg.1"]]] },
  { id: "fam.deg.sing", title: "Sing the degree", kind: "Pr", nodes: ["V02", "V03"], mix: "pitch", answer: "mic", mic: true, cats: [["sing.135", "U03.L02"], ["sing.neighbours", "U03.L03", 2], ["sing.all", "U03.L04", 3]] },
  { id: "fam.deg.index", title: "Degree ↔ n index", kind: "C", nodes: ["S02"], mix: null, answer: "text", levels: 5, cats: [["index.major", "U03.L02"], ["index.negative", "U03.L03", 2], ["index.minor", "U10.L01", 3], ["index.modal", "U14.L01", 4], ["index.chromatic", "U15.L01", 5]] },
  { id: "fam.deg.resolve", title: "Sing it home", kind: "Pr", nodes: ["V03"], mix: "pitch", answer: "mic", mic: true, levels: 4, cats: [["resolve.7-1", "U03.L04"], ["resolve.2-1", "U03.L04", 2], ["resolve.4-3", "U03.L04", 3], ["resolve.minor", "U10.L03", 4]] },
  { id: "fam.key.circle", title: "The circle of fifths", kind: "C", nodes: ["S04", "S06"], mix: null, answer: "text", cats: [["circle.sharps-flats", "U03.L07"], ["circle.relative", "U10.L02", 2], ["circle.parallel", "U10.L02", 3]] },
  { id: "fam.mel.sight", title: "Sight-sing", kind: "Pr", nodes: ["V04"], mix: "pitch", answer: "mic", mic: true, cats: [["sight.steps", "U03.L09"], ["sight.skips", "U03.L09", 2], ["sight.phrases", "U03.L09", 3]] },
  { id: "fam.mel.dictation", title: "Melodic dictation", kind: "P", nodes: ["E07"], mix: "pitch", answer: "degree-pad", levels: 5, mastery: 4, cats: [["mdict.3-steps", "U03.L10"], ["mdict.4-steps", "U03.L10", 2], ["mdict.skips", "U03.L10", 3], ["mdict.phrase", "U03.L10", 4], ["mdict.leaps", "U03.L10", 5]] },
  { id: "fam.mel.echo", title: "Sing it back", kind: "Pr", nodes: ["V03"], mix: "pitch", answer: "mic", mic: true, cats: [["mecho.3", "U03.L10"], ["mecho.4", "U03.L10", 2], ["mecho.5", "U03.L10", 3]] },
  { id: "fam.int.in-key", title: "Intervals in the key", kind: "P", nodes: ["E06"], mix: "pitch", answer: "choice", cats: [["int.2-3", "U04.L01"], ["int.4-5", "U04.L01", 2], ["int.6-8", "U04.L01", 3]] },
  { id: "fam.int.spell", title: "Name the interval", kind: "C", nodes: ["I02", "I03"], mix: null, answer: "text", cats: [["ispell.mp", "U04.L02"], ["ispell.quality", "U04.L02", 2], ["ispell.aug-dim", "U05.L03", 3]] },
  { id: "fam.int.sing", title: "Sing the interval", kind: "Pr", nodes: ["V03"], mix: "pitch", answer: "mic", mic: true, cats: [["isng.up", "U04.L04"], ["isng.down", "U04.L04", 2], ["isng.any", "U04.L04", 3]] },
  { id: "fam.int.isolated", title: "Isolated intervals", kind: "P", nodes: ["E06", "I04"], mix: "pitch", answer: "choice", cats: [["iso.perfect", "U12.L06"], ["iso.thirds-sixths", "U12.L06", 2], ["iso.compound", "U12.L06", 3]] },
  { id: "fam.chd.quality-triad", title: "Triad quality", kind: "P", nodes: ["E08"], mix: "harmony", answer: "quality-pad", cats: [["q.maj-min", "U05.L02"], ["q.dim", "U05.L03", 2], ["q.aug", "U05.L03", 3]] },
  { id: "fam.chd.spell", title: "Spell the chord", kind: "C", nodes: ["C02", "C03", "C07"], mix: null, answer: "text", levels: 4, cats: [["cspell.maj-min", "U05.L02"], ["cspell.dim-aug", "U05.L03", 2], ["cspell.sevenths", "U12.L01", 3], ["cspell.extensions", "J2.L03", 4]] },
  { id: "fam.chd.inversion", title: "Which inversion?", kind: "P", nodes: ["C04"], mix: "harmony", answer: "choice", cats: [["inv.root-first", "U05.L05"], ["inv.second", "U05.L05", 2], ["inv.sevenths", "U12.L04", 3]] },
  { id: "fam.har.rn", title: "Roman numerals", kind: "C", nodes: ["N06"], mix: null, answer: "rn-palette", levels: 5, cats: [["rn.major", "U06.L02"], ["rn.major-any-key", "U06.L02", 2], ["rn.minor", "U10.L04", 3], ["rn.minor-v", "U10.L06", 3], ["rn.sevenths", "U12.L04", 4], ["rn.applied", "U15.L02", 5], ["rn.borrowed", "U16.L01", 5]] },
  { id: "fam.har.function", title: "Tonic, predominant, dominant", kind: "C/P", nodes: ["H02"], mix: "harmony", answer: "choice", levels: 4, cats: [["fn.tpd", "U06.L03"], ["fn.substitutes", "U06.L03", 2], ["fn.minor", "U10.L04", 3], ["fn.sevenths", "U12.L04", 4], ["fn.applied", "U15.L02", 4]] },
  { id: "fam.har.cadence", title: "Which ending?", kind: "P", nodes: ["H03"], mix: "harmony", answer: "choice", levels: 4, cats: [["cad.pac", "U06.L04"], ["cad.hc", "U06.L04", 1, ["cad.pac"]], ["cad.iac", "U06.L04", 2, ["cad.pac"]], ["cad.plagal", "U06.L07", 3], ["cad.deceptive", "U06.L07", 3], ["cad.bvii-i", "U14.L02", 4], ["cad.minor", "U14.L02", 4]] },
  { id: "fam.har.bass", title: "Hear the bass", kind: "P", nodes: ["E09", "V05"], mix: "harmony", answer: "degree-pad", levels: 6, cats: [["bass.145", "U06.L05"], ["bass.1456", "U06.L05", 2], ["bass.all-major", "U06.L05", 3], ["bass.rhythm", "U06.L05", 4], ["bass.minor", "U10.L04", 5], ["bass.chromatic", "U15.L06", 6], ["bass.borrowed", "U16.L05", 6]] },
  { id: "fam.har.schema", title: "Name the schema", kind: "P", nodes: ["H04", "H05"], mix: "harmony", answer: "choice", levels: 6, cats: [["schema.axis", "U06.L06"], ["schema.three-chord", "U06.L06"], ["schema.axis-vi", "U06.L07", 2], ["schema.doo-wop", "U06.L07", 2], ["schema.aeolian", "U10.L07", 3], ["schema.andalusian", "U10.L07", 3], ["schema.blues12", "U11.L05", 4], ["schema.mixolydian", "U14.L06", 5], ["schema.dorian-vamp", "U14.L06", 5], ["schema.ii-v-i", "J1.L03", 6]] },
  { id: "fam.har.progression", title: "Progression dictation", kind: "P", nodes: ["E09"], mix: "harmony", answer: "rn-palette", levels: 6, cats: [["prog.primary", "U06.L09"], ["prog.with-ii-vi", "U06.L09", 2], ["prog.all-diatonic", "U06.L09", 3], ["prog.minor", "U10.L04", 4], ["prog.sevenths", "U12.L04", 5], ["prog.chromatic", "U16.L05", 6]] },
  { id: "fam.mel.nct", title: "Non-chord tones", kind: "P/C", nodes: ["M04", "M05"], mix: "pitch", answer: "choice", cats: [["nct.passing", "U07.L04"], ["nct.neighbour", "U07.L04"], ["nct.appoggiatura", "U07.L05", 2], ["nct.suspension", "U07.L05", 2], ["nct.mixed", "U07.L05", 3]] },
  { id: "fam.frm.sections", title: "Hear the form", kind: "P", nodes: ["F02", "F03"], mix: "harmony", answer: "choice", cats: [["form.verse-chorus", "U09.L03"], ["form.aaba", "U09.L03", 2], ["form.strophic", "U09.L03", 3]] },
  { id: "fam.key.mode", title: "Which mode?", kind: "P", nodes: ["E10"], mix: "pitch", answer: "choice", levels: 5, cats: [["mode.major-minor", "U10.L01"], ["mode.major-minor-melody", "U10.L01", 2], ["mode.mixolydian", "U14.L03", 3], ["mode.dorian", "U14.L03", 4], ["mode.lydian-phrygian", "U14.L05", 5]] },
  { id: "fam.deg.fet-minor", title: "Degrees in minor", kind: "P", nodes: ["E10"], mix: "pitch", answer: "degree-pad", context: "cadence", cats: [["mdeg.1-b3-5", "U10.L03"], ["mdeg.2-4", "U10.L03", 2], ["mdeg.b6-b7", "U10.L03", 3]] },
  { id: "fam.frm.blues", title: "Blues form", kind: "P/C", nodes: ["F04"], mix: "harmony", answer: "bar-buttons", levels: 4, cats: [["blues.where", "U11.L05"], ["blues.quick-change", "U11.L05", 2], ["blues.turnaround", "U11.L05", 3], ["blues.jazz", "J4.L02", 4]] },
  { id: "fam.chd.quality-7th", title: "Seventh-chord quality", kind: "P", nodes: ["E11"], mix: "harmony", answer: "quality-pad", levels: 5, cats: [["q7.dom-maj", "U12.L02"], ["q7.min", "U12.L02", 2], ["q7.half-dim-dim", "U12.L03", 3], ["q7.all", "U12.L03", 4], ["q7.sixths", "J1.L02", 5], ["q7.minor-major", "J2.L02", 5]] },
  { id: "fam.deg.fet-chromatic", title: "Chromatic degrees", kind: "P", nodes: ["E12a"], mix: "pitch", answer: "degree-pad", context: "cadence", cats: [["chr.#4-b7", "U15.L01"], ["chr.b3-b6", "U15.L01", 2], ["chr.b2-#5-#1", "U15.L01", 3]] },
  { id: "fam.har.chromatic", title: "Secondary and borrowed chords", kind: "P", nodes: ["H12", "E12b"], mix: "harmony", answer: "rn-palette", cats: [["chrom.v-of-v", "U15.L06"], ["chrom.secondaries", "U15.L06", 2], ["chrom.borrowed", "U16.L05", 3]] },
  { id: "fam.har.modulation", title: "Did the key change?", kind: "P", nodes: ["E13"], mix: "harmony", answer: "bar-buttons", cats: [["mod.lift", "U17.L03"], ["mod.pivot", "U17.L03", 2], ["mod.where", "U17.L03", 3]] },
  { id: "fam.jzz.ii-v", title: "ii–V–I in every key", kind: "P", nodes: ["J04", "J05"], mix: "harmony", answer: "choice", cats: [["iiv.major", "J1.L03"], ["iiv.minor", "J2.L02", 2], ["iiv.chains", "J2.L02", 3]] },
  { id: "fam.jzz.guide", title: "Guide tones", kind: "Pr/P", nodes: ["J07", "V06"], mix: "harmony", answer: "mic", mic: true, cats: [["guide.3-7", "J1.L04"], ["guide.lines", "J1.L04", 2], ["guide.keys", "J1.L04", 3]] },
  { id: "fam.jzz.voicing", title: "Voicings", kind: "C", nodes: ["J08", "J09"], mix: null, answer: "keyboard", cats: [["voice.shells", "J1.L05"], ["voice.rootless", "J3.L01", 2], ["voice.drop2", "J3.L02", 3]] },
  { id: "fam.jzz.extension", title: "Hear the extension", kind: "P", nodes: ["J02"], mix: "harmony", answer: "choice", cats: [["ext.9", "J2.L03"], ["ext.11-13", "J2.L03", 2], ["ext.altered", "J2.L03", 3]] },
  { id: "fam.jzz.chord-scale", title: "Chord-scales", kind: "C", nodes: ["J03"], mix: null, answer: "choice", cats: [["cs.dorian-mixo-ionian", "J2.L04"], ["cs.lydian", "J2.L04", 2], ["cs.altered-locrian", "J2.L04", 3]] },
  { id: "fam.jzz.subs", title: "Substitutions", kind: "P", nodes: ["J13"], mix: "harmony", answer: "choice", cats: [["sub.tritone", "J5.L01"], ["sub.backdoor", "J5.L02", 2], ["sub.mixed", "J5.L02", 3]] },
  { id: "fam.snd.params", title: "What changed in the sound?", kind: "P", nodes: ["D03", "D04", "D05"], mix: "harmony", answer: "choice", cats: [["snd.filter", "A1.L02"], ["snd.envelope", "A1.L03", 2], ["snd.space", "A1.L04", 3]] },
  { id: "fam.snd.roles", title: "Roles and registers", kind: "P", nodes: ["D08"], mix: "harmony", answer: "choice", cats: [["roles.register", "A2.L01"], ["roles.mud", "A2.L01", 2], ["roles.mix", "A2.L01", 3]] },
  { id: "fam.code.mini", title: "Mini-notation", kind: "C", nodes: ["R05"], mix: null, answer: "code", levels: 6, mastery: 4, cats: [["R03/code.mini.seq", "U01.L02"], ["R03/code.mini.repeat", "U01.L02"], ["R06/code.mini.rest", "U01.L02"], ["R05/code.mini.sub", "U01.L04", 2], ["N01/code.mini.elongate", "U01.L05", 3], ["N01/code.mini.hold", "U01.L05", 3], ["R07/code.mini.replicate", "U01.L06", 3], ["R04/code.mini.alt", "U01.L07", 4], ["I05/code.mini.stack", "U04.L03", 5], ["R18/code.mini.euclid", "R3.L03", 6], ["R17/code.mini.polymeter", "R2.L05", 6]] },
  { id: "fam.code.functions", title: "Functions", kind: "C", nodes: ["S02"], mix: null, answer: "code", cats: [["S02/code.fn.scale", "U03.L02"], ["S03/code.fn.scale-patterned", "U03.L05"], ["I02/code.fn.transpose", "U04.L02", 2], ["C01/code.fn.arp", "U05.L04", 2], ["H01/code.fn.add", "U06.L01", 2], ["M02/code.fn.rev", "U07.L02", 3], ["M02/code.fn.scale-transpose", "U07.L02", 3], ["B01/code.fn.root-notes", "U08.L01", 3]] },
];

/** fam.code.* categories carry their node: `R05/code.mini.sub` (contracts §7.3 "category per operator"). */
function withCategorySkills(def: FamilyDef): FamilyDef {
  if (!def.id.startsWith("fam.code.")) return def;
  return defineFamily({
    ...def,
    categories: def.categories.map((c) => ({ ...c, skill: c.id as `${SkillId}/${string}` })),
  });
}

const COMPOSITES: FamilyDef[] = (["pitch", "harmony", "rhythm"] as const).map((group) => {
  const members = ROWS.filter((r) => r.mix === group && KIND[r.kind][0] !== "concept").filter((r) =>
    DRILL_FAMILIES.some((f) => f.id === r.id),
  );
  const first: Record<typeof group, LessonId> = { pitch: "U00.L02", harmony: "U05.L02", rhythm: "U01.L01" };
  return defineFamily({
    id: `fam.mix.${group}` as FamilyId,
    title: `Mixed ${group}`,
    kind: "perceptual",
    domain: group === "harmony" ? "harmony" : group === "rhythm" ? "rhythm" : "pitch",
    skills: [...new Set(members.flatMap((m) => m.nodes))].map((skill, _, all) => ({
      skill,
      w: 1 / all.length,
    })),
    unlock: { lesson: first[group] },
    categories: members.map((m) => ({ id: m.id, unlockAt: m.cats[0]?.[1] as LessonId })),
    levels: [
      {
        categories: members.map((m) => m.id),
        replays: 2,
        instruments: group === "rhythm" ? "drums" : ["snd.piano"],
        keys: "≤4acc",
        tempo: [72, 120],
      },
    ],
    masteryLevel: 1,
    trialsPerSet: 8,
    fastRtMs: 2500,
    estTrialSec: 8,
    retention: 0.85,
    mix: group,
    answer: "choice",
    generator: `mix.${group}`,
  });
});

/**
 * The playable catalog. The drill engine (@oak/drills) owns each family's generator, ladder and
 * categories (property-tested against headless Strudel), so the course re-exports them rather than
 * re-typing them; ROWS above stays the §7.3 table the contracts-sync test checks the catalog against
 * (FAMILY_TABLE) and the source of the three composite reviews, which plan sets from their members.
 */
// A family whose generator is still pending in @oak/drills keeps the §7.3 data authored here (categories
// per operator, under the node of their unlocking lesson) with the drills' pending generator name, so
// the registry skips it until the generator lands.
const ROW_BY_ID = new Map<string, Row>(ROWS.map((r) => [r.id, r]));
export const families: readonly FamilyDef[] = [
  ...DRILL_FAMILIES.map((f) => {
    const row = ROW_BY_ID.get(f.id);
    return row && isPendingGenerator(f.generator)
      ? withCategorySkills({ ...family(row), generator: f.generator })
      : f;
  }),
  ...COMPOSITES,
];

/** Ear-training stages A–H of the plan (contracts §7.3). */
export const EAR_STAGES: Readonly<Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "H", FamilyId[]>> = {
  A: ["fam.rhy.pulse", "fam.rhy.echo", "fam.pit.match", "fam.pit.compare", "fam.deg.tonic"],
  B: ["fam.deg.fet-major", "fam.deg.sing", "fam.deg.resolve"],
  C: ["fam.int.in-key", "fam.mel.dictation", "fam.mel.echo"],
  D: ["fam.chd.quality-triad", "fam.har.bass", "fam.har.schema", "fam.har.cadence", "fam.chd.inversion"],
  E: ["fam.deg.fet-minor", "fam.chd.quality-7th", "fam.frm.blues", "fam.key.mode"],
  F: ["fam.deg.fet-chromatic", "fam.har.chromatic", "fam.har.modulation"],
  G: [
    "fam.jzz.ii-v",
    "fam.jzz.guide",
    "fam.jzz.voicing",
    "fam.jzz.extension",
    "fam.jzz.chord-scale",
    "fam.jzz.subs",
  ],
  H: ["fam.rhy.syncopation", "fam.rhy.swing", "fam.rhy.clave", "fam.rhy.odd-grouping"],
};

// --- fact decks ---------------------------------------------------------------------------------

const TREBLE = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5"];
const BASS = ["E2", "F2", "G2", "A2", "B2", "C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"];
const staffCard = (clef: "treble" | "bass", note: string, gate?: LessonId): FactCardDef => ({
  id: `fact.staff.${clef}.${note}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: { staff: { clef, notes: [note] } },
  answer: { text: [note.replace(/\d/, "")] },
});

const SHARP_KEYS = ["G", "D", "A", "E", "B", "F#"];
const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db"];
/** Relative minors of the keys above, same signatures. */
const MINOR_KEYS: [string, number][] = [
  ["E", 1],
  ["B", 2],
  ["F#", 3],
  ["C#", 4],
  ["D", -1],
  ["G", -2],
  ["C", -3],
  ["F", -4],
];
const sigText = (n: number): string => (n === 0 ? "no sharps or flats" : n > 0 ? `${n}#` : `${-n}b`);
const keyCard = (
  tonic: string,
  mode: "major" | "minor",
  accidentals: number,
  gate?: LessonId,
): FactCardDef => ({
  id: `fact.keysig.${tonic.replace("#", "s")}-${mode}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: {
    text: `How many sharps or flats in ${tonic.replace("#", "♯").replace(/^([A-G])b/, "$1♭")} ${mode}?`,
  },
  answer: { text: [sigText(accidentals)] },
});

/** [quality symbol suffix, display name, gate]. Roots are fixed so the deck stays small. */
const CHORD_SYMBOLS: [string, string, LessonId][] = [
  ["", "major", "U05.L04"],
  ["m", "minor", "U05.L04"],
  ["o", "diminished", "U05.L04"],
  ["aug", "augmented", "U05.L04"],
  ["7", "dominant seventh", "U11.L04"],
  ["^7", "major seventh", "U12.L01"],
  ["m7", "minor seventh", "U12.L01"],
  ["m7b5", "half-diminished seventh", "U12.L03"],
  ["o7", "diminished seventh", "U12.L03"],
  ["6", "major sixth", "J1.L02"],
  ["m6", "minor sixth", "J1.L02"],
  ["sus", "suspended", "J1.L02"],
];
const ROOTS = ["C", "F", "G", "D", "Bb"];

export const decks: readonly FactDeck[] = [
  defineDeck({
    id: "deck.pit.staff-names" as DeckId,
    title: "Staff note names",
    unlock: { skill: "N02", lesson: "U02.L04" },
    cards: [
      ...TREBLE.map((n) => staffCard("treble", n)),
      ...BASS.map((n) => staffCard("bass", n, "U05.L06")),
    ],
    newPerDay: 4,
    fastRtMs: 2500,
    answer: "text",
  }),
  defineDeck({
    id: "deck.key.signature" as DeckId,
    title: "Key signatures",
    unlock: { skill: "S04", lesson: "U03.L06" },
    cards: [
      ...SHARP_KEYS.map((k, i) => keyCard(k, "major", i + 1)),
      ...FLAT_KEYS.map((k, i) => keyCard(k, "major", -(i + 1), "U03.L07")),
      ...MINOR_KEYS.map(([k, n]) => keyCard(k, "minor", n, "U10.L02")),
    ],
    newPerDay: 3,
    fastRtMs: 3000,
    answer: "text",
  }),
  defineDeck({
    id: "deck.chd.symbols" as DeckId,
    title: "Chord symbols",
    unlock: { skill: "N05", lesson: "U05.L04" },
    cards: CHORD_SYMBOLS.flatMap(([suffix, name, gate]) =>
      ROOTS.map(
        (root): FactCardDef => ({
          id: `fact.chord.${root}${suffix.replace("^", "maj").replace("o", "dim")}` as FactId,
          ...(gate !== "U05.L04" ? { gate } : {}),
          prompt: { text: `Write the chord symbol for ${root.replace(/^([A-G])b/, "$1♭")} ${name}.` },
          answer: { text: [`${root}${suffix}`] },
        }),
      ),
    ),
    newPerDay: 3,
    fastRtMs: 3000,
    answer: "text",
  }),
];

export const familyById: ReadonlyMap<string, FamilyDef> = new Map(families.map((f) => [f.id, f] as const));
export const deckById: ReadonlyMap<string, FactDeck> = new Map(decks.map((d) => [d.id, d] as const));

/** The §7.3 table as data for the contracts-sync test: id → [kind code, unlock lesson, nodes, mix]. */
export const FAMILY_TABLE: ReadonlyMap<
  string,
  { kind: KindCode; unlock: LessonId; nodes: SkillId[]; mix: CompositeGroup | null }
> = new Map(
  ROWS.map(
    (r) => [r.id, { kind: r.kind, unlock: r.cats[0]?.[1] as LessonId, nodes: r.nodes, mix: r.mix }] as const,
  ),
);

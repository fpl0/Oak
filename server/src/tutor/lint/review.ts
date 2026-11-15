// The review lint (Wave 6, d2). A live C5 review wrote its try-it code in F for a piece in C, joined inline
// patterns with `arrange()` instead of section consts, and said "perfect authentic cadence". The persona and the
// review context now state the piece's key, the section-const form and the vocabulary rule; this is the second
// layer, on what the model writes back. A review that breaks one of the three is refused with a problem the model
// can read, and it may repair it once (the same resubmission every other review problem gets).
//
//  1. `tryKeyProblem`: try-it code in another key than the piece (its `.scale()` home notes, or its chord symbols).
//  2. `arrangeProblems`: `arrange()` that breaks STYLE §10 (section consts named <role><Section>, one arrange per
//     labelled track, nothing wrapping it, the same bar counts on every arranged track).
//  3. `proseProblems`: a harmony term the learner has not met, or one the course never uses.
//
// The tutor imports no package, so the little theory needed (pitch classes, the triads of a key) is here. Pure.
import { parse } from "acorn";
import { scaleKeysOf } from "../answer-guard.ts";
import { MODE_DEGREES, modeOf, tonicPcOf } from "../vocabulary.ts";

export interface ReviewLintContext {
  /** The piece's key, or each key of its key plan (`"C major"`, `"D major"`). Empty: unknown, nothing is checked. */
  keys: readonly string[];
  /** Introduced term IDs; `null` when the whole list is not known (then only never-taught terms are refused). */
  introduced: ReadonlySet<string> | null;
}

// --- 1. the key of a try-it -----------------------------------------------------------------------------------------

const DEGREE_STEPS: Readonly<Record<string, number>> = {
  "1": 0,
  b2: 1,
  "2": 2,
  b3: 3,
  "3": 4,
  "4": 5,
  "#4": 6,
  b5: 6,
  "5": 7,
  b6: 8,
  "6": 9,
  b7: 10,
  "7": 11,
};

const NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** The triads a key calls its own, as `rootPc:quality` (`m`, `o`, or `` for major). */
function triadsOf(tonic: number, mode: string): Set<string> {
  const scale = (MODE_DEGREES[mode] ?? (MODE_DEGREES.major as readonly string[])).map(
    (d) => (tonic + (DEGREE_STEPS[d] ?? 0)) % 12,
  );
  const out = new Set<string>();
  if (scale.length !== 7) {
    // A pentatonic or blues key: its chords are those of the parallel major and minor on the same home note.
    for (const m of ["major", "minor"]) for (const t of triadsOf(tonic, m)) out.add(t);
    for (const step of [0, 5, 7]) out.add(`${(tonic + step) % 12}:`);
    return out;
  }
  scale.forEach((root, i) => {
    const third = ((scale[(i + 2) % 7] as number) - root + 12) % 12;
    const fifth = ((scale[(i + 4) % 7] as number) - root + 12) % 12;
    out.add(`${root}:${fifth === 6 ? "o" : third === 3 ? "m" : ""}`);
  });
  // Minor as Oak teaches it: the major V (and its vii°) from the raised 7.
  if (mode === "minor" || mode === "harmonic minor" || mode === "melodic minor") {
    out.add(`${(tonic + 7) % 12}:`);
    out.add(`${(tonic + 11) % 12}:o`);
  }
  return out;
}

/** Chord symbols of every `chord("…")` in a snippet, as root pitch class and triad quality, in order. */
export function chordsIn(code: string): { pc: number; quality: "" | "m" | "o"; symbol: string }[] {
  const out: { pc: number; quality: "" | "m" | "o"; symbol: string }[] = [];
  for (const m of code.matchAll(/\bchord\(\s*["'`]([^"'`]*)["'`]/g)) {
    for (const raw of (m[1] as string).replace(/[<>[\]{},~]/g, " ").split(/\s+/)) {
      const sym = raw.replace(/[!@*]\d+(?:\.\d+)?$/, "");
      const p = /^([A-G][#b]?)(.*)$/.exec(sym);
      const pc = p ? tonicPcOf(p[1]) : null;
      if (!p || pc === null) continue;
      const rest = (p[2] as string).replace(/\/[A-G][#b]?$/, "");
      const quality = /^(?:o|dim|m7b5|h)/.test(rest) ? "o" : /^m(?!aj)/.test(rest) ? "m" : "";
      out.push({ pc, quality, symbol: sym });
    }
  }
  return out;
}

const keyLabel = (pc: number, mode: string) => `${NAMES[pc]} ${mode}`;

/**
 * Why a try-it is in another key than the piece, or null. With a `.scale()`: every scale's home note must be a home
 * note of the piece. With chord symbols only: refused when another key holds more of its chords than the piece's
 * key does, the snippet starts or ends on that key's home chord, and it neither starts nor ends on the piece's.
 * (So a borrowed ♭VII or a V of V inside the piece's key is fine; a I–IV–V–I in F for a piece in C is not.)
 */
export function tryKeyProblem(code: string, keys: readonly string[]): string | null {
  const piece = keys
    .map((k) => ({ text: k, pc: tonicPcOf(k), mode: modeOf(k) ?? "major" }))
    .filter((k): k is { text: string; pc: number; mode: string } => k.pc !== null);
  if (piece.length === 0) return null;
  const pieceText = piece.map((k) => k.text).join(" or ");
  const homes = new Set(piece.map((k) => k.pc));

  for (const k of scaleKeysOf(code)) {
    const pc = tonicPcOf(k.tonic);
    if (pc === null || homes.has(pc)) continue;
    return `written in ${k.tonic.replace("b", "♭").replace("#", "♯")} ${k.mode} (its .scale()); the piece is in ${pieceText}: write the try-it in ${pieceText}`;
  }

  const chords = chordsIn(code);
  if (chords.length < 2) return null;
  const fit = (pc: number, mode: string) => {
    const own = triadsOf(pc, mode);
    return chords.filter((c) => own.has(`${c.pc}:${c.quality}`)).length;
  };
  const pieceFit = Math.max(...piece.map((k) => fit(k.pc, k.mode)));
  const first = chords[0] as (typeof chords)[number];
  const last = chords.at(-1) as (typeof chords)[number];
  if (homes.has(first.pc) || homes.has(last.pc)) return null;
  let best: { pc: number; mode: string; n: number; rank: number } | null = null;
  for (let pc = 0; pc < 12; pc++)
    for (const mode of ["major", "minor"]) {
      if (homes.has(pc)) continue;
      // The snippet has to sit on that key's home chord: it starts or ends there, in the key's own quality.
      const home = (c: (typeof chords)[number]) => c.pc === pc && c.quality === (mode === "minor" ? "m" : "");
      if (!home(first) && !home(last)) continue;
      const n = fit(pc, mode);
      // Between keys that hold the same chords (relatives), the one the snippet ends on reads as home.
      const rank = n * 2 + (home(last) ? 1 : 0);
      if (n > pieceFit && (best === null || rank > best.rank)) best = { pc, mode, n, rank };
    }
  if (best === null) return null;
  return `reads in ${keyLabel(best.pc, best.mode)} (chords ${chords.map((c) => c.symbol).join(" ")}); the piece is in ${pieceText}: write the try-it in ${pieceText}`;
}

// --- 2. arrange() as STYLE §10 writes it -------------------------------------------------------------------------

interface AnyNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}
const isNode = (v: unknown): v is AnyNode =>
  typeof v === "object" && v !== null && typeof (v as AnyNode).type === "string";

/** STYLE §10 item 1: `<role><Section>` in camelCase, an optional digit for a variant. */
export const SECTION_CONST =
  /^[a-z][a-z0-9]*(?:Intro|Verse|Pre|PreChorus|Prechorus|Chorus|Bridge|Solo|Break|Head|Vamp|Lift|Outro|[A-H])\d?$/;

function arrangeCalls(node: unknown, parents: AnyNode[], out: { call: AnyNode; parents: AnyNode[] }[]): void {
  if (Array.isArray(node)) {
    for (const child of node) arrangeCalls(child, parents, out);
    return;
  }
  if (!isNode(node)) return;
  if (node.type === "CallExpression" && isNode(node.callee)) {
    const callee = node.callee;
    const named =
      (callee.type === "Identifier" && callee.name === "arrange") ||
      (callee.type === "MemberExpression" &&
        isNode(callee.property) &&
        callee.property.type === "Identifier" &&
        callee.property.name === "arrange");
    if (named) out.push({ call: node, parents: [...parents] });
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range") continue;
    const child = node[key];
    if (typeof child === "object" && child !== null) arrangeCalls(child, [...parents, node], out);
  }
}

/**
 * What breaks STYLE §10 in a snippet's `arrange()` calls; empty when there is none or all are in form. A snippet
 * that does not parse says nothing here (the strict lint has already refused it).
 */
export function arrangeProblems(code: string): string[] {
  if (!/\barrange\s*\(/.test(code)) return [];
  let program: AnyNode;
  try {
    program = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
    }) as unknown as AnyNode;
  } catch {
    return [];
  }
  const consts = new Set<string>();
  for (const st of program.body as AnyNode[])
    if (st.type === "VariableDeclaration")
      for (const d of st.declarations as AnyNode[])
        if (isNode(d.id) && d.id.type === "Identifier") consts.add(d.id.name as string);

  const calls: { call: AnyNode; parents: AnyNode[] }[] = [];
  arrangeCalls(program, [], calls);
  const problems = new Set<string>();
  const shapes: string[] = [];
  for (const { call, parents } of calls) {
    // Its place: the head of a labelled track's own method chain (`chords: arrange(…).s("piano")`), nothing around it.
    let child: AnyNode = call;
    let labelled = false;
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i] as AnyNode;
      const chain =
        (p.type === "MemberExpression" && p.object === child) ||
        (p.type === "CallExpression" && p.callee === child) ||
        (p.type === "ExpressionStatement" && p.expression === child);
      if (p.type === "LabeledStatement") {
        labelled = p.body === child;
        break;
      }
      if (!chain) break;
      child = p;
    }
    if (!labelled)
      problems.add(
        'arrange() belongs at the head of one labelled track (chords: arrange(…).s("piano")): one arrange() per track, nothing wrapping it',
      );
    const bars: string[] = [];
    for (const arg of call.arguments as unknown[]) {
      const pair = isNode(arg) && arg.type === "ArrayExpression" ? (arg.elements as unknown[]) : null;
      const section = pair?.[1];
      if (pair === null || pair.length !== 2 || !isNode(section)) {
        problems.add("each arrange() entry is a pair [bars, sectionConst], like [4, chordsVerse]");
        continue;
      }
      const count = pair[0];
      bars.push(isNode(count) && count.type === "Literal" ? String(count.value) : "?");
      if (section.type !== "Identifier") {
        problems.add(
          'arrange() joins section consts, not inline patterns: declare each section first (const chordsVerse = chord("<C F>")…) and write [4, chordsVerse]',
        );
        continue;
      }
      const name = section.name as string;
      if (name === "silence") continue;
      if (!consts.has(name))
        problems.add(`arrange() uses ${name}, which the try-it does not declare as a const`);
      else if (!SECTION_CONST.test(name))
        problems.add(
          `section consts are named <role><Section> (chordsVerse, melChorus2); ${name} is not such a name`,
        );
    }
    shapes.push(bars.join(" "));
  }
  if (new Set(shapes).size > 1)
    problems.add("every arranged track lists the same sections with the same bar counts");
  return [...problems];
}

// --- 3. harmony terms in the prose ----------------------------------------------------------------------------------

interface TermRule {
  re: RegExp;
  /** The glossary term the phrase needs (content/terms.ts), or `null`: the course never uses this name. */
  term: string | null;
  /** What to say instead. */
  say: string;
}

const t = (re: RegExp, term: string | null, say: string): TermRule => ({ re, term, say });

/**
 * Harmony names a review may reach for, longest first (a longer name is judged before the shorter one inside it).
 * `term: null` names the course never teaches in the core; the rest wait for their glossary term. Everyday words
 * (chord, bass, groove, home, resolve) are not here: this is a list of names, not a dictionary.
 * wave6.music.test.ts checks every ID against content/terms.ts.
 */
export const HARMONY_TERMS: readonly TermRule[] = [
  t(
    /\b(?:im)?perfect[\s-]+authentic[\s-]+cadences?\b|\b[PI]AC\b/i,
    null,
    'say "authentic cadence" once the learner has met it, or "the V chord going home to I"',
  ),
  t(/\bcadential[\s-]+(?:six[\s-]four|6[\s/-]4)\b/i, null, "describe the chords by degree"),
  t(/\bneapolitan\b/i, null, "describe the chord by its degrees"),
  t(/\baugmented[\s-]+sixth\b/i, null, "describe the chord by its degrees"),

  t(/\bmodal[\s-]+interchange\b/i, null, 'the course says "borrowed chord" and "modal mixture"'),
  t(
    /\bsecondary[\s-]+leading[\s-]+tone\b/i,
    null,
    'the course says "applied vii°" after tonicization is met',
  ),
  t(
    /\b(?:subdominant|sub-dominant)\b/i,
    null,
    'the course says "predominant", or the IV chord by its degree',
  ),
  t(/\b(?:submediant|mediant|supertonic)\b/i, null, "name the chord by its degree number"),
  t(/\bvoice[\s-]+exchange\b/i, null, "describe which notes swap"),
  t(/\bionian\b/i, null, 'the course says "major"'),
  // --- Wave 7: the advanced tracks' names, each waiting for its glossary term (longest first) ---
  t(/\bsecondary[\s-]+ii\s*[–-]?\s*V\b/i, "term.secondary-ii-v", "a ii–V aimed at a chord other than home"),
  t(
    /\bminor\s+ii\s*[–-]\s*V\s*[–-]\s*i\b/,
    "term.minor-ii-v-i",
    "the chords on 2 and 5 going home to a minor 1",
  ),
  t(
    /\bii\s*[–-]\s*V(?:\s*[–-]\s*I)?\b|\b[Tt]wo[\s-]+five(?:[\s-]+one)?\b/,
    "term.ii-v-i",
    "the chords on 2 and 5 going home to 1",
  ),
  t(/\btritone[\s-]+sub(?:stitution|stitute|s)?\b/i, "term.tritone-sub", "the dominant a tritone away"),
  t(/\bbackdoor\b/i, "term.backdoor", "home from the chord on lowered 7"),
  t(
    /\bpassing[\s-]+diminished(?:[\s-]+(?:sevenths?|chords?))?\b/i,
    "term.passing-diminished",
    "a diminished chord between two chords a whole step apart",
  ),
  t(
    /\bcoltrane[\s-]+changes\b/i,
    "term.coltrane-changes",
    "keys a major 3rd apart, each reached by its own V7",
  ),
  t(/\bcontrafacts?\b/i, "term.contrafact", "a new tune over borrowed chords"),
  t(/\brhythm[\s-]+changes\b/i, "term.rhythm-changes", "the 32-bar chords of I Got Rhythm"),
  t(/\bjazz[\s-]+blues\b/i, "term.jazz-blues", "the 12-bar blues with ii–Vs"),
  t(/\bwalking[\s-]+bass(?:[\s-]?lines?)?\b/i, "term.walking-bass", "a bass note on every beat"),
  t(/\bcharleston\b/i, "term.charleston", "beat 1 and the 'and' of 2"),
  t(/\bdrop[\s-]*(?:2|two)\b/i, "term.drop-2", "which chord note is moved down an octave"),
  t(/\bclose[\s-]+position\b/i, "term.close-position", "all the chord's notes inside one octave"),
  t(
    /\brootless\s+A\b|\b(?:[Aa]n?|[Tt]he|[Ii]ts)\s+A[\s-]+voicings?\b|\bA-voicings?\b|\bA\s+voicings\b/,
    "term.a-voicing",
    "the chord without its root, 3rd at the bottom",
  ),
  t(
    /\brootless\s+B\b|\b(?:[Aa]n?|[Tt]he|[Ii]ts)\s+B[\s-]+voicings?\b|\bB-voicings?\b|\bB\s+voicings\b/,
    "term.b-voicing",
    "the chord without its root, 7th at the bottom",
  ),
  t(/\bshell[\s-]+(?:voicings?|chords?)\b|\bshells\b/i, "term.shell-voicing", "root, 3rd and 7th only"),
  t(
    /\baltered[\s-]+scales?\b|\blocrian\b|\bchord[\s-]+scales?\b/i,
    "term.chord-scale",
    "the scale that fits the chord",
  ),
  t(
    /\baltered[\s-]+(?:dominants?|chords?)\b/i,
    "term.altered-dominant",
    "a dominant with its 9th or 5th bent",
  ),
  t(/\bavoid[\s-]+notes?\b/i, "term.avoid-note", "a held note a half step above a chord tone"),
  t(/\bcycle[\s-]+of[\s-]+(?:fourths|fifths)\b/i, "term.cycle-of-fourths", "each key a 4th above the last"),
  t(/\bride[\s-]+pattern\b/i, "term.ride-pattern", "the swing drummer's cymbal rhythm"),
  t(
    /\bsus[\s-]*[24]?[\s-]+chords?\b|\bsuspended[\s-]+chords?\b/i,
    "term.sus-chord",
    "the 4th in place of the 3rd",
  ),
  t(/\bsixth[\s-]+chords?\b|\badded[\s-]+sixth\b/i, "term.sixth-chord", "the chord with its 6th added"),
  t(/\bmetric[\s-]+modulation\b/i, "term.metric-modulation", "the same pulse heard in a new grouping"),
  t(/\bmetric[\s-]+weight\b/i, "term.metric-weight", "how strong each place in the bar is"),
  t(/\bswing[\s-]+ratio\b/i, "term.swing-ratio", "how much longer the long note is"),
  t(/\bhemiolas?\b/i, "term.hemiola", "six pulses as threes, then twos"),
  t(/\bpolyrhythm\w*\b/i, "term.polyrhythm", "two even pulses at once"),
  t(/\bpolymet(?:er|re|ric)\w*\b/i, "term.polymeter", "patterns of different lengths over one pulse"),
  t(/\bodd[\s-]+(?:meters?|metres?|time)\b/i, "term.odd-meter", "a bar of uneven beats"),
  t(/\btresillo\b/i, "term.tresillo", "three hits over eight pulses"),
  t(/\bcinquillo\b/i, "term.cinquillo", "five hits over eight pulses"),
  t(/\bclaves?\b/i, "term.clave", "the two-bar pattern the groove lines up with"),
  t(/\beuclid(?:ean)?\b/i, "term.euclidean-rhythm", "hits spread as evenly as possible"),
  t(/\bmontunos?\b/i, "term.montuno", "the repeating piano figure"),
  t(/\btumbaos?\b/i, "term.tumbao", "the bass figure on the 'and' of 2 and on 4"),
  t(/\blaid[\s-]+back\b/i, "term.laid-back", "a few milliseconds behind the beat"),
  t(/\binterlock\w*\b/i, "term.interlock", "parts that fill each other's gaps"),
  t(/\bdisplace(?:d|ment|s)?\b/i, "term.displacement", "the figure moved to another place in the bar"),
  t(/\bsaturat\w+\b/i, "term.saturation", "pushed until it adds harmonics"),
  t(/\bbit[\s-]?crush\w*\b/i, "term.bitcrusher", "rebuilt from fewer steps"),
  t(/\bLFOs?\b/, "term.lfo", "a slow wave that moves a setting"),
  t(/\bvibrato\b/i, "term.vibrato", "a wobble in the pitch"),
  t(/\bFM(?:[\s-]+synthesis)?\b/, "term.fm-synthesis", "one wave bending another's pitch"),
  t(/\bdetun(?:e|ed|ing)\b/i, "term.detune", "copies a few cents apart"),
  t(
    /\bcounter[\s-]?melod(?:y|ies)\b/i,
    "term.counter-melody",
    "a second tune that moves when the melody holds",
  ),
  t(/\bcompress(?:ion|or|ed)\b/i, "term.compression", "the loud moments turned down"),
  t(/\bspectrum\b/i, "term.spectrum", "where each part sits from low to high"),
  t(/\bauthentic[\s-]+cadences?\b/i, "term.authentic-cadence", "the V chord going home to I"),
  t(/\bhalf[\s-]+cadences?\b/i, "term.half-cadence", "a phrase that stops on the V chord"),
  t(/\bdeceptive[\s-]+cadences?\b/i, "term.deceptive-cadence", "V going to vi instead of home"),
  t(/\bplagal(?:[\s-]+cadences?)?\b/i, "term.plagal-cadence", "IV going home to I"),
  t(/\bandalusian\b/i, "term.andalusian-cadence", "the chords stepping down from 1 to 5"),
  t(/\bpicardy\b/i, "term.picardy-third", "a major home chord ending a minor piece"),
  t(/\bcadences?\b|\bcadential\b/i, "term.cadence", "the ending of the phrase"),
  t(
    /\bsecondary[\s-]+dominants?\b|\bapplied[\s-]+(?:dominants?|chords?)\b/i,
    "term.secondary-dominant",
    "the V chord of the chord that follows",
  ),
  t(/\btoniciz\w+\b|\btonicis\w+\b/i, "term.tonicization", "a chord made to sound like home for a moment"),
  t(
    /\bborrowed[\s-]+chords?\b|\bborrowed\s+from\b/i,
    "term.borrowed-chord",
    "a chord of the key with one note lowered",
  ),
  t(
    /\bmod(?:al|e)[\s-]+mixture\b/i,
    "term.modal-mixture",
    "chords from major and minor on the same home note",
  ),
  t(/\bdirect[\s-]+modulations?\b/i, "term.direct-modulation", "the music starting again in a higher key"),
  t(/\bpivot(?:[\s-]+chords?)?\b/i, "term.pivot-chord", "a chord both keys share"),
  t(/\bmodulat(?:e|es|ed|ing|ion|ions)\b/i, "term.modulation", "the home note moving"),
  t(/\breharmoni[sz]\w+\b/i, "term.reharmonization", "new chords under the same tune"),
  t(/\bpredominants?\b|\bpre-dominants?\b/i, "term.predominant", "a chord that leads away from home"),
  t(/\bharmonic[\s-]+functions?\b/i, "term.harmonic-function", "the job a chord does"),
  t(/\bharmonic[\s-]+rhythm\b/i, "term.harmonic-rhythm", "how often the chords change"),
  t(/\bhalf[\s-]*diminished\b/i, "term.half-diminished", "the chord by its stacked degrees"),
  t(/\bdiminished[\s-]+sevenths?\b/i, "term.diminished-seventh", "the chord by its stacked degrees"),
  t(/\bdominant[\s-]+sevenths?\b/i, "term.dominant-seventh", "the chord by its stacked degrees 1-3-5-b7"),
  t(
    /\bmajor[\s-]+sevenths?[\s-]+chords?\b/i,
    "term.major-seventh-chord",
    "the chord by its stacked degrees 1-3-5-7",
  ),
  t(
    /\bminor[\s-]+sevenths?[\s-]+chords?\b/i,
    "term.minor-seventh-chord",
    "the chord by its stacked degrees 1-b3-5-b7",
  ),
  t(/\bseventh[\s-]+chords?\b/i, "term.seventh-chord", "a chord with a fourth note stacked on top"),
  t(/\bguide[\s-]+tones?\b/i, "term.guide-tones", "the 3rd and the 7th of the chord"),
  t(/\brootless\b/i, "term.rootless-voicing", "the chord played without its root"),
  t(/\bvoice[\s-]+leading\b/i, "term.voice-leading", "how each note moves to the next chord"),
  t(
    /\b(?:first|second|third|root)[\s-]+inversions?\b|\binver(?:sion|sions|ted)\b/i,
    "term.inversion",
    "which chord note is lowest",
  ),
  t(/\bslash[\s-]+chords?\b/i, "term.slash-chord", "the chord over another bass note"),
  t(/\bpassing[\s-]+(?:tones?|notes?)\b/i, "term.passing-tone", "a note that steps between two chord notes"),
  t(
    /\bneighbou?r(?:ing)?[\s-]+(?:tones?|notes?)\b/i,
    "term.neighbour-tone",
    "a note that steps away and back",
  ),
  t(/\bappoggiaturas?\b/i, "term.appoggiatura", "a leaning note on the beat"),
  t(/\bsuspensions?\b/i, "term.suspension", "a note held over from the chord before"),
  t(/\bnon-?chord[\s-]+tones?\b/i, "term.non-chord-tone", "a note that is not in the chord"),
  t(/\bmixolydian\b/i, "term.mixolydian", "major with degree 7 lowered"),
  t(/\bdorian\b/i, "term.dorian", "minor with degree 6 raised"),
  t(/\blydian\b/i, "term.lydian", "major with degree 4 raised"),
  t(/\bphrygian\b/i, "term.phrygian", "minor with degree 2 lowered"),
  t(/\baeolian\b/i, "term.aeolian", "natural minor"),
  t(
    /\bcharacteristic[\s-]+(?:tones?|notes?)\b/i,
    "term.characteristic-tone",
    "the one note that differs from major or minor",
  ),
  t(/\bharmonic[\s-]+minor\b/i, "term.harmonic-minor", "minor with degree 7 raised"),
  t(/\bmelodic[\s-]+minor\b/i, "term.melodic-minor", "minor with degrees 6 and 7 raised on the way up"),
  t(/\brelative[\s-]+(?:minor|major)\b/i, "term.relative-minor", "the key that shares these notes"),
  t(/\bparallel[\s-]+(?:minor|major)\b/i, "term.parallel-minor", "the other key on the same home note"),
  t(/\bturnarounds?\b/i, "term.turnaround", "the last bar leading back to the top"),
  t(/\bblue[\s-]+notes?\b/i, "term.blue-note", "the lowered 3, 5 or 7"),
  t(/\bsyncopat\w+\b/i, "term.syncopation", "accents off the beat"),
  t(/\bghost[\s-]+notes?\b/i, "term.ghost-note", "very quiet hits between the accents"),
  t(/\btriplets?\b/i, "term.triplet", "three notes in one beat"),
];

/**
 * Harmony names in a text that the learner has not met, or that the course never uses. A name is judged once, by
 * the longest rule that matches it. `[[term:…]]` previews are not a way round it: a review is read as finished
 * prose, so it stays inside the introduced vocabulary.
 */
export function proseProblems(text: string, introduced: ReadonlySet<string> | null): string[] {
  const out: string[] = [];
  let rest = text;
  for (const rule of HARMONY_TERMS) {
    const m = rule.re.exec(rest);
    if (!m) continue;
    // Blank what was judged, so "authentic cadence" inside "perfect authentic cadence" is not judged again.
    rest = rest.replace(new RegExp(rule.re.source, `${rule.re.flags.replace("g", "")}g`), (x) =>
      " ".repeat(x.length),
    );
    if (rule.term === null) out.push(`"${m[0]}" is not a term this course uses: ${rule.say}`);
    else if (introduced !== null && !introduced.has(rule.term))
      out.push(`"${m[0]}" is a term the learner has not met yet: say it by sound and degrees (${rule.say})`);
  }
  return out;
}

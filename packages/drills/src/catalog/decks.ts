// The fact decks of contracts §7.3: staff note names, key signatures and chord symbols. Each card is one
// atomic fact (one FSRS card per card).
import type { ChordQuality, FactCardDef, FactDeck, FactId, KeySpec, LessonId } from "@oak/content-kit";
import { allKeys, CHORD_SUFFIX, keyAccidentals, mod, spellMidi } from "../kernel.ts";

// --- staff names --------------------------------------------------------------------------------

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const whiteBetween = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (WHITE_PCS.includes(mod(m, 12))) out.push(m);
  return out;
};
function staffCards(
  clef: "treble" | "bass",
  core: [number, number],
  ledger: number[],
  gate: LessonId,
): FactCardDef[] {
  const notes = [...whiteBetween(core[0], core[1]), ...ledger];
  return notes.map((m) => {
    const name = spellMidi(m, null).name;
    return {
      id: `fact.staff.${clef}.${name}` as FactId,
      gate,
      prompt: { staff: { clef, notes: [name] } },
      answer: { choice: [name[0] as string] },
    };
  });
}
export const STAFF_NAMES: FactDeck = {
  id: "deck.pit.staff-names",
  title: "Note names on the staff",
  unlock: { skill: "N02", lesson: "U02.L04" },
  cards: [
    // Treble D4–G5, then ledger A3–C4 and A5–C6.
    ...staffCards("treble", [62, 79], [57, 59, 60, 81, 83, 84], "U02.L04"),
    // Bass F2–B3, then E2 and middle C.
    ...staffCards("bass", [41, 59], [40, 60], "U05.L06"),
  ],
  newPerDay: 6,
  fastRtMs: 2500,
  answer: "choice",
};

// --- key signatures -----------------------------------------------------------------------------

/** The 15 major and 15 minor keys with up to seven sharps or flats. */
export function signatureKeys(mode: "major" | "minor"): KeySpec[] {
  const base = allKeys(mode);
  const extra: KeySpec[] =
    mode === "major"
      ? [
          { tonic: "Gb", mode },
          { tonic: "C#", mode },
          { tonic: "Cb", mode },
        ]
      : [
          { tonic: "D#", mode },
          { tonic: "A#", mode },
          { tonic: "Ab", mode },
        ];
  const all = [...base, ...extra];
  const seen = new Set<string>();
  return all
    .filter((k) => Math.abs(keyAccidentals(k)) <= 7)
    .filter((k) => {
      if (seen.has(k.tonic)) return false;
      seen.add(k.tonic);
      return true;
    })
    .sort((a, b) => keyAccidentals(a) - keyAccidentals(b));
}
/** "3#", "2b", "0". */
export const signatureText = (acc: number): string => (acc === 0 ? "0" : acc > 0 ? `${acc}#` : `${-acc}b`);

function signatureCards(): FactCardDef[] {
  const cards: FactCardDef[] = [];
  for (const mode of ["major", "minor"] as const) {
    for (const key of signatureKeys(mode)) {
      const acc = keyAccidentals(key);
      const gate: LessonId = mode === "minor" ? "U10.L02" : acc >= 0 ? "U03.L06" : "U03.L07";
      const name = `${key.tonic} ${mode}`;
      const slug = key.tonic.replace("#", "-sharp").replace(/b$/, "-flat");
      cards.push({
        id: `fact.keysig.${mode}.${slug}.sig` as FactId,
        gate,
        prompt: { text: `How many sharps or flats does ${name} have? (e.g. 3#, 2b, 0)` },
        answer: { text: [signatureText(acc)] },
      });
      cards.push({
        id: `fact.keysig.${mode}.${slug}.key` as FactId,
        gate,
        prompt: {
          text: `Which ${mode} key has this signature?`,
          staff: { clef: "treble", notes: [`${key.tonic}4`], key },
        },
        answer: { text: [key.tonic] },
      });
    }
  }
  return cards;
}
export const KEY_SIGNATURES: FactDeck = {
  id: "deck.key.signature",
  title: "Key signatures",
  unlock: { skill: "S04", lesson: "U03.L06" },
  cards: signatureCards(),
  newPerDay: 4,
  fastRtMs: 3000,
  answer: "text",
};

// --- chord symbols ------------------------------------------------------------------------------

const SYMBOL_GATES: Partial<Record<ChordQuality, LessonId>> = {
  maj: "U05.L04",
  min: "U05.L04",
  dim: "U05.L04",
  aug: "U05.L04",
  "7": "U11.L04",
  maj7: "U12.L01",
  m7: "U12.L01",
  m7b5: "U12.L03",
  dim7: "U12.L03",
  "6": "J1.L02",
  m6: "J1.L02",
  "69": "J1.L02",
  sus2: "J1.L02",
  sus4: "J1.L02",
  "7sus4": "J1.L02",
  "9": "J1.L02",
  maj9: "J1.L02",
  m9: "J1.L02",
  "13": "J1.L02",
  mMaj7: "J1.L02",
};
function symbolCards(): FactCardDef[] {
  const cards: FactCardDef[] = [];
  for (const [quality, gate] of Object.entries(SYMBOL_GATES) as [ChordQuality, LessonId][]) {
    const s = CHORD_SUFFIX[quality];
    const code = `C${s.code}`;
    const lead = `C${s.lead}`;
    const slug = quality.replace("#", "s").toLowerCase();
    cards.push({
      id: `fact.chord.${slug}.code` as FactId,
      gate,
      prompt: { text: `Write the lead-sheet symbol "${lead}" (${s.name}) as Strudel code.` },
      answer: { text: [code] },
    });
    cards.push({
      id: `fact.chord.${slug}.name` as FactId,
      gate,
      prompt: { text: `What kind of chord is \`chord("${code}")\`?` },
      answer: { choice: [quality] },
    });
  }
  return cards;
}
export const CHORD_SYMBOLS: FactDeck = {
  id: "deck.chd.symbols",
  title: "Chord symbols",
  unlock: { skill: "N05", lesson: "U05.L04" },
  cards: symbolCards(),
  newPerDay: 4,
  fastRtMs: 3000,
  answer: "text",
};

export const DECKS: readonly FactDeck[] = [STAFF_NAMES, KEY_SIGNATURES, CHORD_SYMBOLS];

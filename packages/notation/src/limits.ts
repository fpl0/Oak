// What abcjs 6.7.2 cannot draw as written, found by execution (abcjs-limits.test.ts pins every row), and
// what @oak/notation does about it. A limit the engraver can meet in content raises an `abcjs-limit`
// warning on the Score, so content CI (check 9, "Notation": any warning is an issue) tells the author at
// build time instead of the learner seeing a wrong staff at runtime.
import { keySig } from "./theory-port.ts";
import type { NotationWarning, Score } from "./types.ts";

export interface AbcjsLimit {
  id: string;
  /** What abcjs does with it (verified in abcjs-limits.test.ts). */
  abcjs: string;
  /** What the emitter writes instead. */
  fallback: string;
  /** Whether the Score carries a warning (`abcjs-limit` unless stated), which content CI reports. */
  warns: NotationWarning["code"] | null;
}

export const ABCJS_LIMITS: readonly AbcjsLimit[] = [
  {
    id: "theoretical-key",
    abcjs:
      "K: with more than seven accidentals (G♯, D♯, F♭ major …) is silently drawn as another key: K:G# shows four flats, K:Fb none.",
    fallback:
      "the signature is written out explicitly (K:C exp ^^f ^c …), so the staff is right, and the Score warns: no lesson should be in a theoretical key.",
    warns: "abcjs-limit",
  },
  {
    id: "same-step-chord",
    abcjs:
      "a chord with two notes on one staff step ([=F^F]) is drawn as two heads on top of each other with both accidentals stacked: unreadable.",
    fallback: "written as given; the Score warns so content spells the chord on different steps.",
    warns: "abcjs-limit",
  },
  {
    id: "long-tuplet",
    abcjs: "tuplets with more than 9 notes ((11:8:11 …) do not parse: the ratio becomes a warning.",
    fallback: "the bar is snapped to the grid (Score.approximate).",
    warns: "tuplet-too-long",
  },
  {
    id: "nested-tuplet",
    abcjs: "no nested tuplets: a tuplet inside a tuplet takes the outer ratio only.",
    fallback: "the quantizer writes the inner group at the outer ratio or snaps it (mixed-tuplets).",
    warns: "mixed-tuplets",
  },
  {
    id: "five-voices",
    abcjs: "voices are drawn, but more than four on one staff collide (stems, rests).",
    fallback: "at most four voices per staff; a fifth line is cut (overlap-cut).",
    warns: "overlap-cut",
  },
  {
    id: "far-ledger-lines",
    abcjs:
      "notes far outside the staff (more than about five ledger lines) are drawn, but run into the lyrics, annotations and the other staff.",
    fallback: "written as given; the Score warns (out-of-range) so content picks the clef or the octave.",
    warns: "out-of-range",
  },
  {
    id: "cautionary-accidental",
    abcjs: "no syntax for a cautionary accidental in parentheses.",
    fallback: "courtesy accidentals are printed as plain accidentals.",
    warns: null,
  },
  {
    id: "class-in-chord",
    abcjs:
      "a !class=…! decoration inside chord brackets is dropped, and only the last of several decorations survives.",
    fallback: "one decoration per element, before the brackets, holding every class.",
    warns: null,
  },
  {
    id: "voice-id-underscore",
    abcjs: "a voice id containing _ in %%score is rejected.",
    fallback: "voice ids are S1, S1v2, RH, LH, DR, DRv2.",
    warns: null,
  },
  {
    id: "lyric-per-element",
    abcjs:
      "a lyric line gives one syllable per note element (a chord is one element); spaces, - and _ split or extend syllables.",
    fallback:
      "a chord's annotation is one syllable joined with ~ (shown as a space); - _ * | are stripped from the text.",
    warns: null,
  },
  {
    id: "mid-bar-key-change",
    abcjs:
      "an inline [K:…] inside a bar draws the new signature there, but every barline (||, .|, [|]) is counted as a measure, so the double barline engravers put before a key change inside a bar cannot be drawn without splitting the bar.",
    fallback:
      "the new signature is written inside the bar with no barline (KeyChange.beat > 1); the bar's accidentals start again under it and a letter altered earlier in the bar is restated.",
    warns: null,
  },
  {
    id: "stacked-figures",
    abcjs:
      "an annotation is one line of text: inversion figures cannot be stacked (V with 6 over 5), and abcjs turns b, # and o into glyphs only in chord symbols, not in annotations.",
    fallback:
      "Roman numerals are printed with the figures as digits after the numeral (V65, I64, as the learner types them) and the glyphs written in Unicode (vii°7, iiø7, ♭VII).",
    warns: null,
  },
  {
    id: "label-in-tuplet",
    abcjs:
      "a chord symbol or numeral attaches to a note or rest; one that starts inside a tuplet would need the tuplet split into smaller tied tuplets ((5:4:3 … E/2- (5:4:3 E/2 …), which no reader can follow.",
    fallback:
      "the tuplet stays whole and the label is drawn at the note sounding where it starts (ScoreAnnotation.drawnAt); the Score warns so content moves the label or the rhythm.",
    warns: "abcjs-limit",
  },
  {
    id: "pickup-bar-numbers",
    abcjs:
      "bar numbers (%%barnumbers) count every bar from 1, so after a pickup the first full bar would be numbered 2.",
    fallback:
      "%%setbarnb starts the count at the engraved first bar's number: 0 for a pickup bar, so the first full bar is 1 (contracts §6.11).",
    warns: null,
  },
  // --- Wave 5 ---------------------------------------------------------------------------------------
  {
    id: "lyrics-second-voice",
    abcjs:
      "under a staff abcjs keeps room for one voice's lyric lines only: a second voice's w: lines are drawn below the first voice's, over the numerals (\"_…\" texts) and into the next staff.",
    fallback:
      "every voice gets its lens lines, and the first voice of a staff is padded with blank lines (w:~ ~ …), one per line its later voices carry, so the room is reserved (c5).",
    warns: null,
  },
  {
    id: "unison-in-chord",
    abcjs: "a chord with one pitch twice ([BB]) is drawn as two noteheads on top of each other.",
    fallback:
      "two events in unison in one slot (a chord tone doubling the tune in its rhythm) share one notehead; the item carries both event ids (c5).",
    warns: null,
  },
  {
    id: "text-over-chord-symbol",
    abcjs:
      'a "^text" over the first note stacks under that note\'s chord symbol, so "Swing 8ths" and the first chord collide in one column.',
    fallback:
      '"Swing 8ths" / "Swing 16ths" is the tempo line\'s text (Q:"Swing 8ths" 1/4=112), drawn above the first system as engravers write a feel.',
    warns: null,
  },
  {
    id: "part-labels",
    abcjs:
      "a section label is an inline part field [P:Chorus]; abcjs draws it above the staff in its parts font (a large serif by default) at the bar where it stands, on the voice that carries it only.",
    fallback:
      "the label stands at the start of the section's first bar on the top staff's first voice, in Helvetica 13 bold (%%partsfont), with a double barline closing the bar before it in every voice; a label is one line of text (brackets and % are dropped).",
    warns: null,
  },
  {
    id: "chart-off-beat-chord",
    abcjs:
      "a chord chart is a staff of slash noteheads (style=rhythm), one per beat: a chord symbol can only stand on a slash.",
    fallback:
      "chartAbc draws a chord that starts between two beats on the beat before it and returns an abcjs-limit warning; two chords on one beat show the last (warned).",
    warns: "abcjs-limit",
  },
  {
    id: "swing-compound",
    abcjs:
      "nothing in abcjs: Oak's straightening is defined only for a quarter-note tempo unit (contracts §6.10 item 1, swing is not used in compound meters).",
    fallback:
      "a swing declared in 6/8, 9/8 or 12/8 is not straightened; the notes are engraved as played and the Score warns.",
    warns: "swing-unsupported",
  },
  {
    id: "blues-signature",
    abcjs: "K:Cm draws three flats for a blues key read as minor (the blues scale's ♭3 and ♭7).",
    fallback:
      "a blues key is written in its tonic's major signature (C blues: none), with ♭3 and ♭7 as flats and ♭5 by direction as accidentals; degree and solfège labels still read the blues degrees.",
    warns: null,
  },
  {
    id: "annotation-above",
    abcjs: 'several "^text" annotations on one note are joined into one text, stacked with line breaks.',
    fallback: "annotations above the staff are one stacked text per note (degree, solfège, name).",
    warns: null,
  },
  // --- Wave 6 ---------------------------------------------------------------------------------------
  {
    id: "key-change-naturals",
    abcjs:
      "an inline [K:…] at a bar line draws the new signature with naturals cancelling what the old one had and the new one lacks (D to C: two naturals; F to G: a natural on B, then F sharp); one that starts a system is drawn as a courtesy signature at the end of the system before.",
    fallback:
      "nothing to add: the change is written [K:…] after a double barline (||) in every pitched voice, and abcjs draws the naturals.",
    warns: null,
  },
  {
    id: "key-change-at-system-break",
    abcjs:
      "when a change starts a system, abcjs draws the cancelling naturals twice: in the courtesy signature at the end of the system before, and again in the new system's own signature (they are gone from the system after that). Writing the key twice removes them there but repeats the new accidentals at the end of the line.",
    fallback:
      "left as abcjs draws it: every sign is true, the second set of naturals is only redundant. A host that wants a change to read cleanly keeps it inside a system (bars per line that do not end on the change).",
    warns: null,
  },
  {
    id: "same-signature-key-change",
    abcjs:
      "[K:Am] after K:C draws no signature (nothing changes), but the double barline before it would still mark a change the staff does not show.",
    fallback:
      "a change to a key with the signature already in force (C major to A minor, a mode to its parent) writes no [K:…] and no double barline; the notes are spelled and labelled in the new key (Score.keyChanges).",
    warns: null,
  },
  {
    id: "modal-signature",
    abcjs:
      "K:Ddor, K:Gmix, K:Flyd, K:Ephr draw the parent scale's signature; abcjs has no way to show a mode's colour tone in the signature area or to name the mode on the staff.",
    fallback:
      "the mode's own signature by default (MODAL_SIGNATURE_DEFAULT); modalSignatureKey(key, 'parallel') / keyChangesOf(plan, { modal: 'parallel' }) writes the tonic's major or minor signature and the colour tone as an accidental every time.",
    warns: null,
  },
  {
    id: "label-splits-held-note",
    abcjs:
      "a chord symbol or numeral attaches to a note or rest: it cannot stand over the middle of a held note (the second chord of a bar over a whole note) or of a whole-bar rest.",
    fallback:
      "the note is split where the label stands and tied (C8- C8 under Ab and Bb), a rest is split in two; inside a tuplet the label moves instead (label-in-tuplet).",
    warns: null,
  },
  {
    id: "tuplet-across-beats",
    abcjs:
      "a tuplet bracket spans whatever it is given: a line pushed by a triplet eighth can be written as one bar-wide (3:2:5 with dotted and tied values inside, which parses and hides every beat.",
    fallback:
      "when a tuplet wider than a beat would need dotted or tied values inside its bracket and the same notes fit triplets inside single beats, they are written per beat and tied over the beats ((3 z4 E2- (3 E4 G2- …); a plain quarter-note or half-note triplet keeps one bracket.",
    warns: null,
  },
  {
    id: "tie-out-of-the-last-bar",
    abcjs:
      "a tie after the last note of the tune (a chord pushed early into the repeat) has no note to end on; abcjs draws it open towards the final barline and reports nothing.",
    fallback:
      "kept: the open tie says the note rings on (into the repeat, or onto the next page, where the note arrives tied in); the first bar of a pushed loop starts with a rest, as it sounds on the first pass.",
    warns: null,
  },
  {
    id: "notehead-classes",
    abcjs:
      "a class can only be given to a whole element (!class=…! before the chord brackets), so one member of a chord cannot be marked in the ABC (a guide tone inside a voicing).",
    fallback:
      "guideToneMarks(score) lists the heads (n, member) and markGuideTones (render.dom.ts) adds oak-guide / oak-guide-third / oak-guide-seventh to the drawn notehead paths after the render.",
    warns: null,
  },
  {
    id: "ghost-notes",
    abcjs:
      "no parenthesised or small notehead per note: a ghost note (U13.L02, .velocity(.3)) cannot be drawn as drummers write it.",
    fallback:
      "not drawn: every stroke has a normal head. U13.L02 shows ghost notes on the roll (the staff arrives in U13.L03); content must not ask a learner to read loud and quiet strokes from the staff.",
    warns: null,
  },
  {
    id: "declared-grid",
    abcjs:
      "nothing in abcjs: a hit moved by .late(1/32) or .early(.02) is engraved to the 32nd (z/2 c7/2- …) or snapped and reported, which no reader wants for a lazy snare.",
    fallback:
      "NotationInput.grid (steps per bar) moves every onset and end to the grid the lesson declares before writing; two notes of one track that land on one step cannot both be shown: the Score warns and is approximate.",
    warns: "snapped-to-grid",
  },
];

/** The `abcjs-limit` warnings of a Score (theoretical key, same-step chords). Pure. */
export function abcjsLimitWarnings(score: Pick<Score, "key" | "staves">): NotationWarning[] {
  const out: NotationWarning[] = [];
  if (score.key) {
    const ks = keySig(score.key);
    if (ks.notes.length > 7)
      out.push({
        code: "abcjs-limit",
        bar: 0,
        message: `${score.key.tonic} ${score.key.mode} is a theoretical key (${ks.notes.length} accidentals): written with an explicit signature`,
      });
  }
  for (const s of score.staves) {
    if (s.clef === "perc") continue;
    for (const v of s.voices)
      for (const b of v.bars)
        for (const it of b.items) {
          if (it.kind !== "chord" || it.tieFromPrev) continue;
          const steps = it.pitches.map((p) => `${p.letter}${p.oct}`);
          if (new Set(steps).size < steps.length)
            out.push({
              code: "abcjs-limit",
              bar: b.index,
              message: `a chord holds two notes on one staff step (${it.pitches.map((p) => p.name).join(" ")})`,
            });
        }
  }
  return out;
}

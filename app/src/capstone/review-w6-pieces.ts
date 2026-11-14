// Pieces for the Wave 6 learner review of C6, C7 and CF-A (review:studio; not a spec): three honest pieces per
// capstone in other keys, modes, tempos, flavours and forms than the golden tests, and plausible near misses (a
// "Mixolydian" vamp that never sounds its ♭7, its colour note only off the beat, a D7 bringing back F♯; a secondary
// dominant that goes elsewhere, a lift of four bars, a lift of a minor third; three devices, a bridge that is the
// chorus renamed, a single of 1:52). review-w6.test.ts grades each one as the browser's check does.
const drums = `kick: s("bd ~ bd ~").gain(.8)
snare: s("~ sd ~ sd").gain(.7)
hats: s("hh*8").gain(.4)`;

// ---------------- C6 honest ----------------
export const C6_POP_D = `setcpm(120/4)

const chordsVamp = chord("<D C G D>").voicing()
const melVamp = n("<[6 ~ 4 ~] [6 4 6 ~] [3 ~ 1 ~] [0 ~ ~ ~]>")
const melTune = n("<[4 ~ 6 4] [6 ~ 4 2] [3 2 1 ~] [0 ~ ~ ~]>")

chords: arrange([8, chordsVamp], [8, chordsVamp]).s("piano")
mel: arrange([8, melVamp], [8, melTune]).scale("D4:mixolydian").s("piano")
bass: n("<0 6 3 0>").scale("D2:mixolydian").s("ebass")
${drums}`;

export const C6_JAZZ_A = `setcpm(92/4)

const chordsVamp = chord("<Am7 D7>").voicing()
const melTune = n("<[5 ~ 4 2] [5 ~ 3 ~] [4 ~ 2 0] [5 ~ ~ ~]>")

chords: arrange([4, chordsVamp], [8, chordsVamp], [4, chordsVamp]).s("rhodes")
mel: arrange([4, silence], [8, melTune], [4, silence]).scale("A4:dorian").s("piano")
bass: n("<[0 ~ 4 ~] [3 ~ 5 ~]>").scale("A1:dorian").s("fingerbass")
${drums}`;

export const C6_FUNK_E = `setcpm(104/4)

const chordsVamp = chord("<E D A E>").voicing().struct("x ~ ~ x ~ ~ x ~").early(1/8)
const bassVamp = n("<[0 ~ 0 [~ 0] ~ 6 ~ 4] [6 ~ 6 ~ ~ 5 ~ 4] [3 ~ 3 ~ ~ 2 ~ 1] [0 ~ ~ 6 ~ 4 ~ 2]>")
const melTune = n("<[6 ~ 4 ~] [6 ~ 5 4] [3 ~ 2 ~] [0 ~ ~ ~]>")

bass: arrange([4, bassVamp], [8, bassVamp], [4, bassVamp]).scale("E2:mixolydian").s("fingerbass")
chords: arrange([4, chordsVamp], [8, chordsVamp], [4, chordsVamp]).s("cleangtr")
mel: arrange([4, silence], [8, melTune], [4, silence]).scale("E4:mixolydian").s("piano")
hats: s("hh*16").velocity("[1 .3 .6 .3]*4").gain(.5)
kick: s("bd ~ [~ bd] ~")
snare: s("~ sd ~ sd")`;

// ---------------- C6 near-misses ----------------
/** "Mixolydian" that never sounds its ♭7. */
export const C6_MISS_NO_B7 = `setcpm(100/4)

const chordsVamp = chord("<G C G Am>").voicing()
const melVamp = n("<[4 ~ 2 0] [5 ~ 4 2] [4 ~ 2 ~] [1 ~ 0 ~]>")

chords: arrange([16, chordsVamp]).s("piano")
mel: arrange([16, melVamp]).scale("G4:mixolydian").s("piano")
bass: n("<0 3 0 1>").scale("G2:mixolydian").s("ebass")
${drums}`;

/** Dorian whose ♮6 only falls on beats 2 and 4. */
export const C6_MISS_OFFBEAT = `setcpm(96/4)

const chordsVamp = chord("<Dm7 C>").voicing()
const melVamp = n("<[2 5 4 ~] [0 5 2 ~] [4 5 2 ~] [0 ~ ~ ~]>")

chords: arrange([16, chordsVamp]).s("rhodes")
mel: arrange([16, melVamp]).scale("D4:dorian").s("piano")
bass: n("<0 6>").scale("D2:dorian").s("fingerbass")
${drums}`;

/** G Mixolydian with a D7 turnaround: the F♯ leading tone comes back. */
export const C6_MISS_LEADING = `setcpm(110/4)

const chordsVamp = chord("<G F C D7>").voicing()
const melVamp = n("<[6 ~ 4 2] [6 ~ 3 ~] [4 ~ 2 0] [1 ~ ~ ~]>")

chords: arrange([16, chordsVamp]).s("piano")
mel: arrange([16, melVamp]).scale("G4:mixolydian").s("piano")
bass: note("<g2 f2 c2 d2>").s("ebass")
${drums}`;

// ---------------- C7 honest ----------------
const verseMel = `n("<[0 2 4 2] [6 ~ 2 ~] [5 4 2 0] [3 ~ ~ ~] [4 2 0 2] [6 ~ 4 ~] [3 2 1 ~] [1 ~ ~ ~]>")`;
const c7 = (o: {
  bpm: number;
  verse: string;
  chorus: string;
  chorus2: string;
  melChorus: string;
  scale: string;
  verseMelody?: string;
}) => `setcpm(${o.bpm}/4)

const chordsVerse = chord("${o.verse}").voicing()
const chordsChorus = chord("${o.chorus}").voicing()
const chordsChorus2 = chord("${o.chorus2}").voicing()
const melVerse = ${o.verseMelody ?? verseMel}
const melChorus = n("${o.melChorus}")

chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus2]).s("piano")
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus]).scale("${o.scale}").s("piano")
${drums}`;

/** Pop: E7 to Am in the verse, A♭–B♭–C in the chorus, the last chorus up a half step (D♭). */
export const C7_POP_E7 = c7({
  bpm: 112,
  verse: "<C E7 Am F C G F G>",
  chorus: "<F G Am F Ab Bb C C>",
  chorus2: "<Gb Ab Bbm Gb A B Db Db>",
  melChorus: "<[5 ~ 3 0] [6 ~ 4 1] [7 ~ 5 2] [5 ~ 3 ~] [2b ~ 0 ~] [3 ~ 1 ~] [0 ~ ~ ~] ~>",
  scale: "<C4:major!24 Db4:major!8>",
  verseMelody: `n("<[0 2 4 2] [6 ~ 2 ~] [5 4 2 0] [3 ~ ~ ~] [4 2 0 2] [6 ~ 4 ~] [3 2 1 ~] [1 ~ ~ ~]>")`,
});

/** Ballad at 72: A♭–B♭ at the verse's end into the chorus's C, D7 to G in the chorus, a whole-step lift. */
export const C7_BALLAD_D7 = c7({
  bpm: 72,
  verse: "<C Am F G C Am Ab Bb>",
  chorus: "<C D7 G G Am D7 G C>",
  chorus2: "<D E7 A A Bm E7 A D>",
  melChorus: "<[4 ~ 2 0] [3# ~ 1 5] [6 ~ 4 ~] [1 ~ ~ ~] [7 ~ 5 2] [5 ~ 3# 1] [6 ~ 4 1] [0 ~ ~ ~]>",
  scale: "<C4:major!24 D4:major!8>",
  verseMelody: `n("<[0 2 4 2] [5 ~ 2 ~] [5 3 0 ~] [4 ~ 1 ~] [4 2 0 2] [5 ~ 4 ~] [2b ~ 0 ~] [3 ~ 1 ~]>")`,
});

/** Soul in sevenths at 88: A7 to Dm7 twice, A♭^7–B♭7–C^7, half-step lift. */
export const C7_SOUL_SEVENTHS = c7({
  bpm: 88,
  verse: "<C^7 A7 Dm7 G7 C^7 A7 Dm7 G7>",
  chorus: "<F^7 G7 Em7 A7 Dm7 G7 [Ab^7 Bb7] C^7>",
  chorus2: "<Gb^7 Ab7 Fm7 Bb7 Ebm7 Ab7 [A^7 B7] Db^7>",
  melChorus: "<[5 ~ 3 0] [6 ~ 4 1] [6 ~ 4 2] [4# ~ 6 ~] [5 ~ 3 1] [3 ~ 1 6] [2b ~ 3 ~] [4 ~ ~ ~]>",
  scale: "<C4:major!24 Db4:major!8>",
  verseMelody: `n("<[6 ~ 4 2] [4# ~ 1 ~] [5 3 1 0] [3 ~ 6 ~] [6 ~ 4 2] [4# ~ 1 ~] [5 3 1 0] [3 ~ 1 ~]>")`,
});

// ---------------- C7 near-misses ----------------
/** E7 goes to F, not Am. */
export const C7_MISS_UNRESOLVED = c7({
  bpm: 112,
  verse: "<C E7 F F C G F G>",
  chorus: "<F G Am F Ab Bb C C>",
  chorus2: "<G A Bm G Bb C D D>",
  melChorus: "<[5 ~ 3 0] [6 ~ 4 1] [7 ~ 5 2] [5 ~ 3 ~] [2b ~ 0 ~] [3 ~ 1 ~] [0 ~ ~ ~] ~>",
  scale: "<C4:major!24 D4:major!8>",
});

/** The lift lasts four bars. */
export const C7_MISS_SHORT_LIFT = c7({
  bpm: 112,
  verse: "<C E7 Am F C G F G>",
  chorus: "<F G Am F Ab Bb C C>",
  chorus2: "<F G Am F Bb C D D>",
  melChorus: "<[5 ~ 3 0] [6 ~ 4 1] [7 ~ 5 2] [5 ~ 3 ~] [2b ~ 0 ~] [3 ~ 1 ~] [0 ~ ~ ~] ~>",
  scale: "<C4:major!28 D4:major!4>",
});

/** A♭–B♭ that land on Am, not C; and a lift of a minor third. */
export const C7_MISS_NO_HOME = c7({
  bpm: 112,
  verse: "<C E7 Am F C G F G>",
  chorus: "<F G Am F Ab Bb Am Am>",
  chorus2: "<Ab Bb Cm Ab Cb Db Cm Cm>",
  melChorus: "<[5 ~ 3 0] [6 ~ 4 1] [7 ~ 5 2] [5 ~ 3 ~] [2b ~ 0 ~] [3 ~ 1 ~] [7 ~ ~ ~] ~>",
  scale: "<C4:major!24 Eb4:major!8>",
});

// ---------------- CF-A honest ----------------
const cfa = (o: {
  bpm: number;
  plan: [number, string][];
  consts: Record<string, Record<string, string>>;
  tails: Record<string, string>;
  plain?: string;
}) => {
  const lines: string[] = [];
  const tracks: string[] = [];
  for (const [role, secs] of Object.entries(o.consts)) {
    for (const [s, p] of Object.entries(secs)) lines.push(`const ${role}${s} = ${p}`);
    const parts = o.plan.map(([b, s]) => `[${b}, ${secs[s] === undefined ? "silence" : `${role}${s}`}]`);
    tracks.push(`${role}: arrange(${parts.join(", ")})${o.tails[role] ?? ""}`);
  }
  return [`setcpm(${o.bpm}/4)`, "", ...lines, "", o.plain ?? drums, ...tracks].join("\n");
};

const G_PLAN: [number, string][] = [
  [4, "Intro"],
  [8, "Verse"],
  [8, "Chorus"],
  [8, "Verse"],
  [8, "Chorus"],
  [8, "Bridge"],
  [8, "Chorus"],
  [8, "Chorus2"],
  [4, "Outro"],
];
const gPop = (o: { noSus?: boolean; bridgeIsChorus?: boolean; plan?: [number, string][] } = {}) =>
  cfa({
    bpm: 120,
    plan: o.plan ?? G_PLAN,
    consts: {
      chords: {
        Intro: 'chord("<G C>").voicing()',
        Verse: 'chord("<G Em C D>").voicing()',
        Chorus: 'chord("<C D B7 Em C D G G>").voicing()',
        Bridge: o.bridgeIsChorus
          ? 'chord("<C D B7 Em C D G G>").voicing()'
          : 'chord("<Em Em C C Cm Cm D D>").voicing()',
        Chorus2: 'chord("<C D B7 Em C D G G>").voicing()',
        Outro: 'chord("<C G>").voicing()',
      },
      bass: {
        Verse: 'n("<0 5 3 4>").struct("x ~ ~ x ~ x ~ ~")',
        Chorus: 'n("<3 4 2 5 3 4 0 0>").struct("x ~ ~ x ~ x ~ ~")',
        Bridge: o.bridgeIsChorus
          ? 'n("<3 4 2 5 3 4 0 0>").struct("x ~ ~ x ~ x ~ ~")'
          : 'n("<5 5 3 3 3 3 4 4>").struct("x ~ x ~")',
        Chorus2: 'n("<3 4 2 5 3 4 0 0>").struct("x ~ ~ x ~ x ~ ~")',
      },
      mel: {
        Verse: o.noSus
          ? 'n("<[4 ~ 4 2] [4 ~ ~ ~] [2 4 5 7] [6@2 4@2]>")'
          : 'n("<[4 ~ 4 2] [4 ~ ~ ~] [2 4 5 7] [7@2 6@2]>")',
        Chorus: 'n("<[7 ~ 7 5] [8 ~ 8 ~] [8 ~ 6 4#] [4 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 6] [7 ~ ~ ~] ~>")',
        Bridge: o.bridgeIsChorus
          ? 'n("<[7 ~ 7 5] [8 ~ 8 ~] [8 ~ 6 4#] [4 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 6] [7 ~ ~ ~] ~>")'
          : 'n("<[4 ~ 2 0] [4 ~ 2 ~] [2 ~ 0 ~] ~ [2b ~ 0 ~] [4 ~ 2b ~] [5 ~ 3 ~] [1 ~ ~ ~]>")',
        Chorus2: 'n("<[7 ~ 7 5] [8 ~ 8 ~] [8 ~ 6 4#] [4 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 6] [7 ~ ~ ~] ~>")',
      },
    },
    tails: {
      chords: '.s("piano").gain(.5)',
      bass: '.scale("G2:major").s("ebass").lpf(700)',
      mel: '.scale("G4:major").s("piano")',
    },
  });

/** Pop in G at 120, 64 bars (2:08): B7 to Em, the minor iv (Cm) in the bridge, a 4–3, a pushed bass. */
export const CFA_G_POP = gPop();

/** Indie in A minor at 90, 56 bars: Dorian i–IV verse, A7 into Dm, a 4–3, the last chorus in B minor. */
export const CFA_AMIN_INDIE = cfa({
  bpm: 90,
  plan: [
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Bridge"],
    [8, "Chorus"],
    [8, "Chorus2"],
  ],
  consts: {
    chords: {
      Verse: 'chord("<Am7 D7 Am7 D7>").voicing()',
      Chorus: 'chord("<F G Am A7 Dm G C E>").voicing()',
      Bridge: 'chord("<Dm Dm Am Am F F E E>").voicing()',
      Chorus2: 'chord("<G A Bm B7 Em A D F#>").voicing()',
    },
    bass: {
      Verse: 'n("<[0 ~ 4 ~] [3 ~ 5 ~]>")',
      Chorus: 'n("<5 6 0 0 3 6 2 4>").struct("x ~ ~ x ~ x ~ ~")',
      Bridge: 'n("<3 3 0 0 5 5 4 4>")',
      Chorus2: 'n("<5 6 0 0 3 6 2 4>").struct("x ~ ~ x ~ x ~ ~")',
    },
    mel: {
      Verse: 'n("<[4 ~ 5 4] [5 ~ 3 ~] [2 ~ 4 ~] [5@2 3@2]>")',
      Chorus: 'n("<[5 ~ 7 5] [6 ~ 4 ~] [4 ~ 2 0] [4# ~ 2 ~] [3 ~ 5 3] [3 ~ 1 ~] [2 ~ ~ ~] [7@2 6#@2]>")',
      Bridge: 'n("<[3 ~ 5 7] [5 ~ 3 ~] [4 ~ 2 0] [2 ~ ~ ~] [5 ~ 7 5] [5 ~ 3 0] [4# ~ 6 ~] [4# ~ ~ ~]>")',
      Chorus2: 'n("<[5 ~ 7 5] [6 ~ 4 ~] [4 ~ 2 0] [4# ~ 2 ~] [3 ~ 5 3] [3 ~ 1 ~] [2 ~ ~ ~] [7@2 6#@2]>")',
    },
  },
  tails: {
    chords: '.s("piano").gain(.5)',
    bass: '.scale("<A2:minor!48 B2:minor!8>").s("fingerbass")',
    mel: '.scale("<A4:minor!48 B4:minor!8>").s("piano")',
  },
});

/** Funk in F at 104, 52 bars (exactly 2:00): D7 to Gm, B♭m in the bridge, I–♭VII–IV, a syncopated bass. */
export const CFA_F_FUNK = cfa({
  bpm: 104,
  plan: [
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Verse"],
    [8, "Chorus"],
    [8, "Bridge"],
    [8, "Chorus"],
    [4, "Outro"],
  ],
  plain: `kick: s("bd ~ [~ bd] ~").gain(.8)
snare: s("~ sd ~ sd").gain(.7)
hats: s("hh*16").velocity("[1 .3 .6 .3]*4").gain(.4)`,
  consts: {
    chords: {
      Verse: 'chord("<F Eb Bb F>").voicing().struct("x ~ ~ x ~ ~ x ~")',
      Chorus: 'chord("<Bb C D7 Gm Bb C F F>").voicing()',
      Bridge: 'chord("<Dm Dm Bb Bb Bbm Bbm C C>").voicing()',
      Outro: 'chord("<F Eb Bb F>").voicing()',
    },
    bass: {
      Verse: 'n("<[0 ~ 0 [~ 0] ~ 6b ~ 4] [6b ~ 6b ~ ~ 5 ~ 4] [3 ~ 3 ~ ~ 2 ~ 1] [0 ~ ~ 6b ~ 4 ~ 2]>")',
      Chorus:
        'n("<[3 ~ ~ 3 ~ 3 ~ ~] [4 ~ ~ 4 ~ 4 ~ ~] [5 ~ ~ 5 ~ 5 ~ ~] [1 ~ ~ 1 ~ 1 ~ ~] [3 ~ ~ 3 ~ 3 ~ ~] [4 ~ ~ 4 ~ 4 ~ ~] [0 ~ ~ 0 ~ 0 ~ ~] [0 ~ ~ 0 ~ 0 ~ ~]>")',
      Bridge: 'n("<5 5 3 3 3 3 4 4>").struct("x ~ x ~")',
      Outro: 'n("<0 6b 3 0>")',
    },
    mel: {
      Verse: 'n("<[6b ~ 4 2] [6b ~ 4 ~] [3 ~ 1 ~] [0 ~ ~ ~]>")',
      Chorus: 'n("<[5 ~ 3 1] [4 ~ 2 ~] [4# ~ 2 0] [1 ~ ~ ~] [5 ~ 3 1] [6 ~ 4 2] [7 ~ ~ ~] ~>")',
      Bridge: 'n("<[5 ~ 3 1] [5 ~ ~ ~] [3 ~ 1 ~] [3 ~ ~ ~] [3 ~ 2b 1] [3 ~ ~ ~] [4 ~ 2 ~] [6 ~ ~ ~]>")',
    },
  },
  tails: {
    chords: '.s("rhodes").gain(.5)',
    bass: '.scale("F2:major").s("fingerbass")',
    mel: '.scale("F4:major").s("piano")',
  },
});

// ---------------- CF-A near-misses ----------------
/** Three devices: the G pop without its suspension. */
export const CFA_MISS_THREE = gPop({ noSus: true });
/** The bridge is the chorus with a new name. */
export const CFA_MISS_BRIDGE_RENAMED = gPop({ bridgeIsChorus: true });
/** 1:52: the G pop without its intro and outro (56 bars at 120). */
export const CFA_MISS_SHORT = gPop({ plan: G_PLAN.slice(1, -1) });

/** G Mixolydian, home chord in half the bars, a D7 turnaround: only the F♯ fails the mode. */
export const C6_MISS_LEADING2 = C6_MISS_LEADING.replace('"<G F C D7>"', '"<G F G D7>"').replace(
  '"<g2 f2 c2 d2>"',
  '"<g2 f2 g2 d2>"',
);

# Contracts check: adversarial edit pass on the binding contracts

Scope: `docs/design/contracts.md`, `content/STYLE.md`, `content/AUTHORING.md`. Everything below was executed on 2026-11-11 under Bun 1.4.4 against `@strudel/{core,mini,tonal,transpiler}` 1.2.6. No dependency was missing. Nothing was installed, committed or served.

## How to re-run

```
bun spikes/contracts-check/chords.ts      # (symbol x dictionary) matrix        -> out-chords.txt
bun spikes/contracts-check/facts.ts       # chromatic steps, scales, swing, late, euclid, arrange, pickup, mini ops, voicing controls -> out-facts.txt
bun spikes/contracts-check/controls.ts    # every catalogued method exists; key plan under arrange(); _oakChord shim -> out-controls.txt
bun spikes/contracts-check/extra.ts       # ribbon, root mode, .add(3), rumba clave, 16th swing in 3/4 -> out-extra.txt
bun spikes/contracts-check/blocks.ts      # evaluates every ```js block of STYLE.md and every code string of AUTHORING.md -> out-blocks.txt
python3 spikes/contracts-check/consistency.py   # course map, default order, gym slot rule, skill order in every legal order, unlock table, checkpoint map
```

`h.ts` is the harness: `evalScope(core, mini, tonal)`, a `.p` collector copied in spirit from `repl.mjs`, `evaluate(code, transpiler)`, `queryArc`, onset-only haps, captured logger output. The `patch_*.py` files are the exact edits that were applied (each replacement asserts that its anchor occurs exactly once).

## What execution disproved (and the documents now say)

### 1. `Caug` is wrong in `triads`; `C69` is wrong in `lefthand`

```
symbol | (default) | ireal | ireal-ext | triads | lefthand | guidetones | legacy
Caug | 5:E3,C4,E4,Ab4,C5 | 5:E3,C4,E4,Ab4,C5 | 5:E3,C4,E4,Ab4,C5 | 3:Eb4,Ab4,C5 | — | — | 3:Eb4,Ab4,C5
C69  | 5:C3,G3,D4,E4,A4  | 5:C3,G3,D4,E4,A4  | 5:E3,A3,D4,G4,C5  | —            | 4:E3,G3,Bb3,D4 | 2:E4,A4 | 4:E3,G3,Bb3,D4
```

Source of both, `node_modules/@strudel/tonal/voicings.mjs`: `aug: ['1P 3m 5A', '3m 5A 8P', '5A 8P 10m']` (minor third) in `triads` and `legacy`; `69: ['3M 5P 6A 9M']` (augmented sixth) in `lefthand`. `chord("Caug").dict("triads")` therefore plays an A♭ major triad and `chord("C69").dict("lefthand")` plays a C9. The first version of STYLE §5.2 marked both ✓. Now: ✗ cells, lint error `code.chord-not-in-dict`, contracts §0.13, §0.14, §6.7 item 6.

The rest of the matrix in STYLE §5.2 was confirmed cell by cell. Also confirmed: `Cmaj7 Cdim Cdim7 Csus4 Csus2 cm7` are silent with a `[voicing]: unknown chord` log line; `chord("C+")` is a mini-notation parse error; `chord("C/E")` throws `Invalid argument`; `C2` and `Cadd9` (needed by node C09 "Sus & add chords") resolve in `ireal`/`ireal-ext` only and were missing from the chord-family table.

Other facts from the matrix that the contracts now state (§0.25): `lefthand` is rootless with a 9th or 13th (`C7` → Bb3 D4 E4 A4), `ireal-ext` adds notes to plain symbols (`C` → E3 C4 E4 A4 C5), `guidetones` has two notes. A chord's name can therefore not be worked out from a voicing: identity comes from the symbol.

### 2. `n` must come before `chord().voicing()`

```
n("0 1 2 3").chord("<C Am>").voicing()   => 0:E3 1/4:C4 1/2:E4 3/4:G4
chord("<C Am>").n("0 1 2 3").voicing()   => 0:E3
chord("<C Am>").voicing().n("0 1 2")     => 0:E3 0:C4 0:E4 0:G4 0:C5 {"note":"E3","n":0}
n("0 1 2 3").set(chord("<Dm7 G7>")).voicing() => 0:F3 1/4:C4 1/2:D4 3/4:F4 1:G3 5/4:D4 3/2:F4 7/4:G4
```

The toolbox row `tb.voicing.n` said "`.voicing()` then `.n("0 1 2")`", which does nothing. Fixed (contracts §0.15, §3.2 C; STYLE §5.3 item 7).

### 3. Fractions inside strings: not only swing

```
s("~ sd ~ sd").late(1/32)      => 9/32 25/32
s("bd sd").late("1/16")        => 0 1/2            (no shift)
note("c4").off("1/8", x => x.transpose(7)) => main@0:C4 main@0:G4   (no shift)
s("sd*2").late("<0 .02>")      => 0.000 0.500 1.020 1.520
s("hh*8").swingBy("1/3", 4)    => 0 1/8 1/4 3/8 1/2 5/8 3/4 7/8    (no swing)
```

New lint code `code.time-fraction-string` (contracts §0.16, §5.7; STYLE §1, §11, §12).

### 4. A control pattern takes its rhythm from the left

```
hh*16 velocity "1 .35 .6 .35":      1 1 1 1 0.35 0.35 0.35 0.35 0.6 0.6 0.6 0.6 0.35 0.35 0.35 0.35
hh*16 velocity "[1 .35 .6 .35]*4":  1 0.35 0.6 0.35 1 0.35 0.6 0.35 1 0.35 0.6 0.35 1 0.35 0.6 0.35
```

The STYLE §11 ghost-note example used the first form. Fixed, with a rule (STYLE §11 item 7; contracts §0.17).

### 5. Sections restart inside `arrange()`, so a key plan cannot live in a section

```
const a = n("<0 1 2 3>")…; const b = n("<4 5 6 7>")…; mel: arrange([2, a], [3, b], [2, a])
=> 0:C4 1:D4 2:G4 3:A4 4:B4 5:C4 6:D4            (a starts again from its first bar)

const melChorus = n("0 4").scale("<C4:major!2 D4:major!2>"); mel: arrange([2, melChorus], [2, melChorus])
=> bars 0-3 all (C4 major); D major only on the second pass of the whole piece

mel: arrange([4, melVerse], [4, melChorus], [4, melChorus]).scale("<C4:major!8 D4:major!4>")
=> 7:G4(C4 major) 15/2:E4(C4 major) 8:D5(D4 major) 33/4:C#5(D4 major) …
```

"Key changes use a patterned `.scale()`" (plan resolution 3) and "one `arrange()` per labelled track" (resolution 11) only work together when the `.scale()` pattern follows `arrange()`. Written down in contracts §0.18, §6.3 items 6–7, §6.8 item 4, STYLE §9 and §10, with the lint warnings `code.arranged-scale-pattern` and `form.section-period`. U17.L02's objective was reworded.

### 6. Smaller corrections by execution

| Claim | Observed | Where fixed |
|---|---|---|
| `"C4 major"` "is an error" | nothing is thrown: `[tonal] error: Scale name C4 is incomplete…` is logged and `n("0 2 4")` plays one G3 | contracts §0.22, STYLE §3 |
| `.add("…")` is a no-op | so is `.add(3)` (`[warn]: Can't do arithmetic on control pattern.`); `.add(n(3))` works | contracts §0.19, STYLE §6, §12 |
| `tb.clip` and `tb.legato` are two controls | `.legato(.5)` → `{"note":"c4","clip":0.5}` | contracts §0.20 |
| `mode("root:g2")`: "root near that note" | C → C2, A → A1, F → F2, G → G2: highest root at or below | contracts §0.21, STYLE §5.3 |
| swing and durations (unstated) | `s("hh*8").swingBy(1/3, 4)` → `0-1/8 1/6-7/24 1/4-3/8 … 11/12-25/24` | contracts §0.26, §6.10 item 6 |

## What execution confirmed (no change needed)

- Chromatic steps in C major: `0#`→C♯ `1#`→D♯ `3#`→F♯ `4#`→G♯ `5#`→A♯ `1b`→D♭ `2b`→E♭ `4b`→G♭ `5b`→A♭ `6b`→B♭; `7b`→B♮. Also right in G, F, D, E♭ major and A minor (`n("3#").scale("G4:major")` → C♯5; `n("6#").scale("A4:minor")` → G♯5). Raw spellings are wrong as documented (`n("3#")` → `Gb4`).
- `scale("C4:major")`: `n("0 1 2 3 4 5 6 7 -1 -7 14")` → C4 D4 E4 F4 G4 A4 B4 C5 B3 C3 C6. `"C:major"` → C3. Every scale name in STYLE §3 exists and has the stated notes (`blues` = C E♭ F F♯ G B♭; `bebop` = dominant bebop).
- Swing: `hh*8 swingBy(1/3,4)` → `0 1/6 1/4 5/12 1/2 2/3 3/4 11/12`; `.swing(4)` identical; `hh*6 swingBy(1/3,3)` → `0 2/9 1/3 5/9 2/3 8/9`; `hh*16 swingBy(1/3,8)` swings 16ths; quarters unchanged; `swingBy(.2,4)` puts the off-beat at 0.6 of the beat, i.e. `(1+x)/2`.
- Euclid: `bd(3,8)` → `0 3/8 3/4`; `bd(5,8)` → `0 1/4 3/8 5/8 3/4`; `bd(3,8,2)` = `.euclidRot(3,8,2)` → `0 1/4 5/8`. Son clave 3-2 on the 2-bar 8th grid → `0 3/8 3/4 | 5/4 3/2`; rumba → `0 3/8 7/8 | 5/4 3/2`.
- `arrange([8, v], [8, c])`: 8 + 8 bars, `silence` sections work, a method chain after `arrange()` works.
- Pickup: `n("<[~ ~ 4] [7 ~ 6] [4 ~ 2] [0 ~ ~]>").scale("G4:major")` at `setcpm(96/3)` → `2/3:D5 1:G5 5/3:F#5 2:D5 8/3:B4 3:G4`.
- Ranges, `.add(n(…))`, `.scaleTranspose`, `.transpose("3M")`, patterned `.scale()` with correct `context.scale`, `.transpose()` leaving the context unchanged, `.nudge()` leaving onsets unchanged, single-quoted strings giving one event, `_name:` muting, the second of two equal labels winning.
- Every method named in the unlock table exists on `Pattern.prototype` in core 1.2.6, including the † rows (`partials distorttype tremolosync tremolodepth lprate lpdepth duckorbit duckdepth`). `scope`, `fscope`, `piano` and the visual methods do not exist in the core-only realm, so the grader stubs are required.
- The `_oakChord` shim survives `voicing()` on the main thread: `chords@0:{"note":"C4","_oakChord":"Dm7","s":"rhodes"}`; also through `.struct()` and the `n().chord().voicing()` form. (Worker behaviour is S1's question.)
- All 19 runnable ```js blocks (and the 6 "Wrong" blocks, line by line) of STYLE.md and all 12 code strings of the AUTHORING skeleton evaluate with no error and no log line, after the edits.

## Table checks (`consistency.py`)

```
lessons+cps parsed: 211 core capstone sessions: 29
default order sessions: 183
skills: 143
unlock rows: 212
skills in >1 checkpoint: {'V04': ['U03.CP', 'U07.CP'], 'E10': ['U10.CP', 'U14.CP'], 'E14': ['U13.CP', 'R.CP']}
skills in no checkpoint: []
ERRORS: 0
```

It checks: the default order has every core lesson, checkpoint and capstone session exactly once; checkpoints fall after the next unit's L01 and before its L03; the gym slot rule reproduces GYM.01–17 and the CF-T slots; every skill is introduced exactly once, where the skill table says; every prerequisite and every "practises" entry is introduced in a lesson that is guaranteed earlier under the legal-order rules now in contracts §7.6 (or earlier in the same lesson's list); every unlock site exists. Before the edits it reported M01 in two gating checkpoints, R13 in two, and D01 and M09 in none.

Found by reading the tables against each other (a script cannot see these until lesson code exists):

- U02.L01 needs `note("c4").s("piano")`, but note names unlocked at U02.L02 and `.s()` on pitches at U02.L06. Both moved to U02.L01.
- A1.L04 (open from U03) needs `.delay()` (U10.L09); A1.L05 needs `.distort()` (U11.L03); A2.L05 needs `.pan()` (U14.L06); A1.L02 needs `.lpf()` (C1). Solved with alternative unlock sites (§3.1 rule 11).
- `ebass` and `.lpf()` unlock at the start of C1, but nothing forces a learner to start C1. Fallback grant on completing U03.L03 (§3.1 rule 12), and an explicit rule that a capstone never gates a lesson (§7.6).
- RC1 asked for a Dorian vamp and a `horns` sound; the rhythm track opens at U13.CP, before U14 (Dorian) and U15.L05 (horns). AC1's tunes need U11 (dominant sevenths, 12-bar form) but AC1 opened at A.CP, reachable after U10.CP.
- J03 was in J.CP1 "if J2.L04 is done" and also in J.CP2.
- 2/4 was in the meter table and in `fam.rhy.meter` level 2 but no lesson or toolbox row taught it.
- `fam.har.schema` level 3 (12-bar blues, U11.L05) blocked level 4 (Aeolian and Andalusian loops, U10.L07) for a whole unit; `fam.har.cadence` did not say where IAC sits. Both ladders re-cut.
- ID grammar: `fact.keysig.Eb-major` did not match the fact-card regex; `lint.strict.this` did not match the feedback-code regex.
- AUTHORING: U02 coloured the roll by degree before degrees exist; the exemplar's rung-3 hint was the answer; 9.3 expert minutes × 1.4 = 13.02 fails the 13-minute check.

## Gotchas against the research

- The research and both critiques list which symbols each dictionary *has*. Having a key is not enough: two entries have wrong intervals. Any future dictionary bump needs the pitch-class test, not a key lookup.
- "Unknown chord → silence + log" is true. Wrong chord → no log at all.
- The voicing registry gives `guidetones` `mode: 'above'`, but `voicing()` overwrites it with `undefined`, so the effective default is `below` with anchor `c5` for every dictionary in 1.2.6.

## Open items

- † rows and every sound alias: audibility is S3's.
- `_oakChord` inside a Worker: S1's. The documented fallback is the chord symbol from the event's source location.
- The governor's numbers (12 active families with gated ladders, the 300-day simulation) cannot be tested until `@oak/srs` exists; the "gated ladders" graduation rule in §7.4 is a reasoned decision, not a measured one.
- `fam.rhy.count` keeps a ladder whose level-3 gate (U13.L05) is one lesson after its level-4 gate (U13.L04). Harmless under the new category gates; not re-cut.
- Left as the previous author decided, though beyond the plan's wording: "Continue anyway" from the third checkpoint attempt whatever the score; two `submit_*` tools on top of the plan's five.
- Unlock-before-use against real lesson code is still only a CI rule: no lesson code exists yet.
- `docs/design/exercises.md` is still the truncated copy; contracts §5 names the unchanged types without reproducing them.
- Tutor API and ts-fsrs statements were not re-verified here (S6, S7).

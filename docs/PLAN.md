# Oak: learn music theory by writing music in Strudel

## Context

You want to learn music theory from zero, well enough to **compose new music and transcribe existing music**. You're a programmer with no musical training, so you'll learn by writing real music in **Strudel**, the JavaScript port of TidalCycles. Strudel is the medium; music theory is the subject. Oak is the learning environment around it: progressive lessons, exercises, challenges and capstones. It should be practical and rewarding, with a constant sense of progress and a reason to come back every day. `/Users/fpl0/Code/Oak` is empty and isn't a git repo yet.

**Your decisions:**
- Personal and local-first: no accounts, runs on `127.0.0.1`.
- Genres: pop/rock/indie and jazz/soul/funk.
- Inputs: headphones plus a mic for singing, graded by pitch detection.
- Staff notation is taught alongside code and the piano roll.
- The Claude tutor is central.
- Sessions are 15–25 minutes a day.
- Motivation: all four mechanics (unlockable toolbox, skill map, personal album, daily drills with streaks).
- Advanced tracks: jazz harmony, advanced rhythm, arrangement & sound.
- Everything is TypeScript on Bun and Node.

**How this plan was made:**
1. Eight read-only research agents checked current versions and read the source of Strudel 1.2.6/1.3.0, Bun 1.4.4, Vite 8, abcjs, tonal, pitchy, ts-fsrs and the Anthropic SDK 1.8. They also surveyed the teaching literature: Open Music Theory, Hooktheory, Berklee ear training, Levine, FSRS and gamification studies.
2. Four designers wrote the curriculum, the exercise/drill system, the UX and the architecture.
3. Two adversarial critics reviewed those drafts. One checked feasibility and consistency; the other walked through the experience as you would live it.
4. The full documents (about 370 KB) are saved in Wave 0. **Where they conflict, the "Binding resolutions" section below wins.**

Where the source files are now:
- **Design docs and critiques:** `/private/tmp/claude-501/-Users-fpl0-Code-Oak/8592f9df-a134-4bd9-b6b0-4a4489c3872b/scratchpad/` (`design-{curriculum,exercises,ux,architecture}.md`, `critiques.md`, `pedagogy.txt`, `followups.txt`).
- **Research JSON:** `…/tasks/w5r3b8fts.output`.
- **Fallback copies:** the workflow journals under `~/.claude/projects/-Users-fpl0-Code-Oak/8592f9df-…/subagents/workflows/{wf_1c4561a2-d95,wf_5b9d4827-65b}/journal.jsonl`.

---

## What Oak is: the daily experience

**Tagline:** "Oak: grow an ear, one ring a day." Each day is one session of 15, 20 or 25 minutes, in four parts:

1. **Warm-up** (about 5 min): spaced-repetition drills, always opening with an easy win. Ear drills are short sets of freshly generated trials, each in a new key, register and instrument.
2. **New** (about 10 min): the next lesson, run as **Predict → Run → Investigate → Modify → Make**. You hum what you think the code will sound like, run it, explore it, then change it with automatic checks.
3. **Make** (about 4 min): a 2–8 bar sketch over a **Band layer**, a read-only backing in your chosen flavour (pop, indie, jazz-soul or funk). Even day 3 sounds like a song.
4. **Coda** (about 1 min): what you can now do, any newly unlocked tool, an optional comment from the tutor, and a preview of the next unlock. The last button is **Done for today**.

**Concept order:** every concept goes sound first, then code, then symbol. The **Music Workbench** keeps three views linked: the Strudel editor, a piano roll with 1-based scale-degree labels and colours, and abcjs staff notation. Click a note in any view and it lights up in the other two, so you see the music, the code and the notation as one thing.

**Pitch language:** scale-degree numbers (1 2 ♭3 … ♯4) come first, with movable-do as the singing aid (do-based minor). Strudel's 0-based `n(...).scale()` is taught explicitly as "degree − 1".

**What brings you back** (every reward tells you something real):
- **Toolbox:** each Strudel function, instrument or effect unlocks with the concept that justifies it. For example, `.scale()` comes with the major scale, and `chord().voicing()` comes only after you've voiced inversions by hand.
- **Skill map, "The Oak":** concepts are leaves on a tree. A leaf stays green while you're on schedule and fades only when a review is genuinely overdue.
- **Album:** each capstone becomes a track. Its cover art is "tree rings" generated from the music, and it gets liner notes listing the theory you used, plus a version history.
- **Streak:** the main streak counts weeks in which you met your weekly goal. Rest days are planned, a missed day can be repaired within 48 hours, and nothing ever shames you.
- **Can-do ledger and milestones:** for example, "You can now compose a four-chord song" and "You can now transcribe a bass line".

**Tutor (Claude):**
- It's a docked panel that knows your lesson, step, code, grader result and progress. Context chips show exactly what gets sent.
- It is Socratic and gives graded answers only through the 4-rung hint ladder: where → what → partial → reveal. The server holds back solutions until rung 4.
- It reviews every capstone and transcription and comments on sketches.
- It never decides pass or fail; deterministic graders do that.

---

## Curriculum (about 250 sessions, roughly 11–12 months at 5 sessions a week)

Lesson IDs are `Uxx.Lyy`. Checkpoints are `Uxx.CP`. Capstones are `C#` (pop/rock), `X#` (transcription), `CF-A` and `CF-T` (core finale), `JC#`, `RC#` and `AC#`. The full lesson-by-lesson map lives in `docs/design/curriculum.md`.

### Core (about 175 sessions)

| Unit | Sessions | Content | Capstone / album |
|---|---|---|---|
| U00 Onboarding | 2 | Audio unlock and a 4-layer "wow" loop in 90 s; paste your API key in the app; headphones, mic, vocal range and tap-latency calibration; first sung tonic (lenient) | Sketch 001 |
| U01 Pulse & Rhythm I | 10 | Pulse, tempo (`setcpm`, where 1 cycle = 1 bar), backbeat with named labels, 8ths and 16ths, counting 1-e-&-a, rests, rhythm notation, 3/4, fills, a swing *feel* preview, drum transcription | **C0 Intro** (first album track, around session 13) |
| U02 Pitch & Treble Staff | 10 | High/low, note names, C4 = 60, half and whole steps, accidentals, treble staff, transposing, timbres, pitch matching, playing from the page | **C1 First Loop** (bass unlocks here) |
| U03 Major Scale & Degrees | 12 | The original first lesson is **split in two**: L01 "Home & the major scale" and L02 "Degrees in code" (`n = degree−1`). Then 2/4, 6/7, key as a parameter, sharp and flat keys, the circle of fifths, solfège, tunes by number, by-ear transcription, melody workshop | – |
| U04 Intervals | 5 | **Compressed:** intervals inside a key, quality, harmonic intervals and consonance, ear lab. Inversion and compound intervals move to U12/J1 | – |
| U05 Triads | 9 | Stacking thirds, M/m/dim/aug, chord symbols ↔ lead sheets, inversions, bass clef and grand staff, **hand voice-leading** (the gate for `voicing()`), then "let Strudel voice it" | – |
| U06 Diatonic Harmony | 13 | Seven chords, Roman numerals, T/PD/D function, cadences, hearing the bass first, schemas (I–V–vi–IV, doo-wop, three-chord rock), harmonic rhythm, slash chords, comping. Plus a **seventh-colour preview** (`n("[0,2,4,6]")`, neo-soul loop) | – |
| U07 Melody | 15 | Contour, motif and variation, chord tones, non-chord tones, question and answer, call and response, **pickups (anacrusis)**, lead sheets, hooks | **C2 Four-Chord Song**; **X1 Folk Transcription** (3 sessions, phrase by phrase) |
| U08 Bass Lines | 5 | Roots, root–5–octave, approach tones, locking with the kick, bass dictation | – |
| U09 Form | 9 | Phrases into sections, verse/chorus, AABA, energy curve, arranging in code | **C3 Verse–Chorus Demo** |
| U10 Minor | 12 | Natural, relative and parallel minor, the Aeolian loop, harmonic-minor V, Andalusian cadence, melodic minor | **C4 Minor Indie Ballad** |
| U11 Pentatonic & Blues | 13 | Pentatonics, blue notes, dominant 7, 12-bar form, quick change and turnaround, shuffle (`swingBy`), riffs | **C5 12-Bar Shuffle**; **X2 Blues Transcription** |
| U12 Seventh Chords | 6 | maj7, m7, 7, m7b5, dim7, diatonic sevenths, guide-tone preview, left-hand voicings (plus interval inversion) | – |
| U13 Rhythm II | 7 | Anticipations, 16th grooves and ghost notes, ties, compound meter, triplets. Opens the J and R tracks | – |
| U14 Modes | 9 | Mixolydian, Dorian, Lydian, Phrygian, each through its characteristic tone | **C6 Modal Vamp** |
| U15–U17 Chromatic | 16 | Secondary dominants, tonicization, borrowed chords (iv, ♭VI, ♭VII, ♭III), modulation (pivot, truck-driver lift via patterned `.scale()`) | **C7 Chromatic Colour** |
| Core finale | 8 | The finale is **split in two**: CF-A album single (4 sessions) and CF-T, a full transcription of a public-domain standard (4 sessions in gym slots) | 2 tracks |
| Transcription Gym | about 15 | From U07 on, every 5th session alternates the graded ladder with your own audio | – |

### Advanced (about 75 sessions)

**Jazz harmony** (reordered so music comes first):
- J1: swing feel and the ride cymbal → reading 7th-chord symbols → major ii–V–I → guide-tone lines → shells. By J1.L05 you're comping your own swinging ii–V–I.
- J2: all 12 keys; minor iiø–V7alt–i with alterations in context; extensions; chord-scales (after U14).
- J3: rootless and drop-2 voicings, walking bass.
- J4: turnarounds, jazz blues, rhythm changes.
- J5: tritone substitution, backdoor, reharmonization.
- Capstones: **JC1 ii–V Ballad**, **JC2 Jazz Blues in F**, **JC3 Rhythm-Changes contrafact** (*I Got Rhythm*, 1930, public domain), **JC4 Reharmonize** *Georgia* or *Body and Soul*.

**Advanced rhythm:**
- R1: metric weight, swing ratios, "the one", interlock, laid-back feel.
- R2: 5 and 7, hemiola, 3:2 and 4:3, polymeter.
- R3: tresillo and cinquillo, clave direction on a 2-bar 8th grid, Euclidean rhythms, montuno.
- Capstones: **RC1 16th-note funk**, **RC2 Clave & polyrhythm**.

**Arrangement & sound:**
- A1: waves, filters, envelopes, space, grit, movement, FM. A1.L01–L04 open early as optional side lessons from U03.
- A2: roles and registers, texture, counter-melody, sampling, mix, genre translation.
- Capstones: **AC1 One Tune, Two Genres**, **AC2 Neo-Soul Ballad**.

### Running through all units

**Ear training stages** (in-key first, Functional Ear Trainer style):
- A: pulse, echo, pitch match, find the tonic
- B: degrees 1-3-5, then 2 and 4, then all seven
- C: intervals in a key, then melodic dictation
- D: chord quality, bass-degree dictation, schema ID, inversions
- E: minor degrees, 7th-chord qualities, blues, modal colour
- F: chromatic degrees, secondary and borrowed chords, modulations
- G: jazz (ii–V, guide tones, extensions)
- H: rhythm (syncopation, swing ratio, clave, odd groupings)

You sing the resolution on 2–3 trials per set, never on every trial.

**Transcription ladder:**
1. Generated drum loops
2. Bass lines
3. Four-chord loops (bass first)
4. Short melodies
5. Public-domain folk: *Aura Lee*, *Red River Valley*, *Shenandoah*, *Drunken Sailor*, *Scarborough Fair* (traditional melody)
6. Blues and standards published in 1930 or earlier
7. Your own audio
8. A full arrangement

Each answer is Strudel code, so you can A/B it against the original. Realism grows over the ladder: humanized timing, swing, buried parts, reverb, detune. Every song carries a provenance citation.

**Other learning-science features:**
- Spaced repetition: FSRS-7 over fact cards and perceptual "skill families".
- Interleaving by default.
- Adaptive drills that aim for about 85% success.
- Mastery checkpoints.
- A daily "Read it" staff → code drill from U02.
- A "Play from the page" step in each unit.

---

## Binding resolutions (they override the design docs and become `docs/design/contracts.md`)

1. **One contract and one registry.**
   - Schemas: Exercise, Matcher, RubricRule, GradeResult and Diagnostic come from the exercises document.
   - Hints are a fixed 4-tuple: nudge, pointer, partial, reveal.
   - IDs come from the curriculum: lessons, capstones and 139 skill nodes. Families are `fam.*`, tools `tb.*`, sounds `snd.*`.
   - `content/.generated/ids.ts` is generated, and CI rejects unknown or duplicate IDs.
   - Each lesson folder holds `lesson.ts` (typed truth: code, exercises, grading, unlocks) and `lesson.mdx` (prose only).
2. **One unlock table, `content/toolbox.ts`.**
   - The UX and architecture tables are generated from it.
   - `voicing()`, `rhodes` and `organ` unlock at U05.L08, once the U05.L07 hand-voicing check passes at ≥0.9. That evidence comes from your code only, so no ear-training skill can block it.
   - `ebass` and a bass filter preset unlock at the start of C1.
   - One toolbox-aware lint, shared by the editor, grader, content CI and tutor cards, also walks string arguments: sound names, scale names, chord-symbol families and mini-notation operators.
   - Graded steps reject locked tools. Studio only shows a hint and never blocks; sketches that use preview tools are flagged in their liner notes.
3. **Strudel dialect spec, enforced by lint.**
   - Track labels are lowercase names (`drums:`, `bass:`, `chords:`, `mel:`), never `$:`.
   - Chord spellings must resolve in every voicing dictionary: `C Cm Co Caug C^7 C7 Cm7 Cm7b5 Co7`. The lint knows which `dict()` is in use.
   - Chromatic degrees: `n("3#")` = ♯4, `n("6b")` = ♭7, `n("2b")` = ♭3.
   - Drum banks use full names (`RolandTR909`).
   - Swing is `swingBy(1/3, beatsPerBar)`, and the notation pipeline carries `swing:{subdivision, amount}`.
   - Meter has a `tempoUnit`: cpm = bpm / beat units per bar.
   - Key changes use a patterned `.scale()`, not `.transpose()`.
   - `mode("above")` is not allowed.
   - Pickups are written as leading rests in bar 0, plus `pickup` metadata.
   - Voicings are graded on pitch-class set plus bass only.
   - Microtiming uses `.late()`; `nudge` is Studio-only.
4. **Mute and solo never rewrite your code.** The adapter wraps the `.p` collector at evaluation time, and the grader ignores UI mute state.
5. **Session budget.**
   - Lesson content (New + Make) is at most 13 min at the 20-min target, using a 1.4× beginner multiplier. At most 3 graded checks per lesson, at most 12 steps, and at most 2 of {roll, staff, keyboard} per step in U00–U04.
   - Every lesson has an authored "save & wrap" midpoint for the 15-min setting.
   - Content CI fails anything over budget.
   - Real step durations are logged locally and shown on `/dev/telemetry` so the budget can be recalibrated.
6. **Review-load governor.**
   - One FSRS card per drill family, with categories inside it for sampling.
   - Grade map: <.65 Again, <.80 Hard, otherwise Good, ≥.95 and fast Easy. A revealed answer counts as Again.
   - At most 12 perceptual families are active. Mastered families graduate into 3 composite "mixed ear" cards (pitch, harmony, rhythm).
   - New cards are throttled against a 7-day forecast, and after a gap the backlog is spread over 5–7 days.
   - In-lesson and gym work counts as evidence.
   - New terms become glossary entries unless a later lesson tests them.
   - Raw due counts are never shown.
   - **CI runs a 300-day simulation and requires the p95 warm-up to be ≤4, 5 or 6 min** for the 15, 20 and 25-min settings.
7. **Checkpoints.**
   - A checkpoint is the New block of a normal session: about 12 min, followed by a Make. It is scheduled after the next unit's L01.
   - It gates only on concept, code and notation items: ≥85% overall and ≥70% for each skill.
   - Perceptual and singing items set levels and can create a "debt", but **never block**. Singing never gates anything.
   - A soft pass is granted after one retake at ≥0.75.
8. **Singing and tapping each use one grading rule** (`gradeSung` from the exercises document).
   - Pitch tolerance starts at ±70¢ and tightens with performance toward ±25¢, never during a checkpoint week.
   - Tap tolerance is set automatically, with a 50 ms floor.
   - A no-mic / Quiet mode exists: voice skills advance only from mic evidence, and nothing else depends on them.
   - AirPods guidance is part of setup.
9. **Streaks and returning after a break.**
   - Any of these counts as a day: a review set, a saved sketch, or a 2-min keep-alive.
   - The main streak counts weeks that met your goal. Banked rests (one per goal-week met, at most 2 banked) cover a short week. Missing a day can be repaired with any qualifying activity within 48 h.
   - After a gap of 3 or more days: the warm-up picks items you're likely to get right (0.75–0.90 predicted success), a 30-second recap plays your last sketch, then you go straight to the **next** lesson. A light session is used only after gaps of 10+ days.
   - Leaves are shaded relative to each card's own desired retention, using a weighted mean.
10. **Tutor.**
    - **Model** `claude-opus-5-5` on every route with adaptive thinking (`display:"summarized"`). Effort is fixed per thread kind: hints and listening notes low, chat medium, reviews high. Effort never changes inside a conversation.
    - **Refusal fallbacks** are on: `server-side-fallback-2026-07-01`, `fallbacks:"default"`.
    - **API features:** only features verified in research are used until spike S6 proves any beta. That means no forced `tool_choice`, no temperature, strict tools with `tool_choice: auto`, and `eager_input_streaming` on `propose_code`.
    - **Threads:** one thread per (subject, day), append-only, seeded from saved tutor notes.
    - **v1 tools:** `evaluate_strudel`, `compare_haps`, `get_learner_progress`, `get_lesson_context`, `propose_code`. Reviews use one zod schema per kind: 2–3 strengths anchored to bars, one revision (two from C5 on), one listening question, and liner notes of at most 60 words.
    - **Answers withheld:** tool executors read your current hint rung and remove solutions, expected values and "what" details until the matching rung. A recorded-response ("cassette") test asserts that no solution leaks.
    - **You type your own code:** in Make steps and capstones, tutor code cards are Preview-only until the track is released. Mastery evidence comes only from code you wrote.
    - **Vocabulary:** the tutor gets the list of terms you've been introduced to and marks anything beyond it as a preview.
    - **Cost:** shown in Settings only. A soft warning is always on; a hard cap is optional and off by default.
11. **Capstone and grading fixes.**
    - Capstone grading mode allows up to 128 bars and 5 s, and computes duration from the code's structure instead of by playing it.
    - Form is defined by one `arrange()` per labelled track, with matching sections.
    - C2 checks the schema loop in bars 1–6 plus a cadence in bars 7–8, against the triad core so any flavour passes. Motif reuse ≥0.5, phrased as "vary your bar-1 idea".
    - X1 opens only once melodic dictation reaches level 4. Meter, key and pickup are given, and pass needs ≥85% melody accuracy.
    - Make steps have one required rule; the others are suggestions. Going past the brief earns a "you went past today's brief" note, not a ✗.
12. **Sounds.**
    - Every effect control in the catalog must pass an audibility test (render with and without it, then compare); only `audible:true` controls can unlock.
    - `.scope()` and `.fscope()` route to Oak's own spectrum panel.
    - The drum set includes sh, cb and tb.
    - Each flavour kit ships production defaults (room, gentle low-pass on bass, humanized velocity, pan).
    - A listening pass may swap a cheap-sounding GM patch for a superdough synth patch.
13. **Security.**
    - The server binds `127.0.0.1` and checks Host and Origin, plus an `X-Oak` header. Media GETs are exempt but must be `Sec-Fetch-Site: same-origin`.
    - CSP: `script-src 'self' 'unsafe-eval' data: blob:`.
    - Code you didn't type gets a strict lint profile: no computed member access, no `this`, no `constructor`/`__proto__` strings.
    - Grader workers disable the `Function` constructor after setup and run with no environment.
    - The API key lives in `.env.local`, or is pasted in Settings and stored at `~/.oak/secrets` with mode 0600. It is never sent to the browser.
    - Destructive endpoints (restore backup, delete) need a confirm nonce.
    - Tutor markdown is rendered without raw HTML.
14. **Content operations.**
    - Content versioning: completed steps, SRS cards and unlocks survive edits to a lesson.
    - A "Report a grading problem" button logs the attempt to a local QA queue.
    - Your own audio is included in backups.
    - Content is authored **just in time**, staying at least 2 units ahead of your progress.

---

## Architecture

| Area | Decision |
|---|---|
| Runtime and package manager | **Bun 1.4.4**: workspaces, `Bun.serve` API, headless grader, tests. Frontend tooling runs on **Node 26** through `bun run` scripts |
| Frontend | **Vite 8.3.7**, **React 19.3** + React Compiler, **TanStack Router + Query**, **Zustand**, **XState 5** (lesson, drill and session machines), **Tailwind 4.3**, MDX 3 |
| Strudel | Granular packages pinned exactly: `@strudel/{core,mini,transpiler,tonal,draw}@1.2.6` and `@strudel/{codemirror,webaudio,soundfonts}@1.3.0` with `superdough@1.3.0`. No `@strudel/web` or `@strudel/repl`. `bun patch @kabelsalat/web` changes `main` to `dist/index.mjs`, which fixes Bun/Node imports. Everything goes through the **`@oak/strudel` adapter** because main renames `defaultOutput` to `onSchedule`, and the adapter makes that a one-file change |
| Editors | `StrudelMirror` per editor with `solo:true` and unique ids ending in `_`. Oak's CodeMirror extensions are added via `StateEffect.appendConfig`. One evaluation mutex, full `dispose()`, at most 6 live editors (lazy-mounted with an LRU) |
| Grader | `@oak/grader` uses only core, mini, tonal and transpiler. It has its own `.p` collector, stubbed repl-only functions, captured log output, `valueToMidi` normalization, onset-only haps, and a matcher library (rhythm F-measure, transposition-invariant melody alignment, per-chord bass/root/quality/Roman-numeral, pitch-class sets, cadences, schemas, voice-leading, swing ratio, groove lock, form, energy). It runs in a browser Worker (1.5 s kill, hap cap) and a Bun Worker (tutor tool and tests) |
| Theory | `@oak/theory` wraps **tonal 6.5.1** with normalization: Strudel `s`/`f` accidentals, octave-3 default, iReal ↔ lead-sheet symbols ↔ abcjs display. Roman numerals are graded by degree, chroma and bass, never by string |
| Notation | `@oak/notation`: exact-fraction quantizer → bars, ties, tuplets, beaming, swing and pickup → key-aware spelling → ABC with `!class=oak-e{id}!` → **abcjs 6.7.2**, lazy-loaded. Highlighting follows Strudel's clock. A staff-input pointer layer sits over the SVG |
| Audio | One Oak-owned AudioContext shared with the mic, resumed explicitly on a user gesture. Self-hosted **sound pack** (about 25 MB, mirrored by a script with a committed lockfile and checksums, served at `/sounds/<ver>`, cached by a Service Worker). Curated instrument aliases. Preloader. Master limiter. MediaRecorder for album export (v1); offline renderer later |
| Mic | **pitchy 4.1** in an AudioWorklet (`?worker&url`), with echo cancellation, noise suppression and auto gain off. Clarity ≥0.9, median-of-5, octave folding. Calibration covers latency, headphones and bleed |
| Transcription | **signalsmith-stretch 1.3.2** (rate, ±semitones, ±50¢ fine-tune, A–B loop) + **wavesurfer 8** (display, regions, spectrogram). A "pattern source" mode plays Oak's ladder renditions from hidden code. "Hum it, Oak drafts it" turns sung lines into draft `n()` code |
| SRS | **ts-fsrs 6.0.0** `DefaultScheduler` (FSRS-7) behind `@oak/srs`, which also implements the governor (resolution 6) |
| Server | **Hono** on `Bun.serve` at `127.0.0.1:8787`. **SQLite** (`bun:sqlite`) at `~/.oak/oak.db` is the single source of truth. Audio lives in `~/.oak/audio`. Migrations, JSON+audio backup, zod contracts in `@oak/api` with a typed client, SSE for the tutor (`server.timeout(req,0)` plus heartbeats) |
| Tutor | **@anthropic-ai/sdk 1.8** (Messages API, not the Agent SDK). Manual streaming loop with `client.beta.messages.stream` + `finalMessage`. Cache layout: sorted tools → system [persona, syllabus vN, Strudel function catalog vN, 1 h TTL] → append-only messages, with volatile context in the newest turn. Warm-up request at session start. Usage logged per call |
| Quality | Biome (lint/format, enforced import boundaries), TypeScript 7 typecheck (app, server and worklet projects), `bun test`, Vitest 5 browser mode (audio and CodeMirror), Playwright with fake-mic WAVs. **Chromium-based browsers only** (Chrome/Arc/Edge) |

**Repo layout** (Bun workspaces; full tree in `docs/design/architecture.md` §1.1):

```
app/        Vite React SPA: routes/, workbench/, lesson/, drills/, tutor/, session/, studio/, transcribe/
server/     Hono API: db/ (migrations, repos), services/ (srs, mastery, unlocks, session-plan, streak, album, backup), grader/, tutor/
packages/   api · theory · grader · notation · pitch · drills · srs · content-kit   (isomorphic: no DOM, no Bun APIs)
            strudel · audio                                                         (browser only)
content/    AUTHORING.md STYLE.md toolbox.ts skills.ts families.ts repertoire/ core/Uxx/Lyy/{lesson.ts,lesson.mdx} advanced/ validate/
sounds/     pack.lock.json (committed), pack/ (gitignored mirror)
scripts/    sounds/ content/ catalog/ tutor/ db/
docs/       design/ (4 design docs, critiques, research digest, contracts.md), spikes.md
e2e/ tests/ types/ (hand-written strudel.d.ts, abcjs-ext.d.ts) patches/
```

**Main routes:**
`/` (Today) · `/onboarding/$step` · `/learn/$lessonId` · `/checkpoint/$unitId` · `/capstone/$id` · `/session/coda` · `/studio` (sketchbook / free play) · `/oak` (skill map) · `/practice` · `/transcribe/$projectId` · `/album/$trackId` · `/toolbox/$toolId` · `/progress` · `/settings/*` · `/dev/{listen,telemetry,qa}`

---

## Implementation waves

Each wave runs as multi-agent workflows: parallel implementers on independent packages, then adversarial review and verification. Approving this plan includes `git init` and **one local commit per wave**. Nothing is ever pushed.

| Wave | Deliverables | Gate |
|---|---|---|
| **W0: Foundations and de-risking** | `git init`. Save the design docs, critiques and research digest to `docs/design/`, and write `contracts.md` + `content/STYLE.md` (the dialect spec) from the binding resolutions. Repo skeleton, exact pins, kabelsalat patch, `check-deps`. **Spikes:** S1 headless grader in a Bun Worker (`$:`/labels, kill path). S2 three StrudelMirrors in Vite + React StrictMode (solo, extensions, leak check). S3 sound-pack mirror, prebake, Service Worker offline, preload with no skipped haps, audibility harness. S4 haps→ABC with clock-driven highlighting. S5 pitchy worklet + Playwright fake mic at 440 Hz within ±5¢ while Strudel plays. S6 tutor SSE, cache read > 0, fallbacks, strict and eager tools (**a few cents of API use, with your OK**). S7 ts-fsrs 6 on Bun | Every spike green, or a documented fallback in `docs/spikes.md` |
| **W1: Platform** | All packages at v1; Workbench (editor + roll + staff + highlight bus); both grader hosts; theory and notation v1; server (security, schema, endpoints, backup); content-kit, generators and validation suite; `/dev/listen`; sound pack v1 | `bun run check` green. A sample lesson using every MDX component and exercise kind passes validation. 30 golden notation snapshots. Adapter leak test green |
| **W2: First playable** | U00–U02 + C0 + C1; stage-A drill families; SRS + governor; Today; weekly streak; Studio; Toolbox v1; skill map v1 (graph render); Band layer (pop and jazz-soul flavours); tutor chat, hints, explain-mistake, listening note, code cards, usage; telemetry | U00→U01 e2e green. **You use it for 10 days.** Median session within budget. Tutor cache hit ≥80%. Then you start the course for real |
| **W3: Notation and voice** | Staff input, bass clef, grand staff, key signatures; FET degree drills with sung resolution, sing-echo, tolerance ladder, Quiet mode; U03 (split) and U04 (compressed) | Pitch fixtures: ≥95% of voiced frames within ±25¢, octave errors <2%. 80 notation snapshots. U03.CP end to end |
| **W4: Harmony, album, transcription** | U05–U07 + C2 + X1 + pickups; capstone flow, recorder, album with tree-ring covers and liner notes, reviews; Transcription Studio (your own audio, pattern-source ladder, realism levels, hum-to-draft); gym scheduling | C1 and C2 in the album with reviews. A/B drift <20 ms over 8 bars at 0.75× speed. Ladder levels L1–L4 graded exactly |
| **W5: Core content II** | U08–U11 + C3–C5 + X2 + A1 side lessons | Content gate (below) per unit |
| **W6: Core content III** | U12–U17 + C6, C7, CF-A, CF-T | Content gate |
| **W7: Advanced tracks** | Jazz (reordered), Rhythm, Arrangement & Sound + JC1–4, RC1–2, AC1–2; illustrated "Oak" tree; offline renderer | Content gate + track-specific notation corpora |

**Content authoring pipeline** (W2 onward, just in time):
1. **Unit spec:** checked against the skill graph. Every introduced node has its prerequisites introduced earlier, and every tool used is unlocked first.
2. **Parallel author agents:** each starts from `AUTHORING.md` plus the two exemplar lessons and loops on `bun run content:check <id>`.
3. **Adversarial music-theory reviewer:** re-derives every claim with the `@oak/theory` CLI.
4. **Playtest agent:** solves each step using only earlier lessons.
5. **Listen QA:** you hear only flagged or new examples, on `/dev/listen`.
6. **Merge:** green checks, then a commit.

Drills, fact cards and ladder levels L1–L4 are generated by code, not authored by hand.

---

## Verification

- **`bun run check`:** typecheck (3 projects), Biome, `bun test`. That covers the theory core, grader matchers, the notation golden corpus, SRS and the governor's 300-day simulation, tutor cassettes (prefix byte-stability, no solution leaks below rung 4), and **content validation**. Validation means:
  - every code sample evaluates headlessly and is not silent;
  - every reference solution passes;
  - every known-wrong variant fails with its expected feedback code;
  - all IDs resolve, and unlock-before-use and prerequisite ordering hold;
  - all sounds exist and every catalog control is audible;
  - every notated example renders to ABC;
  - every lesson fits its time budget.
- **`bun run test:browser`** (Vitest + Playwright Chromium): adapter leak and dispose, CodeMirror extensions, the worklet, sound audibility, recorder.
- **`bun run e2e`** (Playwright with fake-mic WAVs): onboarding → U01, a singing step at ±25¢, a checkpoint pass and soft pass, the capstone → album flow, Transcription A/B.
- **`bun run tutor:smoke`** (paid; runs only with your key and OK): a real chat turn with a tool call, then cache-hit and fallback-header checks.
- **Manual:** run `bun run dev`, open `http://127.0.0.1:5173` in Chrome, and go through onboarding and a full session. `/dev/telemetry` shows real step times and daily review load. These numbers recalibrate the budget and course length after W2.

## Defaults I chose (easy to change)

- Chromium-only.
- Scale-degree numbers with movable-do (do-based minor).
- US public-domain repertoire (published in 1930 or earlier) plus your own audio for modern songs.
- `claude-opus-5-5` for every tutor route, with refusal fallbacks enabled; effort is the cost lever.
- Weekly goal of 5 sessions.
- License: Oak stays private. If it is ever published, it must be AGPL-3.0-or-later because of Strudel.

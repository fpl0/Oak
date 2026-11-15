# Oak

**Grow an ear, one ring a day.**

Oak teaches music theory from zero by having you write real music in [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. Strudel is the instrument; theory is the subject. Every concept arrives **sound first, then code, then symbol**: you hear it, you write it, then you see it on the staff.

It's built for a programmer with no musical training who wants to **compose new music and transcribe existing music**. A daily session takes 15–25 minutes, and the whole course runs about a year.

Oak is personal and local-first. There are no accounts and no cloud. It runs on `127.0.0.1`, and your progress lives in a SQLite file in your home directory.

---

## What a session looks like

| Part | Time | What happens |
|---|---|---|
| **Warm-up** | ~5 min | Spaced-repetition drills, always opening with an easy win. Ear trials are generated fresh each time, in a new key, register and instrument. |
| **New** | ~10 min | The next lesson, run as **Predict → Run → Investigate → Modify → Make**. You hum what you think the code will sound like, run it, explore it, then change it while automatic checks grade what you wrote. |
| **Make** | ~4 min | A 2–8 bar sketch over a backing band in your chosen flavour (pop, indie, jazz-soul or funk). Even on day 3 it sounds like a song. |
| **Coda** | ~1 min | What you can now do, any tool you just unlocked, a note from the tutor, and a preview of what's next. |

The **Music Workbench** keeps three views linked: the Strudel editor, a piano roll labelled with scale degrees, and staff notation. Click a note in any view and it lights up in the other two.

## Features

- **176 lessons across 29 units.** The core runs from pulse and pitch through scales, intervals, triads, diatonic harmony, melody, bass, form, minor, blues, seventh chords, modes and chromatic harmony. Three advanced tracks follow: jazz harmony, advanced rhythm, and arrangement & sound.
- **Capstones that become an album.** Each capstone is a track on your personal record, with cover art drawn as tree rings generated from the music, liner notes listing the theory you used, and a version history. Tracks export offline.
- **A transcription ladder.** It climbs from generated drum loops to bass lines, chord loops, melodies, public-domain folk songs and pre-1930 standards, then to your own audio. Every answer is Strudel code you can A/B against the original, with time-stretch, pitch shift and A–B looping.
- **Ear training and singing.** Functional, in-key ear drills (degrees, intervals, chord quality, bass lines, schemas, modes, jazz, rhythm). You sing into a microphone and Oak grades your pitch with tolerances that tighten as you improve. Quiet mode turns the mic off, and singing never gates progress.
- **Spaced repetition that respects your time.** FSRS scheduling, with a governor that caps the daily warm-up. A 300-day simulation in CI checks that it stays within budget.
- **A toolbox that grows with you.** Strudel functions, instruments and effects unlock with the concept that justifies them. For example, `.voicing()` unlocks only after you've voiced inversions by hand.
- **The Oak.** The skill map is a tree. Each concept is a leaf, and it fades only when a review is genuinely overdue.
- **Streaks without guilt.** The main streak counts weeks in which you met your goal. Rest days are banked, and a missed day can be repaired within 48 hours.
- **A Socratic tutor (Claude).** A docked panel that knows your lesson, step, code and progress. It gives graded answers only through a four-rung hint ladder (nudge → pointer → partial → reveal), and the server withholds solutions until the last rung. It reviews capstones and transcriptions, but **it never decides pass or fail**; deterministic graders do.

## Desktop app

On an Apple Silicon Mac you can skip the setup below. Download `Oak-macos-arm64.dmg` from the [latest release](https://github.com/fpl0/Oak/releases/latest) and drag Oak to Applications. The app bundles Chromium (via Electron), Bun, the course and the sound pack, and it runs the same local server on `127.0.0.1:8797`. Progress lives in the same `~/.oak`, so the app and `bun run start` share it. The server log is at `~/Library/Logs/Oak/server.log`.

The build is ad hoc signed and not notarized, so the first time you open it, right-click Oak and choose **Open**. The tutor finds `claude` on your login shell's `PATH`.

To build it yourself (after `bun run build` and `bun run sounds:mirror`):

```bash
cd desktop && npm install && npm run dist
```

The DMG and zip land in `desktop/release/`. `OAK_SRC=<checkout>` stages from another checkout, such as a clean worktree of a release commit.

## Quick start

**Requirements**

- macOS or Linux
- [Bun](https://bun.sh) ≥ 1.4.4 and Node ≥ 26
- A Chromium-based browser (Chrome, Arc or Edge)
- Headphones, and a microphone if you want to sing
- *Optional, for the tutor:* [Claude Code](https://claude.com/claude-code) signed in to your Claude account

**Install and run**

```bash
git clone https://github.com/fpl0/Oak.git
```

```bash
cd Oak && bun install
```

Mirror the sound pack. It's about 25 MB, fetched once, and checked against `sounds/pack.lock.json`:

```bash
bun run sounds:mirror
```

Build the app and start the server:

```bash
bun run oak
```

Then open <http://127.0.0.1:8787> and follow onboarding. It unlocks audio, calibrates your headphones, microphone, vocal range and tap latency, and plays your first loop within about 90 seconds.

After the first build, `bun run start` serves the existing build without rebuilding.

### The tutor

The tutor has two backends, chosen under **Settings → Tutor**:

- **Claude CLI.** Runs on your own Claude plan through the `claude` command. If `claude auth status` reports you're signed in, it works with no further setup. Oak gives the CLI no built-in tools; its five learner tools are served over a local MCP endpoint, bound to each turn by a random token.
- **Anthropic API.** Paste a key on the same page, or set `ANTHROPIC_API_KEY` in `.env.local`. A pasted key is stored at `~/.oak/secrets` with mode `0600` and is never sent to the browser. Usage and an estimated cost are shown in Settings, with a soft warning.

The default, **Auto**, uses an API key if there is one, then a signed-in Claude CLI, and otherwise turns the tutor off.

Everything except the tutor works without it.

### Your data

| Path | What it holds |
|---|---|
| `~/.oak/oak.db` | SQLite, the single source of truth: progress, SRS cards, sketches, album, tutor threads |
| `~/.oak/audio/` | Your recordings and imported audio |
| `~/.oak/backups/` | Daily automatic database copies, plus any you make by hand |

**Settings → Data** exports a full backup, audio included, and restores one. For a quick copy of the database from the command line (safe while the server runs):

```bash
bun run db:backup
```

Set `OAK_DATA_DIR` to keep data somewhere else, for example a throwaway directory while you experiment.

## Development

```bash
bun run dev
```

This runs three things side by side: the API server (`OAK_DEV=1`, watching for changes) on port 8787, Vite on <http://127.0.0.1:5173>, and the content compiler in watch mode. Dev mode adds `/dev/listen` (listen QA for examples), `/dev/telemetry` (real step times and review load) and `/dev/qa` (the "report a grading problem" queue).

Useful environment variables, which apply only with `OAK_DEV=1`:

| Variable | Effect |
|---|---|
| `OAK_TUTOR_FAKE=1` | A scripted fake tutor answers instead of Claude |
| `OAK_NOW=<ISO date>` | The dev clock starts at that instant, for testing streaks and schedules |
| `OAK_PORT`, `OAK_VITE_PORT` | Override the default ports (8787, 5173) |

### Checks

| Command | What it runs |
|---|---|
| `bun run check` | Typecheck every project and package, Biome lint, and the unit tests |
| `bun run test` | Unit tests only (`bun test --isolate`): about 21,000 tests, and slow. Pass a path to narrow it, e.g. `bun test server/src/tutor` |
| `bun run test:content` | Content validation alone |
| `bun run e2e` | The Playwright browser suite with fake-microphone WAVs, run in parallel by area |
| `bun run lint` / `bun run format` | Biome |

Content validation is part of the unit tests. For every lesson it checks that:

- every code sample evaluates headlessly and isn't silent;
- every reference solution passes and every known-wrong answer fails with its expected feedback;
- IDs resolve, and every tool is unlocked before it's used;
- every sound exists and every effect control is audible;
- every notated example renders;
- every lesson fits its time budget.

A required rule checks what is *heard*, not which function was called. Each graded step carries a wrong answer that uses the right function, plus several different right answers.

### Authoring content

```bash
bun run content:new
```

```bash
bun run content:check <lesson-id>
```

```bash
bun run theory
```

`content:new` scaffolds a lesson, `content:check` validates one, and `theory` is a CLI over `@oak/theory` for checking music-theory claims. Each lesson folder holds `lesson.ts` (the typed truth: code, exercises, grading, unlocks) and `lesson.mdx` (prose only). Read [`content/AUTHORING.md`](content/AUTHORING.md) and [`content/STYLE.md`](content/STYLE.md) before writing. `STYLE.md` is the Strudel dialect spec that the lint enforces.

## Architecture

```
app/        Vite + React SPA: workbench, lessons, drills, tutor panel, studio, transcription, album
server/     Hono on Bun.serve: SQLite, services (SRS, mastery, unlocks, session plan, streak, album, backup),
            the headless grader host, and the tutor
packages/   api · theory · grader · notation · pitch · drills · srs · content-kit   (isomorphic: no DOM, no Bun APIs)
            strudel · audio                                                         (browser only)
content/    core/ and advanced/ lessons, capstones, repertoire, the toolbox and skill graph, and validation
sounds/     pack.lock.json (committed); pack/ is the local mirror (ignored)
scripts/    content build, sound pack, e2e runner, backup
docs/       the plan, binding contracts, design docs, decision log
```

| Area | Choice |
|---|---|
| Runtime | Bun for the server, tests and grader; Node for frontend tooling |
| Frontend | Vite 8, React 19 with the React Compiler, TanStack Router and Query, Zustand, XState 5, Tailwind 4, MDX 3 |
| Music | Strudel 1.2/1.3 behind the `@oak/strudel` adapter; tonal for theory; abcjs for the staff; pitchy in an AudioWorklet for the mic; signalsmith-stretch and wavesurfer for transcription |
| Grading | `@oak/grader` evaluates Strudel headlessly in a worker and matches the result musically: rhythm F-measure, transposition-invariant melody alignment, chords by bass, root and quality, Roman numerals by degree (never by string), cadences, voice leading, swing ratio |
| Scheduling | ts-fsrs (FSRS) behind `@oak/srs`, with the review-load governor |
| Data | SQLite via `bun:sqlite`, with migrations and zod contracts shared through `@oak/api` |
| Tutor | `claude` CLI with a local MCP endpoint, or the Anthropic SDK; streaming over SSE |
| Quality | TypeScript 7, Biome with enforced import boundaries, `bun test`, Vitest browser mode, Playwright |

**Security.** The server binds to `127.0.0.1` only and checks `Host`, `Origin` and an `X-Oak` header on every API call. A strict CSP is set. Code you didn't type yourself (from the tutor, say) runs under a stricter lint profile, and grader workers disable the `Function` constructor after setup. Destructive endpoints require a confirmation nonce.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | The approved plan: the daily experience, the full curriculum, architecture, and the implementation waves |
| [`docs/design/contracts.md`](docs/design/contracts.md) | The binding contracts. Where any other doc disagrees, this one wins |
| [`docs/decisions.md`](docs/decisions.md) | The running log of decisions, defaults and gate results |
| [`docs/design/`](docs/design/) | Curriculum, exercises, UX and architecture designs, critiques, and per-wave seam docs |
| [`docs/design/retry.md`](docs/design/retry.md) | How every judged exercise can be retried |
| [`docs/spikes.md`](docs/spikes.md) | Toolchain facts verified during de-risking |
| [`server/src/tutor/README.md`](server/src/tutor/README.md) | The tutor service and its two backends |

## Limitations

- **Chromium only.** Audio worklets, the microphone path and the tests target Chrome, Arc and Edge.
- **Single learner, single machine.** No accounts and no sync, by design. Back up `~/.oak` if your progress matters to you.
- **The sound pack is mirrored from Strudel's public sample hosts** on first setup, so that step needs the network. After that, Oak runs offline (apart from the tutor).
- Repertoire is limited to public-domain material: traditional melodies and songs published in 1930 or earlier.

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html), the same license as Strudel.

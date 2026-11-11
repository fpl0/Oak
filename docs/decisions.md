# Decisions log

Defaults taken while you were away. Each one can be reversed; say which and I'll change it.

## Needs you

- **Listening pass on instruments.** The curated aliases (`rhodes`, `upright`, `ebass`, `organ`, guitars, `strings`, `horns`, `tenor`) were chosen by file and name, not by ear. Open `/dev/listen` and tell me which sound cheap.
- **Ten-day trial.** The Wave 2 gate "you use it for 10 days, median session within budget" can only be met by you. Telemetry is recorded locally from the first session.

## Confirmed by you (2026-11-11)

- **Build sub-agents run on Opus.** The Fable usage limit stalled the build from 02:22 to 08:27; Opus draws on a separate limit.
- **Tutor uses your Claude login only.** The API-key backend stays in the code under recorded-response tests and is never called live.
- **"Explain my mistake" counts as a hint.** It moves you one step up the hint ladder (decision 7 stands).
- **Review load:** the three changes in decision 2 stay, to be revisited with real usage data.
- **Hard spending cap removed.** Only the soft warning remains (this replaces decision 8).
- **Tutor comparison visibility stays as built** (decision 9 stands).

## Decisions

| # | Date | Decision | Why | Reversible by |
|---|---|---|---|---|
| 1 | 2026-11-11 | Tutor has two backends behind one interface: `claude-cli` (your Claude login) and `anthropic-api` (API key). Order: explicit setting, API key, logged-in `claude`, else off. | You approved this in a sibling session; its live spike passed (`spikes/s8-claude-cli/`). | Settings → Tutor backend; contracts §10.A |
| 2 | 2026-11-11 | Review scheduling uses spike S7's recommended governor: active ear families are capped at a 7-day interval, fact-card retention is 0.85, and at most 2 fact cards are created per lesson. | The plan's original numbers did not fit the warm-up budget in a 300-day simulation. | `packages/srs` governor config |
| 3 | 2026-11-11 | Chord symbols are checked against a per-dictionary table measured from Strudel 1.2.6, not "one spelling works everywhere". `Caug` under `dict("triads")` is rejected because Strudel plays the wrong chord there. | Spike S1 and the contracts review ran every symbol in every dictionary. | `content/STYLE.md` chord table |
| 4 | 2026-11-11 | Code the learner did not type (tutor suggestions) is evaluated in a separate subprocess, not a worker thread inside the server. | A runaway allocation in a worker grew the server process to about 3 GB before the kill; a subprocess kept it at 5 MB. | `server/src/grader/host.ts` backend option |
| 5 | 2026-11-11 | Wave week-estimates in the plan are void; waves run back to back overnight with their gates kept. Content is authored in parallel waves instead of just in time. | Your instruction, relayed by the sibling session: aim for a complete app. | n/a |
| 6 | 2026-11-11 | Added dependencies the spikes found missing: `@codemirror/language`, `@codemirror/commands`, `babel-plugin-react-compiler`, `@rolldown/plugin-babel`, `@babel/core`. | Needed for editor extensions and the React Compiler. | `package.json` |
| 7 | 2026-11-11 | Tutor service deviations from the contracts (reasons in `server/src/tutor/README.md`): SSE heartbeat every 5 s instead of 15 s; extra `review` and `notice` stream events; the strict lint for tutor-written code is stricter than contracts §11.3; a failed hint does not climb the ladder again on retry; "explain my mistake" advances the hint rung. | Measured behaviour (Bun drops silent streams at about 12 s) and a literal reading of contracts §10. | `server/src/tutor/` |
| 8 | 2026-11-11 | Superseded: the optional hard budget cap was removed entirely by your decision (2026-11-11), so it no longer blocks either backend; only the soft monthly warning remains. | Your decision; contracts §10.9 updated (v1.2). | n/a |
| 9 | 2026-11-11 | `compare_haps` returns a score and the positions of problems at every hint rung, capped at 24 calls per turn. A model that ignored its instructions could use this to narrow down an answer. | That is what the contract specifies; the cap bounds it. | `server/src/tutor/tools/` |
| 10 | 2026-11-11 | Tests run with `bun test --isolate` (each test file gets a fresh global). | Strudel and the grader install globals; in one shared global the order of files changed results (4 failures in a plain `bun test`). | `package.json` `test` script |
| 11 | 2026-11-11 | The drill engine's family catalog is the one the course uses; families whose generator is not built yet keep the categories written from the contract table. Fact decks stay the course's own (their card IDs are locked). | Two catalogs had been written in parallel and disagreed on category names; the playable one has to match the generators. | `content/families.ts`, `packages/drills` |
| 12 | 2026-11-11 | An error-hunt answer that is only a fixed version of the code counts the edit as finding the bug. | The test format cannot send a click and a fix together; without this, a correct fix could never pass. | `packages/grader/src/grade/index.ts` |
| 13 | 2026-11-11 | Band code needs no tempo line (it plays at the session tempo). | The Band files are written without one, as the contracts describe; the lint required one. | `packages/grader/src/lint/oak.ts` |
| 14 | 2026-11-11 | The Workbench switches roll and staff to tabs when the width **or** the available height is under 760 px (1280×800 gives tabs). | ux §2.1's height rule read as "either dimension"; side-by-side panes under 760 px of height were unreadable. | `app/src/workbench/views.ts` `layoutFor` |
| 15 | 2026-11-11 | In a minor key the `in-key` rubric rule accepts the raised 6th and 7th (melodic and harmonic minor). | A minor-key piece with a major V or a leading tone is still "in key" musically. A rule that must enforce strict Aeolian uses the `mode` rule. | `scaleMembership(…, { strict: true })` in `packages/grader/src/analyze/melody.ts` |
| 16 | 2026-11-11 | A backup import moves the replaced learner's audio that the new tables no longer reference to `<data>/backups/pre-import-…-audio/`. It does not delete it. | Contracts §11.10 is silent. Deleting it (as the data reset does) would leave the pre-import safety copy without its audio. | `server/src/services/backup.ts` `#setAsideOrphans` |
| 17 | 2026-11-11 | Every imported sketch and album version is flagged `reviewBeforeRun`. Wave 2's Studio runs it only after the strict lint passes; otherwise it opens as text with "Review before running". | Contracts §11.3: code arriving in an imported backup is code the learner did not type. Before this, no marker told the app which sketches came from an import. | `flags.reviewBeforeRun` in `@oak/api` and `markForReview` in `backup.ts` |
| 18 | 2026-11-11 | The shortcut sheet lists only keys that work today. Loop region (`L`, `[`/`]`), metronome (`M`), check, ask-Claude, named-version, Drills and Lesson keys return with their Wave 2 features. | The sheet listed keys that did nothing. | `STATIC_SECTIONS` in `app/src/ui/shell/GlobalKeys.tsx` |
| 19 | 2026-11-11 | The learner-code grader host stays the in-process Bun worker (fast). Only code the learner did not type runs in the memory-capped subprocess (decision 4). | Learner code can still grow the server's heap for up to 1.5 s. Moving learner code to the subprocess as well would isolate it at the cost of a process hop per grade (not measured). That trade-off is yours to decide. | `server/src/grader/host.ts` backend option |

## Gate results

| Wave | Gate | Result |
|---|---|---|
| W0 | Every spike green, or a documented fallback | **Met.** S2, S3, S4, S5 green. S1, S6, S7 yellow with fallbacks adopted (see `docs/spikes.md`). The paid live check of the `anthropic-api` backend was not run (no key). |
| W1 | `bun run check` green; sample lesson with every MDX component and exercise kind passes validation; 30 golden notation snapshots; adapter leak test green | **Met.** `check` green (3 231 bun tests); `test:content` green with the sample graded by the real grader; 63 notation snapshots; the adapter leak test (20 mount/unmount cycles) and the platform e2e against the real server pass in `bun run e2e` (152 browser tests). Open: the SRS simulation misses two §7.4 sub-criteria (deferred queue, oldest due card), recorded as expected failures. |
| W1 (final gate, after the three reviews) | Item by item | **`bun run check`: met.** Typecheck (every project and package), `biome ci` and `bun test --isolate` all pass: 3 361 tests, 0 failures, 155 files. **Sample lesson: met.** The gate sample uses every exercise kind and every MDX component, and passes all 12 content-CI checks, graded by the real grader. It is the only lesson so far. **Golden notation snapshots: met, 63** (`packages/notation/src/__snapshots__/corpus.test.ts.snap`; at least 30 required). **Adapter leak test: met.** In `packages/strudel/e2e/editors.pw.ts`, 20 mount/unmount cycles leave no listener, view or interval behind. **Platform e2e: met.** `bunx playwright test` passed 165 of 165 browser tests: platform 53 (real server on 8787, Vite dev on 5173, production build on 8790, including the offline reload), app 80, workbench 11, Strudel 17, audio 4. Two earlier full runs each had one failure. The first was a `/dev/workbench` playhead check, caused by my own edits reloading Vite during the run. The second was the command-palette smoke test, where the second `Cmd+K` did not open the palette. That test passed 8 of 8 when repeated alone and in the clean run, so it is recorded as possibly flaky. **Still open, not gate items:** the two §7.4 SRS simulation sub-criteria (`test.failing`); 17 drill generators `pending:*`; the gaps listed under "Wave 1 state" in `docs/design/interfaces.md`. |

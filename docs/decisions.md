# Decisions log

Defaults taken while you were away. Each one can be reversed; say which and I'll change it.

## Needs you

- **Listening pass on instruments.** The curated aliases (`rhodes`, `upright`, `ebass`, `organ`, guitars, `strings`, `horns`, `tenor`) were chosen by file and name, not by ear. Open `/dev/listen` and tell me which sound cheap.
- **Ten-day trial.** The Wave 2 gate "you use it for 10 days, median session within budget" can only be met by you. Telemetry is recorded locally from the first session.
- **Anthropic API key (optional).** None is configured. The `anthropic-api` tutor backend is covered by recorded-response tests only; its live check (a few cents) is not run. The tutor works through your Claude login via the `claude` CLI backend.
- **Review scheduling numbers** (below) are provisional until real telemetry exists.

## Decisions

| # | Date | Decision | Why | Reversible by |
|---|---|---|---|---|
| 1 | 2026-11-11 | Tutor has two backends behind one interface: `claude-cli` (your Claude login) and `anthropic-api` (API key). Order: explicit setting, API key, logged-in `claude`, else off. | You approved this in a sibling session; its live spike passed (`spikes/s8-claude-cli/`). | Settings → Tutor backend; contracts §10.A |
| 2 | 2026-11-11 | Review scheduling uses spike S7's recommended governor: active ear families are capped at a 7-day interval, fact-card retention is 0.85, and at most 2 fact cards are created per lesson. | The plan's original numbers did not fit the warm-up budget in a 300-day simulation. | `packages/srs` governor config |
| 3 | 2026-11-11 | Chord symbols are checked against a per-dictionary table measured from Strudel 1.2.6, not "one spelling works everywhere". `Caug` under `dict("triads")` is rejected because Strudel plays the wrong chord there. | Spike S1 and the contracts review ran every symbol in every dictionary. | `content/STYLE.md` chord table |
| 4 | 2026-11-11 | Code the learner did not type (tutor suggestions) is evaluated in a separate subprocess, not a worker thread inside the server. | A runaway allocation in a worker grew the server process to about 3 GB before the kill; a subprocess kept it at 5 MB. | `server/src/grader/host.ts` backend option |
| 5 | 2026-11-11 | Wave week-estimates in the plan are void; waves run back to back overnight with their gates kept. Content is authored in parallel waves instead of just in time. | Your instruction, relayed by the sibling session: aim for a complete app. | n/a |
| 6 | 2026-11-11 | Added dependencies the spikes found missing: `@codemirror/language`, `@codemirror/commands`, `babel-plugin-react-compiler`, `@rolldown/plugin-babel`, `@babel/core`. | Needed for editor extensions and the React Compiler. | `package.json` |

## Gate results

| Wave | Gate | Result |
|---|---|---|
| W0 | Every spike green, or a documented fallback | **Met.** S2, S3, S4, S5 green. S1, S6, S7 yellow with fallbacks adopted (see `docs/spikes.md`). The paid live check of the `anthropic-api` backend was not run (no key). |

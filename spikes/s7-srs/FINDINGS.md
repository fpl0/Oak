# S7 — ts-fsrs 6.0.0 on Bun + review-load governor simulation

Status: **yellow**. ts-fsrs 6.0.0 (FSRS-7) works on Bun 1.4.4 and is wrapped behind a small Oak interface. The governor holds the plan's CI gate (p95 warm-up ≤ 4 / 5 / 6 min) on every seed, but only after three parameter changes; with the plan's parameters as written the gate passes while most ear families never start.

Everything below was executed on this machine (Bun 1.4.4, macOS arm64). No dependency was missing; nothing was installed.

```
$ bun test spikes/s7-srs/
 23 pass
 0 fail
 602 expect() calls
Ran 23 tests across 2 files. [14.80s]
$ node_modules/.bin/tsc -p spikes/s7-srs/tsconfig.json --noEmit   # exit 0 (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
```

## Files

| file | what it is |
|---|---|
| `srs.ts` | Oak interface over ts-fsrs: `createSrs()`, `createCard`, `review`, `recallProbability`, `isDue`, `intervalAt`, `preview`, `gradeFor`. Cards and revlogs are plain JSON. |
| `governor.ts` | Pure policy (`DEFAULT_GOVERNOR` = the plan as written, `RECOMMENDED_GOVERNOR` = plus the 7-day cadence): `planWarmup`, `admitFamilies`, `admitNewFacts`, `smoothBacklog`, `shouldGraduate`, `makeDayPicker`, `forecastLoad`. No ts-fsrs, clock or RNG inside. |
| `sim.ts` | 300-day single-learner simulation: the real family catalog (47 perceptual/production + 12 concept families, 3 fact decks), a 237-session timeline, a seeded learner model. |
| `simulate.test.ts` | Governor unit tests, the CI gate, and the tables quoted below. |
| `srs.test.ts` | Proofs of the raw ts-fsrs API on Bun and of the wrapper contract. |
| `probe-*.ts` | Throwaway scripts whose output is quoted in §1 (`bun spikes/s7-srs/probe-api.ts` etc.). |

---

## 1. ts-fsrs 6.0.0 on Bun 1.4.4 — what is really exported

### 1.1 Proven API

```
$ bun spikes/s7-srs/probe-exports.ts
FSRSVersion: v6.0.0
DefaultScheduler() returns Promise: true
model name: fsrs-7 | model keys: [ "config", "bounds", "algorithm", "step", "nextInterval", "forgettingCurve", "forward" ]
config: {"weights":[…34 numbers…],"fractionalDays":true,"desiredRetention":{"1":0.9,"2":0.9,"3":0.9,"4":0.9},"enableFuzz":false,
         "maximumInterval":36500,"clearStatsOnForget":true,"enableShortTerm":true,"learningSteps":["1m","10m"],
         "relearningSteps":["10m"],"graduatingInterval":1,"allowModelOverride":true}
Rating: { Manual: 0, Again: 1, Hard: 2, Good: 3, Easy: 4 }   State: { New: 0, Learning: 1, Review: 2, Relearning: 3 }
newCard: { stability: 0, stabilityFast: 0, difficulty: 0, state: 0, scheduleStatus: "new", dueAt: 2026-01-01T00:00:00.000Z,
           lastReviewAt: null, cardId: "caead433-…", reps: 0, lapses: 0, scheduledDays: 0, learningStep: 0 }
$ bun spikes/s7-srs/probe-env.ts
Bun 1.4.4 | typeof Temporal: object | crypto.randomUUID: function
first DefaultScheduler() resolved in 2.4 ms      second (preset cached) in 0.07 ms
```

| thing | real 6.0.0 behaviour |
|---|---|
| Scheduler creation | `await DefaultScheduler(options)` — **async** (it lazy-imports the model preset, then caches it). Everything after that is synchronous. Also exported: `defineScheduler`, `defineMiddleware`, `defineModel`, `defineChrono`, `dateChrono`, `numericChrono`, `temporalInstantChrono`; sub-paths `ts-fsrs/models/fsrs-7` (`FSRS7Model`, `FSRS7_DEFAULT_WEIGHTS`, `curve`, …), `ts-fsrs/middlewares`, `ts-fsrs/reschedule`. |
| Options | `version`, `weights`, `desiredRetention`, `enableShortTerm`, `learningSteps`, `relearningSteps`, `graduatingInterval`, `allowModelOverride`, `enableFuzz`, `maximumInterval`, `clearStatsOnForget`. |
| Version naming | Option: `'FSRS-3' \| 'FSRS-4' \| 'FSRS-4.5' \| 'FSRS-5' \| 'FSRS-6' \| 'FSRS-7'` (default FSRS-7). Stored name: `scheduler.definition.model.name` = `'fsrs-7'` (lower case; 4.5 is `'fsrs-4dot5'`). `'fsrs-7'` as an option throws `FSRSValidationError: Unsupported FSRS version`. `FSRSVersion` is the package version (`'v6.0.0'`), not the model. |
| `newCard({ now, cardId? })` | `cardId` defaults to `crypto.randomUUID()`. It seeds the fuzz, so pass a stable id. |
| `review({ card, grade, now })` | Returns `{ card, revlog }`, does not mutate the input. `revlog` is the **pre-review** snapshot plus `rating` and `reviewTime` (it is what `rollback({ card, revlog })` needs). |
| `preview({ card, now })` | Iterable of `{ grade, card, revlog }` for Again, Hard, Good, Easy. |
| Retrievability | `scheduler.model.forgettingCurve(card, elapsedDays)`; elapsed days from `scheduler.chrono.difference(from, to)` (fractional). `scheduler.model.nextInterval(card, retention)` gives the days until recall falls to `retention`. |
| `forget({ card, now })` | Returns the reset card itself, not `{ card, revlog }`. |
| Serialization | The card is a plain object with two `Date` fields. `JSON.parse` output throws `SRSSchemaError: Expected valid Date fields` until `dueAt` / `lastReviewAt` are revived; after revival the next review is byte-identical. Unknown extra keys are accepted and **dropped** from the result. An FSRS-6-shaped card (no `stabilityFast`) throws. The live card also carries a `Symbol(parsedCardMemoryState)` cache that JSON ignores. |
| Speed | 20 000 reviews in about 0.8 s (≈ 40 µs each). |

Each rating on a new card and on a mature card, with the plan's two scheduler configs (`probe-api.ts`):

```
== FACT (0.90, steps ['5m'], fuzz on, cap 365): first review of a new card
Again state Learning  S 0.110  schedDays 0.0035 due +5 min
Hard  state Learning  S 2.240  schedDays 0.5975 due +14 h 20 min
Good  state Review    S 3.922  schedDays 3      (model 4.78 d, fuzzed)
Easy  state Review    S 11.784 schedDays 50
== after Good ×3 on time (S 28.69): Again → Relearning S 5.05 0.585 d · Hard → 99 d · Good → 261 d · Easy → 347 d
== FAMILY (0.85, enableShortTerm:false, fuzz on, cap 180): first review of a new card
Again state Learning  S 0.110  schedDays 0.0001 due +10 s
Hard  state Review    S 2.240  schedDays 2
Good  state Review    S 3.922  schedDays 13
Easy  state Review    S 11.784 schedDays 132
== forgetting curve after Good ×3 (S 55.27): +1 d 0.994 · +7 d 0.985 · +30 d 0.965 · +60 d 0.946 · +120 d 0.919
```

### 1.2 Differences from the research digest

The digest's call (`await DefaultScheduler({ version:'FSRS-7', desiredRetention:0.9, enableFuzz:true, learningSteps:['1m','10m'], relearningSteps:['10m'] })`) is valid and runs. What it does not say:

1. **FSRS-7 schedules far further out than FSRS-6 at the same nominal retention**, and is very sensitive to it (`probe-intervals.ts`, no fuzz, no cap, reviews on time):

   | | Good ×4 | Hard ×4 |
   |---|---|---|
   | FSRS-6, 0.85 | 4 → 31 → 173 → 773 d | 2 → 9 → 23 → 47 d |
   | FSRS-7, 0.85 | 15 → 98 → 454 → 1898 d | 3.0 → 8.5 → 16 → 26 d |
   | FSRS-6, 0.90 | 3 → 14 → 57 → 196 d | 2 → 4 → 9 → 15 d |
   | FSRS-7, 0.90 | 4.8 → 26 → 92 → 293 d | 0.6 → 2.1 → 3.4 → 4.7 d |
   | FSRS-7, 0.95 | 0.29 → 4.1 → 11 → 25 d | 0.01 → 0.27 → 0.47 → 0.62 d |

   A perceptual family that scores Good twice is not seen again for about 100 days. The level staircase (two sets ≥ 0.90 on different days per level) cannot run on that cadence. See §3.
2. **FSRS-7 `stability` is no longer "days until recall is 90%".** With D = 5: S = 21 gives 90% at 35 d and 85% at 93 d; S = 3.9 gives 90% at 2.6 d. (FSRS-6: S = 21 ⇒ exactly 21 d.) The plan's "stability > 21 days" needs a definition; `srs.intervalAt(card, 0.9)` is the version-independent one.
3. **Fractional days.** `scheduledDays` is a float. Again on a family card with `enableShortTerm:false` is due **10 seconds** later; Hard on a new fact is due 14 hours later. Oak has one session a day, so the wrapper needs its own floor.
4. **`enableFuzz:true` with a small `maximumInterval` misbehaves under FSRS-7.** The fuzz width is computed from the uncapped model interval, so once the model wants more than the cap the "fuzz" becomes a uniform draw:
   ```
   getFuzzRange(454,   elapsed 98,  max 180) = { minInterval: 155, maxInterval: 180 }
   getFuzzRange(13182, elapsed 100, max 180) = { minInterval: 101, maxInterval: 180 }
   getFuzzRange(13182, elapsed 180, max 180) = { minInterval: 2,   maxInterval: 180 }   ← anywhere from 2 to 180 days
   Easy ×10 with cap 180: scheduledDays 143,180,164,167,174,177,180,53,122,137
   ```
   Fuzzed intervals are also floored to whole days while unfuzzed ones stay fractional. Fallback chosen: run the library with `enableFuzz:false, maximumInterval:36500` and let Oak clamp and pick the day.
5. **Learning steps are mostly bypassed under FSRS-7.** `allowModelOverride` defaults to `true` for FSRS-7, so Good on a new card goes straight to Review at 4.8 d; the steps only shape Again and Hard. With `allowModelOverride:false` and steps `['1m','10m']`, Good gives 10 min, then 10 d.
6. **`forgettingCurve` on a never-reviewed card returns 0.0804**, not 0. Guard it.
7. **`Rating` and `State` are plain const objects**, not TS enums: `Rating[3]` is `undefined`.
8. The README says Node ≥ 24 (`engines.node >= 24.0.0`). It runs on Bun 1.4.4 unchanged; `Temporal` exists there but is only needed by `temporalInstantChrono`, which Oak does not use. The one runtime dependency is `@open-spaced-repetition/srs-kit@1.0.0` (already in `node_modules`).
9. Oak may override `dueAt` / `scheduledDays` on the returned card without harm: the next review computes elapsed time from `lastReviewAt`, and the memory state came out identical in the probe (`memory identical after Oak-overridden schedule: true`).

---

## 2. `srs.ts` — the Oak interface

```ts
const srs = await createSrs();                       // async once; sync afterwards
const card = srs.createCard('family', now, 'fam.deg.fet-major');   // plain JSON, ISO date strings
const { card: next, revlog, grade } = srs.review(card, { accuracy: 0.875, fast: false, revealed: false }, now,
  { maxIntervalDays: 7, pickDay });                  // both optional: the governor's cadence cap and load balancer
srs.recallProbability(next, later);                  // 0 for a never-reviewed card
srs.isDue(next, later);
srs.intervalAt(next, 0.9);                           // days until recall falls to 90% ("stability" that survives a model change)
```

Decisions baked in (all exercised by `srs.test.ts`, 9 tests):

- Grade map: revealed or accuracy < 0.65 → Again; < 0.80 → Hard; ≥ 0.95 and fast → Easy; otherwise Good. A fact passes accuracy 0 or 1.
- `OakCard` is the persisted shape: `{ id, kind, model:'fsrs-7', stability, stabilityFast, difficulty, state, scheduleStatus, dueAt, lastReviewAt, reps, lapses, scheduledDays, learningStep }`. `review()` refuses a card whose `model` differs from the scheduler's ("migrate by replaying revlogs").
- `OakRevlog` keeps the pre-review snapshot, the outcome, `elapsedDays`, `recallBefore`, the model's interval and the interval Oak scheduled.
- Oak's interval policy sits on top of the model: floor (families 1 day, facts 0 so the 5-minute step survives), cap (families 180, facts 365, or a per-review `maxIntervalDays`), then a due **day** inside ±5% chosen by `pickDay` or by a hash of card id + reps. Due dates of a day or more snap to a 04:00 UTC rollover so "due today" does not depend on the time of day of the last review. The rollover must become the learner's local rollover in production.

The snippet production should copy is the body of `createSrs` (scheduler options, `toLib` / `fromLib`, `schedule`).

---

## 3. Governor simulation

### 3.1 What is simulated

- **Calendar.** 300 days, sessions Monday to Friday, minus two 4-day gaps (days 61–64 and 229–232) and one 10-day gap (days 145–154): 205 sessions. A variant uses five random days a week.
- **Curriculum.** 237 sessions: 125 core lessons (u00…u17), 26 capstone sessions, 12 checkpoints, 74 track lessons (jz 34, rh 20, ar 20). One entry per session; the first session after a 10+ day gap is a light session with nothing new. 204 entries are reached in 300 days, which unlocks 43 of the 47 perceptual families.
- **Intake.** Families unlock at their catalog lesson (§4.4 of the exercises doc; trials per set, ★ mastery level and top level are encoded per family). Each lesson adds 3 fact cards for tested terms, plus the three decks (staff names 28 cards, key signatures 60, chord symbols 15, with their `newPerDay`). That is 598 fact cards in 300 days, about 2.9 new cards per session.
- **Durations.** Identify sets 60–75 s (fixed per family), dictation sets 90 s, sing/tap sets 60 s, concept sets 45 s, composite "mixed ear" sets 75 s, fact cards 8 s; each actual duration is the estimate ±12%.
- **Learner.** Per-trial success at a level after k sets there is `0.955 − 0.16·e^(−k/2.5)`, plus day noise (sd 0.03), minus a forgetting penalty when the card's predicted recall is under target, minus a lay-off penalty on the first session back (0.03 after ≥ 3 days, 0.08 after ≥ 10). A set's mean credit adds binomial-sized noise for max(trials, 8) trials. Promotion and demotion follow exercises §4.2 (two sets ≥ 0.90 on different days; one set < 0.60). Realised set accuracy is 0.85 (0.83–0.87 across seeds). Facts are answered correctly with probability `recall − 0.02` (0.85 for the first review), a miss is retried once in the same warm-up.
- **In-lesson evidence.** Each lesson re-exercises every family unlocked in the previous 6 lessons with probability 0.5. It feeds the staircase for free and reviews the card only if recall < 0.90 (the plan's "review-if-due").
- **Randomness.** Every draw is `mulberry32(FNV-1a(seed | event key))`. No `Math.random`, no wall clock. The same seed gives byte-identical results (tested).

Not modelled: the ≤ 2 mic sets per session rule, the 15–20 s listen block after every two sets and the 4-trial anchor set from exercises §4.6 (the opener here is the highest-recall due item, as in architecture §2.8), gym sessions, drills-only days, level gates tied to later lessons, and demotion out of a composite card.

### 3.2 The governor as implemented

| plan item | implementation |
|---|---|
| ≤ 12 active perceptual families | `admitFamilies`: a newly unlocked family is seeded in the lesson and queued; it is activated FIFO while fewer than 12 are active **and** the 7-day forecast of set work stays under 85% of the set share of the budget. |
| Graduation into 3 composite cards | `shouldGraduate`: family level ≥ ★ level and `intervalAt(card, 0.9) > 21` days. The family leaves the active set and joins `mixed.pitch` / `mixed.harmony` / `mixed.rhythm`, each an ordinary family card reviewed as one 75 s set. |
| Intake throttle against a 7-day forecast | `forecastLoad` + `admitFamilies` + `admitNewFacts`. New fact cards enter only while today's budget has room, at most 8 per session, and the 7-day forecast of fact reviews stays under 85% of the fact share. |
| Backlog smoothing after gaps | `smoothBacklog`: on the first session after ≥ 3 days off, overdue items are dealt out over the next 6 days (more if a day's slice would exceed 60% of the budget), items with predicted recall 0.75–0.90 first. Intake is paused until the slices are served. Memory state is untouched. |
| Warm-up budget 4 / 5 / 6 min | `planWarmup`: strict budget, easy-win opener, then by `2·(1 − recall) + 0.05·days late`. What does not fit stays due and is never surfaced as a count. |

Additions the plan does not mention, each of which the simulation needed:

- **`planFraction` 0.94.** The planner fills 94% of the budget. Without it, ±12% duration noise put p95 at 4.1 min against a 4.0 budget.
- **`factShare` 0.4.** Facts and sets each have a share of the budget and may borrow what the other leaves. It is a guard so neither class can crowd the other out on a full day; its separate effect on the 300-day numbers was not isolated.
- **Aging in the priority.** A guard against a high-recall due item waiting indefinitely behind a full budget. The unit test shows the mechanism; its effect on the 300-day numbers was not isolated.
- **Load-balanced due days** (`makeDayPicker`): a rescheduled card takes the least-loaded day in its ±5% window, counting a card due on a usual day off against the next practice day. It lowers steady overflow (Table 4, "no load balancing").
- **`activeMaxIntervalDays` (practice cadence).** See §4.

### 3.3 Result: without and with the governor (plan intake)

5 seeds; each cell is median (min–max). "Due-load" is everything due at session start; "hidden overflow" is what is still due after the warm-up, measured outside the 8 sessions that follow a gap.

| scenario | warm-up min p50 | warm-up min p95 | warm-up min max | due-load min p95 | hidden overflow s p95 (steady) | days late p95 | new-fact queue at day 300 | family wait days p95 | families queued at day 300 | at mastery / unlocked | graduated |
|---|---|---|---|---|---|---|---|---|---|---|---|
| no governor · pure FSRS-7 intervals | 3.4 (3.2–3.5) | 9.73 (8.71–10.21) | 16.9 (16.7–20.2) | 8.0 (7.0–8.7) | 0 (0–0) | 2 (2–2) | 3 (3–3) | 0 (0–0) | 0 (0–0) | 18 / 43 | 0 (0–0) |
| no governor · families reviewed at least every 7 d until mastery | 4.1 (3.7–4.4) | 13.71 (13.32–14.32) | 23.4 (20.3–27.8) | 12.4 (12.0–12.8) | 0 (0–0) | 2 (2–2) | 3 (3–3) | 0 (0–0) | 0 (0–0) | 41 / 43 | 0 (0–0) |
| plan governor as written · budget 4 min | 2.9 (2.8–3.0) | 3.75 (3.73–3.78) | 3.9 (3.8–3.9) | 5.2 (4.9–5.9) | 0 (0–90) | 3 (2–3) | 163 (134–191) | 226 (212–239) | 26 (24–29) | 12 / 43 | 5 (2–7) |
| plan governor as written · budget 5 min | 3.2 (3.1–3.4) | 4.66 (4.63–4.68) | 4.9 (4.8–4.9) | 5.6 (4.9–5.8) | 0 (0–8) | 2 (2–2) | 90 (35–109) | 226 (212–239) | 26 (24–29) | 12 / 43 | 5 (2–7) |
| plan governor as written · budget 6 min | 3.4 (3.3–3.6) | 5.33 (5.20–5.55) | 5.7 (5.5–5.9) | 5.6 (5.3–6.2) | 0 (0–0) | 2 (2–2) | 9 (3–19) | 226 (212–239) | 26 (24–29) | 12 / 43 | 5 (2–7) |
| plan governor + 7-day cadence · budget 4 min | 3.7 (3.6–3.7) | 3.88 (3.84–3.92) | 4.0 (3.9–4.0) | 8.7 (7.6–9.6) | 207 (203–271) | 3 (3–4) | 273 (237–292) | 77 (53–106) | 1 (1–4) | 40 / 43 | 36 (32–40) |
| plan governor + 7-day cadence · budget 5 min | 4.6 (4.6–4.6) | 4.84 (4.82–4.85) | 5.0 (4.9–5.0) | 9.4 (9.1–11.9) | 180 (167–241) | 3 (3–3) | 162 (133–170) | 32 (26–52) | 1 (1–1) | 41 / 43 | 40 (37–42) |
| plan governor + 7-day cadence · budget 6 min | 5.5 (5.3–5.5) | 5.75 (5.74–5.77) | 5.9 (5.9–6.0) | 10.1 (9.5–11.8) | 165 (108–247) | 3 (3–3) | 56 (3–101) | 11 (8–22) | 1 (1–1) | 41 / 43 | 40 (38–42) |

realised set accuracy: no governor 0.843 (0.793–0.844) · governor+cadence 5 min 0.842 (0.827–0.860)
reviews in 300 days (median): no governor 206 sets + 4531 fact reviews over 598 fact cards

Reading it:

- **Without a governor** the warm-up is 3.4 min at p50 and **9.7 min at p95** (worst day 17–20 min, after the 10-day gap). It breaks every budget. Facts are most of it: 4531 fact reviews (about 175 s per session) against 206 sets (about 70 s per session) in 300 days. Only 18 of 43 unlocked families reach their mastery level, because pure FSRS-7 intervals show a family three or four times in 300 days.
- Giving families a 7-day practice cadence without a governor fixes mastery (41 / 43) and makes the load worse: p95 13.7 min.
- **The plan's governor as written passes the gate (p95 3.75 / 4.66 / 5.33 min) and fails the learner.** 26 of 43 unlocked families are still waiting in the intake queue on day 300 and the p95 wait is 226 days. The 12 active slots are full by day 45–50 (lessons u03.07–u03.10) and hardly empty again, because almost nothing graduates on FSRS-7 intervals (5 graduations in 300 days).
- With a 7-day cadence the families flow (40–41 of 43 at mastery) and p95 stays under budget, but the plan's fact intake does not fit: 273 / 162 / 56 new fact cards are still waiting on day 300 at 4 / 5 / 6 min.

### 3.4 Backlog over time

"Hidden overflow" is the seconds of due work left after the warm-up. Seed a1.

| days | no governor: warm-up | no governor: overflow | plan governor as written, 5 min: warm-up | plan governor as written, 5 min: overflow | recommended, 4 min: warm-up | recommended, 4 min: overflow | recommended, 5 min: warm-up | recommended, 5 min: overflow | recommended, 6 min: warm-up | recommended, 6 min: overflow |
|---|---|---|---|---|---|---|---|---|---|---|
| 1–30 | 1.6 / 4.4 | 0 / 0 | 1.6 / 3.9 | 0 / 0 | 0.8 / 2.7 | 0 / 0 | 1.7 / 4.2 | 0 / 0 | 1.7 / 4.2 | 0 / 0 |
| 31–60 | 2.9 / 6.7 | 0 / 0 | 2.8 / 4.6 | 0 / 0 | 2.4 / 3.9 | 3 / 60 | 3.7 / 4.8 | 3 / 68 | 3.8 / 5.4 | 0 / 0 |
| 61–90 | 3.4 / 8.1 | 0 / 0 | 3.1 / 4.6 | 43 / 352 | 2.4 / 3.8 | 46 / 338 | 4.3 / 4.9 | 159 / 742 | 4.7 / 5.8 | 114 / 684 |
| 91–120 | 3.8 / 11.7 | 0 / 0 | 3.7 / 4.8 | 1 / 24 | 2.8 / 3.7 | 12 / 120 | 4.4 / 4.9 | 6 / 68 | 4.2 / 5.7 | 0 / 0 |
| 121–150 | 3.1 / 8.9 | 0 / 0 | 3.1 / 4.6 | 0 / 0 | 2.8 / 3.9 | 3 / 64 | 3.5 / 4.7 | 9 / 90 | 3.2 / 5.2 | 0 / 0 |
| 151–180 | 5.3 / 16.9 | 0 / 0 | 3.7 / 4.9 | 77 / 518 | 2.4 / 3.5 | 61 / 398 | 4.1 / 4.8 | 149 / 673 | 4.3 / 5.7 | 122 / 683 |
| 181–210 | 4.9 / 11.5 | 0 / 0 | 3.4 / 4.7 | 0 / 0 | 2.6 / 3.8 | 18 / 180 | 4.5 / 4.9 | 51 / 137 | 4.3 / 6.0 | 1 / 24 |
| 211–240 | 5.5 / 12.5 | 0 / 0 | 3.5 / 4.9 | 50 / 399 | 1.8 / 3.6 | 10 / 80 | 4.1 / 4.7 | 81 / 496 | 4.0 / 5.6 | 44 / 347 |
| 241–270 | 5.4 / 11.1 | 0 / 0 | 3.4 / 4.6 | 0 / 0 | 2.0 / 3.6 | 0 / 0 | 4.6 / 4.8 | 105 / 280 | 4.5 / 5.8 | 17 / 188 |
| 271–300 | 4.8 / 8.6 | 0 / 0 | 3.2 / 4.6 | 0 / 0 | 2.4 / 3.8 | 1 / 16 | 4.2 / 4.8 | 12 / 171 | 4.1 / 5.9 | 1 / 24 |

After each gap, recommended configuration at 5 min:

| day | days off before | session | warm-up min | due load min | hidden overflow s | active | queued |
|---|---|---|---|---|---|---|---|
| 65 | 4 | u04.06 | 2.5 | 15.0 | 742 | 12 | 2 |
| 66 | 0 | cap.u04.1 | 4.8 | 14.0 | 564 | 12 | 2 |
| 67 | 0 | u05.01 | 3.5 | 10.1 | 406 | 11 | 3 |
| 70 | 2 | u05.02 | 4.5 | 8.5 | 254 | 11 | 3 |
| 71 | 0 | u05.03 | 4.5 | 6.2 | 134 | 11 | 3 |
| 72 | 0 | u05.04 | 4.5 | 4.7 | 74 | 11 | 3 |
| 73 | 0 | u05.05 | 4.5 | 5.2 | 75 | 11 | 4 |
| 74 | 0 | u05.06 | 4.7 | 4.8 | 45 | 11 | 4 |
| 155 | 10 | light | 2.3 | 13.5 | 673 | 7 | 0 |
| 156 | 0 | u10.07 | 3.2 | 11.8 | 531 | 7 | 0 |
| 157 | 0 | u10.08 | 3.1 | 9.7 | 398 | 7 | 0 |
| 158 | 0 | u10.09 | 4.6 | 7.6 | 220 | 6 | 0 |
| 161 | 2 | cap.u10.1 | 4.8 | 6.7 | 144 | 6 | 0 |
| 162 | 0 | cap.u10.2 | 4.5 | 4.9 | 63 | 5 | 0 |
| 163 | 0 | cp.u10 | 4.6 | 5.5 | 63 | 5 | 0 |
| 164 | 0 | u11.01 | 4.2 | 2.5 | 0 | 5 | 0 |
| 233 | 4 | cp.u16 | 2.0 | 10.2 | 496 | 7 | 0 |
| 234 | 0 | u17.01 | 4.6 | 10.3 | 371 | 7 | 0 |
| 235 | 0 | u17.02 | 3.4 | 8.4 | 307 | 7 | 0 |
| 238 | 2 | u17.03 | 4.7 | 6.8 | 132 | 7 | 0 |
| 239 | 0 | u17.04 | 4.7 | 6.2 | 124 | 7 | 1 |
| 240 | 0 | cap.u17.1 | 4.6 | 5.8 | 124 | 7 | 0 |
| 241 | 0 | cp.u17 | 4.6 | 5.8 | 70 | 6 | 0 |
| 242 | 0 | jz.01 | 4.0 | 5.0 | 62 | 6 | 0 |

The 10-day gap returns as a 2.3-minute warm-up on a light session, and the overflow is back under one set in 6 sessions.

---

## 4. Is the plan's CI gate achievable?

**The gate as written ("p95 warm-up ≤ 4 / 5 / 6 min") is achievable trivially and proves nothing.** Any planner with a hard budget passes it. The plan's own governor passes it with 26 families parked. The gate needs companions that measure where the overflow went.

**With the plan's parameters no budget is healthy.** Three changes make all three hold, on all 5 seeds:

1. **Practice cadence for active families: never schedule an active (not yet graduated) family more than 7 days out.** Required at every budget; without it nothing graduates. 12 active families at one set a week is about 2.4 sets per session.
2. **Fact cards at desired retention 0.85 instead of 0.90.** One fact card costs 10.8 reviews in its first 300 days at 0.90 and 8.3 at 0.85 (`probe-fact-cost.ts`). The price: recall at review time for facts drops from about 0.83–0.85 to about 0.80.
3. **At most 2 SRS fact cards per lesson** (a third tested term stays a glossary entry). With the decks that is about 2.1 new cards per session.

And one reading of the plan that the 15-minute setting depends on:

4. **At the 15-minute setting a lesson takes two sessions** (the authored save-and-wrap midpoint). With one lesson per session the 4-minute budget cannot absorb the intake even with changes 1–3: p95 family wait 64 days (51–95) and 58 fact cards queued.

One change at a time, so the minimum per session length is visible:

| scenario | warm-up min p50 | warm-up min p95 | warm-up min max | due-load min p95 | hidden overflow s p95 (steady) | days late p95 | new-fact queue at day 300 | family wait days p95 | families queued at day 300 | at mastery / unlocked | graduated |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 25-min session (budget 6 min) · cadence only (3 cards/lesson, facts 0.90) | 5.5 (5.3–5.5) | 5.75 (5.74–5.77) | 5.9 (5.9–6.0) | 10.1 (9.5–11.8) | 165 (108–247) | 3 (3–3) | 56 (3–101) | 11 (8–22) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 25-min session (budget 6 min) · + facts at 0.85 | 4.6 (4.4–4.9) | 5.73 (5.65–5.77) | 5.9 (5.8–6.0) | 8.8 (8.3–9.1) | 90 (60–145) | 2 (2–3) | 3 (3–3) | 11 (8–18) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 25-min session (budget 6 min) · + 2 cards/lesson (facts 0.90) | 4.6 (4.0–5.0) | 5.72 (5.66–5.74) | 5.8 (5.8–6.0) | 8.9 (7.8–9.7) | 120 (84–193) | 2 (2–3) | 2 (2–2) | 10 (7–21) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 25-min session (budget 6 min) · + both = RECOMMENDED | 3.8 (3.3–4.1) | 5.65 (5.61–5.71) | 5.9 (5.8–6.0) | 7.4 (7.3–8.3) | 90 (60–90) | 2 (2–2) | 2 (2–2) | 7 (5–15) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 20-min session (budget 5 min) · cadence only (3 cards/lesson, facts 0.90) | 4.6 (4.6–4.6) | 4.84 (4.82–4.85) | 5.0 (4.9–5.0) | 9.4 (9.1–11.9) | 180 (167–241) | 3 (3–3) | 162 (133–170) | 32 (26–52) | 1 (1–1) | 41 / 43 | 40 (37–42) |
| 20-min session (budget 5 min) · + facts at 0.85 | 4.6 (4.5–4.6) | 4.80 (4.78–4.82) | 4.9 (4.9–4.9) | 9.7 (8.9–10.0) | 186 (130–212) | 3 (3–3) | 53 (6–56) | 22 (18–39) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 20-min session (budget 5 min) · + 2 cards/lesson (facts 0.90) | 4.6 (4.3–4.6) | 4.81 (4.77–4.87) | 4.9 (4.9–5.0) | 10.3 (8.5–10.8) | 200 (130–289) | 3 (3–3) | 10 (2–19) | 31 (19–49) | 1 (1–1) | 40 / 43 | 39 (37–42) |
| 20-min session (budget 5 min) · + both = RECOMMENDED | 4.0 (3.9–4.5) | 4.78 (4.76–4.82) | 4.9 (4.9–5.0) | 8.4 (7.8–8.6) | 133 (75–136) | 3 (2–3) | 2 (2–2) | 21 (19–36) | 1 (1–1) | 41 / 43 | 40 (37–42) |
| 15-min session, one lesson per session · cadence + facts 0.85 + 2 cards/lesson | 3.6 (3.6–3.7) | 3.86 (3.86–3.89) | 4.0 (3.9–4.0) | 8.7 (8.4–9.3) | 219 (165–248) | 4 (3–4) | 58 (2–93) | 64 (51–95) | 1 (1–3) | 40 / 43 | 38 (32–40) |
| 15-min session (budget 4 min, lesson = 2 sessions) · cadence only (3 cards/lesson, facts 0.90) | 3.5 (3.4–3.6) | 3.83 (3.81–3.89) | 4.0 (3.9–4.1) | 7.2 (6.1–8.6) | 160 (120–236) | 3 (3–3) | 16 (0–59) | 16 (6–62) | 0 (0–0) | 28 / 31 | 28 (24–28) |
| 15-min session (budget 4 min, lesson = 2 sessions) · + facts at 0.85 | 3.1 (2.8–3.4) | 3.80 (3.75–3.86) | 3.9 (3.9–4.0) | 5.8 (5.3–6.5) | 90 (64–150) | 3 (2–3) | 0 (0–3) | 15 (5–50) | 0 (0–0) | 28 / 31 | 28 (27–29) |
| 15-min session (budget 4 min, lesson = 2 sessions) · + 2 cards/lesson (facts 0.90) | 3.0 (2.6–3.5) | 3.80 (3.76–3.84) | 3.9 (3.9–4.0) | 6.6 (5.4–7.6) | 135 (90–208) | 3 (2–3) | 0 (0–0) | 34 (6–57) | 0 (0–0) | 28 / 31 | 28 (27–29) |
| 15-min session (budget 4 min, lesson = 2 sessions) · + both = RECOMMENDED | 2.6 (2.3–3.1) | 3.75 (3.69–3.81) | 3.9 (3.9–4.0) | 5.1 (4.6–6.5) | 65 (16–165) | 3 (2–3) | 0 (0–0) | 15 (4–52) | 0 (0–0) | 28 / 31 | 28 (28–29) |

Minimum per setting: **25 min** needs change 1 plus either 2 or 3. **20 min** needs 1, 2 and 3: with change 2 alone 53 fact cards (6–56) are still waiting on day 300; with change 3 alone 10 (2–19) are waiting and the p95 family wait reaches 49 days on one seed. **15 min** needs 1, 4 and either 2 or 3.

### Proposed CI gate (implemented in `simulate.test.ts`, passes on 5 seeds × 3 budgets)

| session | budget min | warm-up p50 | warm-up p95 | warm-up max | hidden overflow s p95 (steady) | days late p95 | new-fact queue at day 300 | family wait days p95 | % at mastery | sessions to clear after a gap (worst of 3) | set accuracy | recall at review: sets | recall at review: facts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 15 min | 4 | 2.6 (2.3–3.1) | 3.75 (3.69–3.81) | 3.93 (3.89–3.98) | 65 (16–165) | 3 (2–3) | 0 (0–0) | 15 (4–52) | 90 (90–94) | 6 (5–9) | 0.863 (0.843–0.867) | 0.89 (0.85–0.89) | 0.80 (0.80–0.81) |
| 20 min | 5 | 4.0 (3.9–4.5) | 4.78 (4.76–4.82) | 4.95 (4.88–5.04) | 133 (75–136) | 3 (2–3) | 2 (2–2) | 21 (19–36) | 95 (88–98) | 7 (6–12) | 0.851 (0.827–0.861) | 0.87 (0.83–0.89) | 0.80 (0.78–0.80) |
| 25 min | 6 | 3.8 (3.3–4.1) | 5.65 (5.61–5.71) | 5.86 (5.82–5.95) | 90 (60–90) | 2 (2–2) | 2 (2–2) | 7 (5–15) | 95 (93–98) | 5 (5–6) | 0.849 (0.830–0.862) | 0.87 (0.84–0.88) | 0.81 (0.80–0.81) |

Assertions per seed and budget: p95 warm-up ≤ budget; worst warm-up ≤ 1.05 × budget; steady-state hidden overflow p95 ≤ one budget; reviews at most 4 days late at p95; ≤ 15 fact cards waiting on day 300; ≤ 2 families queued on day 300 and p95 wait ≤ 60 days; ≥ 85% of unlocked families at mastery level; overflow back to ≤ one set within 14 sessions of each gap; realised accuracy in 0.82–0.88.

### Robustness

| scenario | warm-up min p50 | warm-up min p95 | warm-up min max | due-load min p95 | hidden overflow s p95 (steady) | days late p95 | new-fact queue at day 300 | family wait days p95 | families queued at day 300 | at mastery / unlocked | graduated |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 15 min · as recommended | 2.3 (2.3–2.6) | 3.71 (3.69–3.75) | 3.9 (3.9–4.0) | 4.7 (4.6–5.1) | 60 (16–65) | 2 (2–3) | 0 (0–0) | 5 (4–15) | 0 (0–0) | 29 / 31 | 28 (28–29) |
| 15 min · five random days a week instead of Mon–Fri | 2.6 (2.6–2.6) | 3.77 (3.76–3.79) | 3.9 (3.9–4.0) | 7.1 (5.5–7.7) | 180 (90–180) | 4 (4–5) | 0 (0–2) | 16 (12–30) | 0 (0–1) | 28 / 30 | 27 (27–29) |
| 15 min · slow learner (tau 4 sets) | 2.9 (2.7–3.0) | 3.78 (3.74–3.83) | 4.0 (3.9–4.1) | 5.7 (4.8–6.1) | 90 (68–90) | 2 (2–3) | 0 (0–0) | 20 (17–22) | 0 (0–0) | 28 / 31 | 27 (27–28) |
| 15 min · fast learner (tau 1.5 sets) | 2.2 (2.1–2.3) | 3.72 (3.68–3.75) | 3.9 (3.9–3.9) | 4.4 (4.4–4.6) | 60 (0–60) | 2 (2–2) | 0 (0–0) | 5 (5–5) | 0 (0–0) | 29 / 31 | 29 (28–29) |
| 15 min · no in-lesson evidence | 3.0 (2.9–3.4) | 3.78 (3.76–3.82) | 4.0 (4.0–4.0) | 6.8 (5.8–6.8) | 121 (90–165) | 3 (2–3) | 0 (0–0) | 48 (35–51) | 0 (0–1) | 28 / 31 | 27 (23–28) |
| 15 min · graduate on raw stability > 21 instead of t90 > 21 d | 2.3 (2.1–2.6) | 3.73 (3.63–3.77) | 3.9 (3.9–4.0) | 4.5 (4.5–5.4) | 64 (63–65) | 2 (2–3) | 0 (0–0) | 8 (5–15) | 0 (0–0) | 29 / 31 | 29 (28–29) |
| 15 min · cadence 5 d | 2.7 (2.6–2.7) | 3.77 (3.77–3.80) | 3.9 (3.9–4.1) | 6.4 (6.3–6.5) | 163 (144–180) | 3 (3–3) | 0 (0–0) | 23 (16–33) | 0 (0–0) | 29 / 31 | 28 (28–29) |
| 15 min · cadence 10 d | 2.4 (2.3–2.5) | 3.73 (3.72–3.74) | 4.0 (3.9–4.0) | 5.6 (5.6–5.6) | 90 (90–90) | 3 (2–3) | 0 (0–0) | 5 (5–5) | 0 (0–0) | 28 / 31 | 28 (27–28) |
| 15 min · active cap 8 | 2.3 (2.3–2.7) | 3.71 (3.69–3.83) | 3.9 (3.9–4.0) | 5.1 (4.7–5.2) | 60 (16–73) | 2 (2–3) | 0 (0–0) | 5 (4–15) | 0 (0–0) | 29 / 31 | 28 (28–29) |
| 15 min · no load balancing | 2.5 (2.4–2.6) | 3.77 (3.74–3.80) | 3.9 (3.9–3.9) | 6.0 (5.9–6.6) | 142 (136–150) | 3 (2–3) | 0 (0–0) | 6 (5–10) | 0 (0–0) | 29 / 31 | 28 (28–29) |
| 15 min · 450 days (whole course) | 2.2 (2.2–2.4) | 3.71 (3.71–3.72) | 3.9 (3.9–4.0) | 4.3 (4.3–4.4) | 16 (8–60) | 2 (2–2) | 0 (0–0) | 4 (3–14) | 0 (0–0) | 39 / 41 | 38 (37–38) |
| 20 min · as recommended | 3.9 (3.9–4.5) | 4.78 (4.76–4.82) | 4.9 (4.9–4.9) | 8.5 (7.8–8.6) | 133 (75–134) | 3 (2–3) | 2 (2–2) | 21 (19–21) | 1 (1–1) | 41 / 43 | 40 (37–42) |
| 20 min · five random days a week instead of Mon–Fri | 4.1 (4.1–4.3) | 4.79 (4.75–4.79) | 4.9 (4.9–5.0) | 8.8 (8.6–9.6) | 189 (184–214) | 4 (4–4) | 2 (2–2) | 22 (16–27) | 0 (0–0) | 41 / 42 | 40 (36–42) |
| 20 min · slow learner (tau 4 sets) | 4.4 (4.4–4.5) | 4.80 (4.77–4.86) | 5.0 (4.9–5.0) | 8.7 (8.7–8.8) | 185 (180–216) | 3 (3–3) | 2 (2–2) | 33 (28–53) | 1 (1–1) | 40 / 43 | 38 (36–39) |
| 20 min · fast learner (tau 1.5 sets) | 3.5 (3.3–3.7) | 4.77 (4.71–4.78) | 4.9 (4.9–5.0) | 7.4 (7.1–7.9) | 68 (66–90) | 2 (2–3) | 2 (2–2) | 13 (7–14) | 1 (1–1) | 42 / 43 | 41 (40–42) |
| 20 min · no in-lesson evidence | 4.5 (4.4–4.5) | 4.80 (4.78–4.85) | 5.0 (5.0–5.0) | 9.2 (8.1–9.5) | 162 (161–205) | 3 (3–3) | 2 (2–2) | 54 (49–55) | 1 (1–1) | 40 / 43 | 39 (33–40) |
| 20 min · graduate on raw stability > 21 instead of t90 > 21 d | 3.8 (3.5–4.1) | 4.75 (4.72–4.77) | 4.9 (4.9–4.9) | 7.3 (6.5–7.4) | 75 (68–123) | 2 (2–2) | 2 (2–2) | 19 (13–21) | 1 (1–1) | 42 / 43 | 41 (38–42) |
| 20 min · cadence 5 d | 4.3 (4.1–4.5) | 4.81 (4.80–4.84) | 4.9 (4.9–5.0) | 9.0 (8.8–9.4) | 248 (221–253) | 3 (3–3) | 2 (2–2) | 35 (35–50) | 1 (1–1) | 42 / 43 | 40 (39–42) |
| 20 min · cadence 10 d | 3.8 (3.6–3.9) | 4.77 (4.77–4.79) | 4.9 (4.9–4.9) | 8.6 (8.3–9.2) | 141 (90–172) | 3 (3–3) | 2 (2–2) | 13 (12–27) | 1 (1–1) | 40 / 43 | 38 (37–39) |
| 20 min · active cap 8 | 4.1 (3.7–4.3) | 4.79 (4.73–4.81) | 4.9 (4.9–5.1) | 8.1 (7.5–8.7) | 134 (90–135) | 3 (2–3) | 2 (2–2) | 34 (32–35) | 1 (1–1) | 41 / 43 | 40 (38–42) |
| 20 min · no load balancing | 4.2 (4.1–4.3) | 4.80 (4.77–4.82) | 5.0 (4.9–5.0) | 9.2 (8.1–9.8) | 163 (154–219) | 3 (2–3) | 2 (2–2) | 23 (20–27) | 1 (1–1) | 42 / 43 | 40 (38–42) |
| 20 min · 450 days (whole course) | 3.3 (3.2–4.0) | 4.76 (4.73–4.80) | 4.9 (4.9–4.9) | 7.4 (6.3–7.5) | 90 (71–127) | 2 (2–2) | 0 (0–0) | 21 (19–21) | 0 (0–0) | 47 / 47 | 47 (47–47) |
| 25 min · as recommended | 3.5 (3.3–4.0) | 5.61 (5.61–5.67) | 5.9 (5.8–6.0) | 7.4 (7.3–8.3) | 64 (60–90) | 2 (2–2) | 2 (2–2) | 6 (5–14) | 1 (1–1) | 42 / 43 | 40 (38–42) |
| 25 min · five random days a week instead of Mon–Fri | 3.8 (3.6–3.9) | 5.65 (5.61–5.70) | 5.8 (5.8–5.9) | 8.8 (8.3–9.1) | 90 (68–177) | 3 (3–4) | 2 (2–2) | 8 (6–17) | 0 (0–0) | 41 / 42 | 40 (37–42) |
| 25 min · slow learner (tau 4 sets) | 4.3 (4.2–4.8) | 5.66 (5.60–5.74) | 5.8 (5.8–5.9) | 8.4 (8.3–9.6) | 72 (62–90) | 2 (2–2) | 2 (2–2) | 18 (15–23) | 1 (1–1) | 40 / 43 | 39 (38–41) |
| 25 min · fast learner (tau 1.5 sets) | 3.3 (3.0–3.6) | 5.58 (5.56–5.59) | 5.8 (5.8–5.8) | 7.5 (7.3–8.0) | 0 (0–0) | 2 (2–2) | 2 (2–2) | 6 (5–9) | 1 (1–1) | 42 / 43 | 41 (40–42) |
| 25 min · no in-lesson evidence | 4.4 (4.2–4.5) | 5.68 (5.64–5.74) | 5.9 (5.9–6.0) | 9.3 (7.7–9.4) | 72 (72–73) | 2 (2–2) | 2 (2–2) | 32 (24–33) | 1 (1–1) | 41 / 43 | 40 (39–42) |
| 25 min · graduate on raw stability > 21 instead of t90 > 21 d | 3.4 (3.4–3.8) | 5.57 (5.56–5.69) | 5.8 (5.7–5.9) | 7.3 (6.7–8.0) | 0 (0–0) | 2 (2–2) | 2 (2–2) | 7 (6–12) | 1 (1–1) | 42 / 43 | 40 (38–42) |
| 25 min · cadence 5 d | 3.7 (3.5–4.2) | 5.68 (5.60–5.71) | 5.8 (5.8–5.9) | 9.5 (9.1–10.0) | 202 (154–208) | 2 (2–2) | 2 (2–2) | 15 (12–27) | 1 (1–1) | 42 / 43 | 40 (39–42) |
| 25 min · cadence 10 d | 3.7 (3.2–3.7) | 5.61 (5.59–5.66) | 5.9 (5.7–5.9) | 8.3 (8.0–8.4) | 72 (65–75) | 2 (2–2) | 2 (2–2) | 12 (11–26) | 1 (1–1) | 40 / 43 | 39 (38–39) |
| 25 min · active cap 8 | 3.8 (3.6–4.0) | 5.61 (5.59–5.66) | 5.7 (5.7–5.9) | 7.3 (7.2–8.1) | 0 (0–60) | 2 (2–2) | 2 (2–2) | 35 (26–35) | 1 (1–1) | 42 / 43 | 40 (38–42) |
| 25 min · no load balancing | 3.8 (3.5–3.9) | 5.69 (5.67–5.74) | 5.9 (5.9–5.9) | 9.2 (8.9–10.4) | 162 (150–163) | 2 (2–3) | 2 (2–2) | 7 (6–14) | 1 (1–1) | 42 / 43 | 40 (38–42) |
| 25 min · 450 days (whole course) | 2.8 (2.8–3.4) | 5.58 (5.56–5.58) | 5.9 (5.9–6.0) | 6.6 (6.6–7.2) | 0 (0–66) | 2 (2–2) | 0 (0–0) | 6 (5–14) | 0 (0–0) | 47 / 47 | 47 (47–47) |

The plan gate (p95 ≤ budget) holds in every variant. What moves is the family wait: it is longest without in-lesson evidence (p95 48 / 54 / 32 days) and for a slow learner. An active cap of 8 changes nothing at 15 min and lengthens the wait at 20 and 25 min, so 12 is fine; the forecast throttle binds before the cap at 4 and 5 minutes (at most 9–11 families were ever active).

---

## 5. Gotchas for production

1. **Do not use the library's `enableFuzz` or a small `maximumInterval` with FSRS-7** (§1.2 item 4). Clamp and pick the day in Oak.
2. **Floor family intervals at 1 day.** FSRS-7 schedules a failed family set 10 seconds out.
3. **Define "stability > 21 days" as `intervalAt(card, 0.9) > 21`.** Under a 7-day cadence it is reached after two Good sets, so the mastery level is the binding condition, and raw `stability > 21` gives the same outcome (Table 4).
4. **Pass a stable `cardId`** to `newCard`; revive dates before `review`; re-attach Oak fields after `review` (they are dropped); return 0 for the recall of a new card.
5. **Seed variance is large.** With the cadence and plan intake at 6 min, the new-fact queue on day 300 is anywhere from 3 to 101 cards across five seeds (Table 2, first row); the first seed I tuned on happened to be a favourable one. The gate must run several seeds: 5 seeds × 3 budgets take 0.9 s (`bun test spikes/s7-srs/simulate.test.ts -t "CI GATE"`).
6. **The warm-up estimate needs slack** (`planFraction` 0.94) or real durations push p95 a few seconds over.
7. **Facts, not ear sets, are the bulk of the load.** At plan intake and averaged over 300 days: about 175 s of fact reviews per session ungoverned; under the governor with the cadence at 5 min, about 135 s of facts (throttled) and 105–130 s of sets.
8. **`ls` is aliased to `eza` in this shell and hung once**; unrelated to the spike, but scripts should call `/bin/ls`.

## 6. Fallbacks chosen

| problem | fallback, proven by |
|---|---|
| Library fuzz degenerates under a cap | Library with fuzz off and no cap; Oak clamps, picks the day, snaps to the rollover — `srs.test.ts` "parameters…", "every rating…" |
| Sub-day FSRS-7 intervals | 1-day floor for families; facts keep the 5-minute step — `srs.test.ts` "every rating…" |
| FSRS-7 stability semantics | `intervalAt(card, 0.9)` — `srs.test.ts`, Table 4 |
| Plan governor starves intake | 7-day cadence for active families — Table 1 |
| Plan fact intake exceeds every budget | Facts at 0.85 and ≤ 2 cards per lesson — Table 2, CI gate |

## 7. Open items

- **Decision needed:** accept changes 1–4 of §4, or keep 3 cards per lesson and 0.90 and accept a growing hidden queue of fact cards at 15 and 20 minutes.
- The learner model is invented. The numbers that drive the outcome are sets-to-promote (about 5 per level here) and the in-lesson evidence rate (0.5 per lesson for 6 lessons). `/dev/telemetry` should record both from W2 so the simulation can be re-fitted.
- FSRS-7's default weights were fitted on flashcards. Whether a 100-day interval suits an ear skill is untested; the cadence cap sidesteps it for active families, and the composite cards (cap 180 days here) inherit the question. A composite cap of 14–21 days would cost about 16 s per day.
- A composite set cannot hold "2 trials from each member" once a group has more than about 5 members (the pitch group reaches 16). The sim charges a flat 75 s; the sampler needs a rule (rotate members, weight by lowest recall).
- Not modelled and each costs warm-up time: listen blocks, the anchor set, the 2-mic-set limit, same-session relearning of a failed family set.
- The rollover hour is UTC 04:00 in the spike; production needs the learner's local day.
- `sim.ts` treats concept families as plain cards with no staircase; they add little load at 0.85 but were not studied.
- At the 15-minute setting the simulation covers 114 curriculum sessions in 300 days, so the course takes about twice as long there.

## 8. How to run

```
bun test spikes/s7-srs/                      # 23 tests, 15–30 s, prints every table above (identical on every run)
bun test spikes/s7-srs/srs.test.ts           # API + wrapper only, ~30 ms
bun spikes/s7-srs/probe-exports.ts           # export list, default config, card shape
bun spikes/s7-srs/probe-env.ts               # Temporal, scheduler creation time, forget() shape
bun spikes/s7-srs/probe-api.ts               # raw library behaviour quoted in §1
bun spikes/s7-srs/probe-intervals.ts         # FSRS-6 vs FSRS-7 interval ladders
bun spikes/s7-srs/probe-gotchas.ts           # fuzz range, schedule override, sub-day Again
bun spikes/s7-srs/probe-fact-cost.ts         # reviews per fact card by retention
```

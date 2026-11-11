import { describe, expect, test } from 'bun:test';
import { hintCassette } from './cassette.ts';
import { encodeSse } from './events.ts';
import { FAKE_KINDS, runCassette } from './harness.ts';
import { LEAK_MARKERS, LEARNER_CODE, LESSON } from './lesson-fixture.ts';
import { clampRung, lessonContextView, oakContext, type Rung } from './redaction.ts';

const RUNGS: Rung[] = [0, 1, 2, 3, 4];

/** Replace every string that is itself JSON (tool_result content) by its parsed value, recursively. */
function deepDecode(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return deepDecode(JSON.parse(t));
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(deepDecode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepDecode(x)]));
  return v;
}

/** Text to scan: raw, nested-JSON-decoded, and with string escapes removed (so `n(\"0 2 4 7\")` is found). */
function haystack(...parts: unknown[]): string {
  const raw = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
  const decoded = JSON.stringify(parts.map(deepDecode));
  return [raw, decoded, decoded.replaceAll('\\"', '"'), raw.replaceAll('\\\\\\"', '"').replaceAll('\\"', '"')].join('\n');
}

const found = (hay: string, markers: readonly string[]) => markers.filter((m) => hay.includes(m));

describe('redaction views (unit)', () => {
  test('get_lesson_context view is allow-listed per rung', () => {
    const keys = (r: Rung) => Object.keys(lessonContextView(LESSON, r)).sort();
    const base = ['answer_policy', 'hint_rung', 'issues', 'lesson_id', 'objectives', 'rubric', 'target_id', 'title'];
    for (const r of [0, 1, 2, 3] as const) expect(keys(r)).toEqual(base);
    expect(keys(4)).toEqual([...base, 'solution', 'target_haps'].sort());

    const issueKeys = (r: Rung) => Object.keys(lessonContextView(LESSON, r).issues[0]!).sort();
    expect(issueKeys(0)).toEqual(['bar', 'beat', 'got', 'id', 'kind', 'where']);
    expect(issueKeys(1)).toEqual(['bar', 'beat', 'got', 'id', 'kind', 'what', 'where']);
    expect(issueKeys(2)).toEqual(issueKeys(1));
    expect(issueKeys(3)).toEqual(['bar', 'beat', 'expected', 'fix', 'got', 'id', 'kind', 'what', 'where']);
    expect(issueKeys(4)).toEqual(issueKeys(3));

    expect(lessonContextView(LESSON, 3).answer_policy).toBe('socratic');
    expect(lessonContextView(LESSON, 4).answer_policy).toBe('may_reveal');
  });

  test('rung 3 reveals fix/expected for ONE issue only', () => {
    const two = { ...LESSON, issues: [LESSON.issues[0]!, { ...LESSON.issues[0]!, id: 'i2', fix: 'degree 3 (n 2)' }] };
    const v3 = lessonContextView(two, 3);
    expect('fix' in v3.issues[0]!).toBe(true);
    expect('fix' in v3.issues[1]!).toBe(false);
    expect('expected' in v3.issues[1]!).toBe(false);
    const v4 = lessonContextView(two, 4);
    expect('fix' in v4.issues[1]!).toBe(true);
  });

  test('rung comes from server state and is clamped; junk means rung 0', () => {
    expect([clampRung(-1), clampRung(0), clampRung(4), clampRung(9), clampRung(2.5), clampRung('4'), clampRung(undefined), clampRung(Number.NaN)]).toEqual([0, 0, 4, 4, 0, 0, 0, 0]);
  });

  test('injected <oak_context> is redacted by the same rules', () => {
    const ctx = (r: Rung) => oakContext(LESSON, r, { attempt: 1, streak: 1, now: 't' });
    for (const r of [0, 1, 2, 3] as const) expect(found(haystack(ctx(r)), LEAK_MARKERS.solution)).toEqual([]);
    for (const r of [0, 1, 2] as const) expect(found(haystack(ctx(r)), LEAK_MARKERS.fix)).toEqual([]);
    expect(found(haystack(ctx(0)), LEAK_MARKERS.what)).toEqual([]);
    expect(ctx(4)).toContain(LESSON.solution.code);
    expect(ctx(3)).toContain(LESSON.issues[0]!.fix);
    expect(ctx(1)).toContain(LESSON.issues[0]!.what);
  });
});

describe.each(FAKE_KINDS)('cassette: no solution leak below rung 4 [%s]', (kind) => {
  // The cassette makes the model call get_lesson_context AND compare_haps, then propose_code.
  // We scan (1) every request body sent to the model, (2) the stored conversation,
  // (3) every SSE frame that would reach the browser.
  async function scan(rung: Rung) {
    const { events, conversation, h } = await runCassette(kind, hintCassette(), { rung });
    expect(events.at(-1)!.type).toBe('done');
    expect(h.sent()).toHaveLength(3);
    const toModel = haystack(...h.sent().map((r) => r.json));
    const stored = haystack(conversation);
    const toBrowser = haystack(...events.map(encodeSse));
    // sanity: the scan really sees tool results and context (non-vacuous at every rung)
    expect(toModel).toContain('"answer_policy"');
    expect(toModel).toContain(LESSON.issues[0]!.where);
    expect(toModel).toContain(LEARNER_CODE);
    expect(toModel).toContain('oak_context');
    return { toModel, stored, toBrowser };
  }

  test.each([0, 1, 2, 3] as const)('rung %d: no solution text anywhere', async (rung) => {
    const s = await scan(rung);
    expect(found(s.toModel, LEAK_MARKERS.solution)).toEqual([]);
    expect(found(s.stored, LEAK_MARKERS.solution)).toEqual([]);
    expect(found(s.toBrowser, LEAK_MARKERS.solution)).toEqual([]);
    expect(s.toModel).toContain('"answer_policy":"socratic"');
  });

  test.each([0, 1, 2] as const)('rung %d: no fix / expected values anywhere', async (rung) => {
    const s = await scan(rung);
    expect(found(s.toModel, LEAK_MARKERS.fix)).toEqual([]);
    expect(found(s.stored, LEAK_MARKERS.fix)).toEqual([]);
    expect(found(s.toBrowser, LEAK_MARKERS.fix)).toEqual([]);
  });

  test('rung 0: no "what" detail either', async () => {
    const s = await scan(0);
    expect(found(s.toModel, LEAK_MARKERS.what)).toEqual([]);
    expect(found(s.toBrowser, LEAK_MARKERS.what)).toEqual([]);
  });

  test('positive controls: what appears from rung 1, fix/expected from rung 3, solution at rung 4', async () => {
    const s1 = await scan(1);
    expect(found(s1.toModel, LEAK_MARKERS.what)).toEqual([...LEAK_MARKERS.what]);
    const s3 = await scan(3);
    expect(found(s3.toModel, LEAK_MARKERS.fix)).toEqual([...LEAK_MARKERS.fix]);
    expect(found(s3.toModel, LEAK_MARKERS.solution)).toEqual([]);
    const s4 = await scan(4);
    expect(found(s4.toModel, LEAK_MARKERS.solution)).toEqual(LEAK_MARKERS.solution.filter((m) => m !== '"targetHaps"'));
    expect(s4.toModel).toContain(LESSON.solution.code);
    expect(s4.toModel).toContain('"answer_policy":"may_reveal"');
    // The solution reaches the MODEL at rung 4; it reaches the browser only if the model chooses to show it.
    expect(found(s4.toBrowser, [LESSON.solution.code])).toEqual([]);
  });

  test('rung 4 unlocks Apply on code cards; lower rungs are preview-only', async () => {
    for (const rung of RUNGS) {
      const { events } = await runCassette(kind, hintCassette(), { rung });
      const card = events.find((e) => e.type === 'code_card');
      if (card?.type !== 'code_card') throw new Error('no card');
      expect(card.data.applyAllowed).toBe(rung === 4);
    }
  });
});

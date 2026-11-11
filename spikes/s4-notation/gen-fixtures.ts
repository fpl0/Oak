/** Bun script: evaluate the corpus headlessly and write the normalized events the page consumes. */
import { EXTRA, REQUIRED } from "./corpus.ts";
import { evalToEvents } from "./strudel-eval.ts";

const out = [];
for (const [name, code, bars] of [...REQUIRED, ...EXTRA]) {
  const { events } = await evalToEvents(code, bars);
  out.push({
    name,
    code,
    bars,
    // bigint rationals are not JSON: serialize as [n, d] strings
    events: events.map((e) => ({ ...e, onset: [`${e.onset.n}`, `${e.onset.d}`], dur: [`${e.dur.n}`, `${e.dur.d}`] })),
  });
}
await Bun.write(new URL("./web/fixtures.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${out.length} fixtures`);

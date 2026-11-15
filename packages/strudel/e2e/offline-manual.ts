// The same browser probes as offline.pw.ts, usable when the host cannot launch Playwright.
import { offlineChecks } from "./offline-checks.ts";
import { BAND, C3, SHORT } from "./offline-fixtures.ts";

const runs = {
  random: () => offlineChecks.short(SHORT.replace('s("piano")', 's("supersaw").degradeBy(.2).seed(3)')),
  dry: () => offlineChecks.short(SHORT.replace(".room(.2)", "")),
  short: () => offlineChecks.short(SHORT),
  c3: () => offlineChecks.c3(C3),
  band: () => offlineChecks.band({ band: BAND }),
  abort: () => offlineChecks.abort({ code: C3, short: SHORT }),
  concurrent: () => offlineChecks.concurrent(C3),
  failures: () => offlineChecks.failures(),
};
const name = new URLSearchParams(location.search).get("check") ?? "short";
const button = document.getElementById("run") as HTMLButtonElement;
const result = document.getElementById("result") as HTMLPreElement;

button.textContent = `Run ${name} check`;
button.onclick = async () => {
  button.disabled = true;
  result.textContent = `Running ${name}…`;
  const start = performance.now();
  try {
    const run = runs[name as keyof typeof runs];
    if (!run) throw new Error("Unknown check");
    const value = await run();
    result.textContent = `Check: ${name}; elapsedMs: ${performance.now() - start}\n`;
    for (const [key, item] of Object.entries(value)) {
      const row = document.createElement("div");
      row.textContent = `${key}: ${JSON.stringify(key === "progress" && Array.isArray(item) ? [item[0], item.at(-1)] : item)}`;
      result.append(row);
    }
  } catch (error) {
    result.textContent = JSON.stringify(
      { check: name, error: String(error), stack: error instanceof Error ? error.stack : null },
      null,
      2,
    );
  }
};

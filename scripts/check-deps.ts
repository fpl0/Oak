// Fails if more than one resolved version exists of packages that must be singletons.
// Bun's isolated linker stores every resolved package at node_modules/.bun/<name>@<version>[+peers]/.
import { readdirSync } from "node:fs";

const singletons = [
  "@strudel/core",
  "superdough",
  "@codemirror/state",
  "@codemirror/view",
  "@codemirror/language",
  "acorn",
];
const store = new URL("../node_modules/.bun/", import.meta.url).pathname;
const entries = readdirSync(store);
let bad = false;
for (const name of singletons) {
  const prefix = `${name.replace("/", "+")}@`;
  const versions = new Set(
    entries.filter((e) => e.startsWith(prefix)).map((e) => e.slice(prefix.length).split(/[+_]/)[0]),
  );
  if (versions.size === 0) console.warn(`[check-deps] ${name}: not installed`);
  if (versions.size > 1) {
    bad = true;
    console.error(`[check-deps] ${name}: ${versions.size} versions resolved: ${[...versions].join(", ")}`);
  }
}
if (bad) process.exit(1);
console.log("[check-deps] singletons ok");

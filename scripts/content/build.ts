// `bun run content:build [--watch] [--out <dir>] [--no-lock]`: regenerates content/.generated/ from the
// content sources and updates the ID ledger content/ids.lock.json (contracts §1.1). Exits 1 when a source
// fails to load or a locked ID disappeared. --watch rebuilds in a fresh process on every change (module
// caches stay clean). Safe to run concurrently: every file is replaced atomically (generate.ts, writeTree).
import { watch } from "node:fs";
import { relative } from "node:path";
import { CONTENT_ROOT } from "../../content/lib/load.bun.ts";
import { generate } from "./generate.ts";

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outDir = outIdx >= 0 ? argv[outIdx + 1] : undefined;

async function once(): Promise<boolean> {
  const t0 = performance.now();
  const r = await generate({ ...(outDir ? { outDir } : {}), writeLock: !argv.includes("--no-lock") });
  for (const e of r.errors) console.error(`content:build: ${e}`);
  const ms = Math.round(performance.now() - t0);
  console.log(
    `content:build: ${r.files.length} files in ${relative(process.cwd(), r.outDir)} (${ms} ms, version ${r.contentVersion.slice(0, 12)})`,
  );
  return r.errors.length === 0;
}

if (process.argv.includes("--watch")) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const rebuild = () => {
    if (running) return;
    running = true;
    const p = Bun.spawn(["bun", import.meta.path], { stdout: "inherit", stderr: "inherit" });
    void p.exited.finally(() => {
      running = false;
    });
  };
  rebuild();
  watch(CONTENT_ROOT, { recursive: true }, (_event, file) => {
    if (!file || file.startsWith(".generated") || file.endsWith("ids.lock.json")) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });
  console.log("content:build: watching content/ …");
} else {
  process.exit((await once()) ? 0 : 1);
}

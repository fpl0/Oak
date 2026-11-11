// Process host for the `theory` CLI: `bun run theory <op> …` or `bun packages/theory/src/cli.bun.ts <op> …`.
import { runTheoryCli } from "./cli.ts";

const { code, out } = runTheoryCli(process.argv.slice(2));
(code === 0 ? process.stdout : process.stderr).write(`${out}\n`);
process.exit(code);

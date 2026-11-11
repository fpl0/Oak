import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
const before = SyntaxError;
await (core as any).evalScope(core, mini);
console.log("SyntaxError replaced by evalScope(mini):", SyntaxError !== before, "| native?", String(SyntaxError).includes("[native code]"), "| globalThis.parse:", typeof (globalThis as any).parse);

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const parent = Bun.spawn([process.execPath, new URL("./orphan-parent.ts", import.meta.url).pathname], { stdout: "pipe", stderr: "inherit" });
let out = ""; const dec = new TextDecoder();
for await (const c of parent.stdout) { out += dec.decode(c); if (out.includes("CHILD")) break; }
const child = Number(/CHILD (\d+)/.exec(out)?.[1]);
await Bun.sleep(300);
console.log("parent", parent.pid, "child", child, "child alive:", alive(child));
parent.kill("SIGKILL"); await parent.exited;
const t0 = performance.now();
while (alive(child) && performance.now() - t0 < 5000) await Bun.sleep(50);
console.log("after SIGKILL of parent: child alive:", alive(child), "after", (performance.now() - t0).toFixed(0), "ms");
if (alive(child)) { process.kill(child, "SIGKILL"); console.log("(cleaned up orphan manually)"); }

// The orphan watchdog (spike S1): a subprocess grader stuck in a loop dies with its parent.
import { expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(30_000);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("a looping grader subprocess is killed by its watchdog when the parent is SIGKILLed", async () => {
  const parent = Bun.spawn(
    [process.execPath, new URL("./orphan-parent.test-helper.bun.ts", import.meta.url).pathname],
    {
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  const reader = parent.stdout.getReader();
  let out = "";
  while (!out.includes("READY")) {
    const { value, done } = await reader.read();
    if (done) break;
    out += new TextDecoder().decode(value);
  }
  expect(out).toContain("READY");
  const children = (await new Response(Bun.spawn(["pgrep", "-P", String(parent.pid)]).stdout).text())
    .split("\n")
    .filter(Boolean)
    .map(Number);
  expect(children.length).toBe(1);
  const child = children[0] as number;
  expect(alive(child)).toBe(true);
  parent.kill("SIGKILL");
  await parent.exited;
  const t0 = performance.now();
  while (alive(child) && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 100));
  expect(alive(child)).toBe(false);
});

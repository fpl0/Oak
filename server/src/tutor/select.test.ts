import { describe, expect, test } from "bun:test";
import { selectBackend, tutorHealth } from "./select.ts";
import { ScriptedBackend } from "./testing/scripted-backend.ts";
import { UNAVAILABLE } from "./types.ts";

const make = (apiOk: boolean, cliOk: boolean, apiReason: string = UNAVAILABLE.missingKey) => {
  const api = new ScriptedBackend("anthropic-api");
  const cli = new ScriptedBackend("claude-cli");
  api.isAvailable = apiOk ? { ok: true } : { ok: false, reason: apiReason };
  cli.isAvailable = cliOk ? { ok: true } : { ok: false, reason: UNAVAILABLE.notLoggedIn };
  return { "anthropic-api": api, "claude-cli": cli };
};

describe("backend selection", () => {
  test("auto: the API when a key is present, else a logged-in CLI, else off", async () => {
    expect((await selectBackend("auto", make(true, true))).backend?.id).toBe("anthropic-api");
    const cli = await selectBackend("auto", make(false, true));
    expect(cli.backend?.id).toBe("claude-cli");
    expect(cli.reason).toBe("auto");
    expect(cli.tried).toEqual([
      { id: "anthropic-api", ok: false, reason: "missing_key" },
      { id: "claude-cli", ok: true, reason: null },
    ]);
    const off = await selectBackend("auto", make(false, false));
    expect(off.backend).toBeNull();
    expect(tutorHealth(off)).toBe("missing_key");
  });

  test("an explicit setting wins and is never silently replaced", async () => {
    expect((await selectBackend("claude-cli", make(true, true))).backend?.id).toBe("claude-cli");
    const none = await selectBackend("claude-cli", make(true, false));
    expect(none.backend).toBeNull();
    expect(none.reason).toBe("not_logged_in");
    expect((await selectBackend("off", make(true, true))).backend).toBeNull();
  });

  test("a backend that is not wired, or whose check throws, is unavailable", async () => {
    expect((await selectBackend("anthropic-api", {})).reason).toBe("not_installed");
    const b = make(true, true);
    b["anthropic-api"].available = async () => {
      throw new Error("boom");
    };
    expect((await selectBackend("auto", b)).backend?.id).toBe("claude-cli");
  });

  test("health is the contract's enum and nothing else", async () => {
    expect(tutorHealth(await selectBackend("auto", make(true, false)))).toBe("ready");
    expect(tutorHealth(await selectBackend("auto", make(false, true)))).toBe("ready");
    expect(tutorHealth(await selectBackend("anthropic-api", make(false, true, UNAVAILABLE.invalidKey)))).toBe(
      "invalid_key",
    );
    expect(
      tutorHealth(await selectBackend("anthropic-api", make(false, true, UNAVAILABLE.unreachable))),
    ).toBe("unreachable");
  });
});

import { describe, expect, test } from "bun:test";
import { backendStatus, reasonCode, selectBackend, setupGuidance } from "./select.ts";
import { ScriptedBackend } from "./testing/scripted-backend.ts";
import { type BackendId, type TutorBackend, UNAVAILABLE } from "./types.ts";

const SECRET = "sk-ant-api03-THIS-IS-THE-KEY-0123456789";

function make(api: { ok: boolean; reason?: string }, cli: { ok: boolean; reason?: string }) {
  const a = new ScriptedBackend("anthropic-api");
  const c = new ScriptedBackend("claude-cli");
  a.isAvailable = api;
  c.isAvailable = cli;
  return { "anthropic-api": a, "claude-cli": c };
}
const no = (reason: string) => ({ ok: false, reason });
const yes = { ok: true };

describe("backend status for Settings", () => {
  test("every backend is reported, including the one selection never had to ask", async () => {
    const backends = make(yes, no(UNAVAILABLE.notLoggedIn));
    const s = await backendStatus("auto", backends);
    expect(s.active).toBe("anthropic-api");
    expect(s.health).toBe("ready");
    expect(s.reason).toBe("auto");
    expect(s.guidance).toBeNull();
    expect(s.backends).toEqual([
      {
        id: "anthropic-api",
        wired: true,
        ok: true,
        active: true,
        reason: null,
        guidance: null,
        billing: "api",
      },
      {
        id: "claude-cli",
        wired: true,
        ok: false,
        active: false,
        reason: "not_logged_in",
        guidance: expect.stringContaining("not signed in"),
        billing: "plan",
      },
    ]);
  });

  test("the active backend is always the one selectBackend picks", async () => {
    const settings = ["auto", "off", "anthropic-api", "claude-cli"] as const;
    const answers = [yes, no(UNAVAILABLE.missingKey)];
    for (const setting of settings)
      for (const api of answers)
        for (const cli of [yes, no(UNAVAILABLE.notLoggedIn)]) {
          const picked = (await selectBackend(setting, make(api, cli))).backend?.id ?? null;
          const status = await backendStatus(setting, make(api, cli));
          expect(status.active).toBe(picked);
          expect(status.backends.filter((b) => b.active).map((b) => b.id)).toEqual(picked ? [picked] : []);
          expect(status.guidance === null).toBe(picked !== null);
        }
  });

  test("off: nothing is active, but Settings still learns what is available", async () => {
    const s = await backendStatus("off", make(yes, yes));
    expect(s.active).toBeNull();
    expect(s.reason).toBe("off");
    expect(s.guidance).toContain("turned off");
    expect(s.backends.map((b) => [b.id, b.ok])).toEqual([
      ["anthropic-api", true],
      ["claude-cli", true],
    ]);
  });

  test("nothing wired, and a check that throws", async () => {
    const none = await backendStatus("auto", {});
    expect(none.backends.map((b) => [b.wired, b.reason])).toEqual([
      [false, "not_installed"],
      [false, "not_installed"],
    ]);
    const backends = make(yes, yes);
    backends["claude-cli"].available = async () => {
      throw new Error(`spawn failed with ${SECRET}`);
    };
    const s = await backendStatus("auto", backends);
    expect(s.backends[1]).toMatchObject({ ok: false, reason: "unreachable" });
    expect(JSON.stringify(s.backends)).not.toContain(SECRET);
  });

  test("a backend's free-text reason never leaves: only codes and fixed copy do", async () => {
    const leaky = no(`401 from upstream, x-api-key: ${SECRET}`);
    for (const setting of ["auto", "anthropic-api", "claude-cli", "off"] as const) {
      const s = await backendStatus(setting, make(leaky, leaky));
      // `selection` holds the backend objects and is not for serialising; everything else is.
      const { selection: _selection, ...publicPart } = s;
      const text = JSON.stringify(publicPart);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("sk-ant");
      expect(text).not.toContain("upstream");
      for (const b of s.backends) expect(b.reason).toBe("unreachable");
    }
  });

  test("reason codes are a closed set", () => {
    for (const code of [...Object.values(UNAVAILABLE), "off", "setting", "auto"])
      expect(reasonCode(code)).toBe(code);
    expect(reasonCode(null)).toBe("unreachable");
    expect(reasonCode("Authorization: Bearer abc")).toBe("unreachable");
  });

  test("guidance is specific to what is missing and always says Oak works without the tutor", () => {
    const cases: [string, BackendId | null, string][] = [
      [UNAVAILABLE.missingKey, null, "API key"],
      [UNAVAILABLE.invalidKey, "anthropic-api", "rejected"],
      [UNAVAILABLE.notLoggedIn, "claude-cli", "sign in"],
      [UNAVAILABLE.notInstalled, "claude-cli", "PATH"],
      [UNAVAILABLE.notInstalled, "anthropic-api", "not part of this build"],
      [UNAVAILABLE.unreachable, null, "connection"],
      ["off", null, "turned off"],
    ];
    for (const [reason, id, needle] of cases) {
      const text = setupGuidance(reason, id);
      expect(text).toContain(needle);
      expect(text).toContain("Oak works without the tutor");
    }
  });

  test("an explicit setting that is unavailable explains THAT backend", async () => {
    const s = await backendStatus("claude-cli", make(yes, no(UNAVAILABLE.notInstalled)));
    expect(s.active).toBeNull();
    expect(s.reason).toBe("not_installed");
    expect(s.guidance).toContain("Claude Code was not found");
    // The other backend is usable, and Settings can say so.
    expect((s.backends[0] as { ok: boolean }).ok).toBe(true);
    const typed: TutorBackend | null = s.selection.backend;
    expect(typed).toBeNull();
  });
});

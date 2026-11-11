import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { checkRequest, hostOnly, isMediaGetPath, localSecurity, oakSecurity } from "./security.ts";

const opts = localSecurity(8787);
const ORIGIN = "http://127.0.0.1:8787";

function req(method: string, headers: Record<string, string>, path = "/api/tutor/chat"): Request {
  return new Request(`http://127.0.0.1:8787${path}`, { method, headers });
}
const good = { host: "127.0.0.1:8787", origin: ORIGIN, "x-oak": "1" };

describe("request rules (contracts §11.1)", () => {
  test("the allowlist is the loopback names with the port, plus dev ports when asked", () => {
    expect(opts.allowedHosts).toEqual(["127.0.0.1:8787", "localhost:8787"]);
    expect(opts.allowedOrigins).toEqual(["http://127.0.0.1:8787", "http://localhost:8787"]);
    expect(localSecurity(8787, [5173, 8787]).allowedHosts).toEqual([
      "127.0.0.1:8787",
      "localhost:8787",
      "127.0.0.1:5173",
      "localhost:5173",
    ]);
  });

  test("a same-origin request with X-Oak passes", () => {
    expect(checkRequest(req("POST", good), opts)).toBeNull();
    expect(checkRequest(req("POST", { ...good, host: "LOCALHOST:8787" }), opts)).toBeNull();
    expect(checkRequest(req("POST", { ...good, "sec-fetch-site": "same-origin" }), opts)).toBeNull();
    // A GET may omit Origin (browsers do, same-origin).
    expect(checkRequest(req("GET", { host: "localhost:8787", "x-oak": "1" }), opts)).toBeNull();
  });

  test.each([
    ["a rebinding Host", { ...good, host: "evil.example:8787" }, "host"],
    ["a Host without the port", { ...good, host: "127.0.0.1" }, "host"],
    ["a Host on another port", { ...good, host: "127.0.0.1:9999" }, "host"],
    ["no Host", { origin: ORIGIN, "x-oak": "1" }, "host"],
    ["a foreign Origin", { ...good, origin: "https://evil.example" }, "origin"],
    ["the right host on another port as Origin", { ...good, origin: "http://127.0.0.1:3000" }, "origin"],
    ["Origin: null (sandboxed frame, file://)", { ...good, origin: "null" }, "origin"],
    ["a POST without Origin", { host: good.host, "x-oak": "1" }, "origin"],
    [
      "an allowed Origin that Fetch Metadata calls cross-site",
      { ...good, "sec-fetch-site": "cross-site" },
      "fetch-site",
    ],
    ["same-site is not same-origin", { ...good, "sec-fetch-site": "same-site" }, "fetch-site"],
    ["a typed navigation cannot be a POST", { ...good, "sec-fetch-site": "none" }, "fetch-site"],
    ["no X-Oak", { host: good.host, origin: ORIGIN }, "x-oak"],
    ["a wrong X-Oak", { ...good, "x-oak": "true" }, "x-oak"],
  ] as const)("refuses %s", (_name, headers, reason) => {
    expect(checkRequest(req("POST", headers), opts)).toBe(reason);
  });

  test("every preflight is refused, so no cross-origin page can send JSON or a custom header", () => {
    const preflight = req("OPTIONS", {
      host: good.host,
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "x-oak, content-type",
    });
    expect(checkRequest(preflight, opts)).toBe("preflight");
    expect(checkRequest(req("OPTIONS", good), opts)).toBe("preflight");
  });

  test("media GETs need same-origin Fetch Metadata instead of X-Oak; nothing else is exempt", () => {
    const media = ["/api/audio/a1", "/api/audio/a1/peaks", "/api/album/tracks/t1/versions/2/audio"];
    for (const path of media) {
      expect(isMediaGetPath(path)).toBe(true);
      const h = { host: good.host, "sec-fetch-site": "same-origin" };
      expect(checkRequest(req("GET", h, path), opts)).toBeNull();
      expect(checkRequest(req("GET", { host: good.host }, path), opts)).toBe("fetch-site");
      expect(checkRequest(req("GET", { host: good.host, "sec-fetch-site": "cross-site" }, path), opts)).toBe(
        "fetch-site",
      );
      expect(checkRequest(req("GET", { ...h, host: "evil.example" }, path), opts)).toBe("host");
      // The exemption is for GET only.
      expect(checkRequest(req("DELETE", { ...h, origin: ORIGIN }, path), opts)).toBe("x-oak");
    }
    for (const path of ["/api/tutor/status", "/api/audio", "/api/audio/a1/peaks/x", "/api/sketches/1"]) {
      expect(isMediaGetPath(path)).toBe(false);
      expect(checkRequest(req("GET", { host: good.host, "sec-fetch-site": "same-origin" }, path), opts)).toBe(
        "x-oak",
      );
    }
  });
});

describe("as middleware", () => {
  const app = new Hono();
  const denied: string[] = [];
  app.use(
    "/api/*",
    oakSecurity(opts, (reason) => denied.push(reason)),
  );
  app.post("/api/thing", (c) => c.json({ ok: true }));
  app.use("/mcp", hostOnly(opts));
  app.post("/mcp", (c) => c.json({ mcp: true }));

  test("lets a good request through and answers 403 without any CORS header otherwise", async () => {
    const ok = await app.request("http://127.0.0.1:8787/api/thing", { method: "POST", headers: good });
    expect(ok.status).toBe(200);

    const bad = await app.request("http://127.0.0.1:8787/api/thing", {
      method: "POST",
      headers: { ...good, origin: "https://evil.example" },
    });
    expect(bad.status).toBe(403);
    expect(await bad.json()).toEqual({ error: "forbidden", reason: "origin" });
    for (const [name] of bad.headers) expect(name.toLowerCase().startsWith("access-control-")).toBe(false);
    expect(denied).toEqual(["origin"]);

    const pre = await app.request("http://127.0.0.1:8787/api/thing", { method: "OPTIONS", headers: good });
    expect(pre.status).toBe(403);
    for (const [name] of pre.headers) expect(name.toLowerCase().startsWith("access-control-")).toBe(false);
  });

  test("hostOnly is for local processes: the Host rule holds and a browser Origin is refused", async () => {
    const url = "http://127.0.0.1:8787/mcp";
    const cli = await app.request(url, { method: "POST", headers: { host: "127.0.0.1:8787" } });
    expect(cli.status).toBe(200);
    const rebound = await app.request(url, { method: "POST", headers: { host: "evil.example:8787" } });
    expect(await rebound.json()).toEqual({ error: "forbidden", reason: "host" });
    const page = await app.request(url, {
      method: "POST",
      headers: { host: "127.0.0.1:8787", origin: ORIGIN },
    });
    expect(await page.json()).toEqual({ error: "forbidden", reason: "origin" });
    const pre = await app.request(url, { method: "OPTIONS", headers: { host: "127.0.0.1:8787" } });
    expect(pre.status).toBe(403);
  });
});

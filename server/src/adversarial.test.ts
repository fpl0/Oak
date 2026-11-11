// Adversarial review of the HTTP surface (contracts §11): encoded paths, oversized and streamed bodies,
// nonce flooding, Range edge cases, a zip bomb in a backup, data-directory permissions, and the API key
// in log lines. Each test is the regression test of a defect found and fixed, or pins a rule that held.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { ConfirmStore, MAX_OUTSTANDING_NONCES } from "./confirm.ts";
import { MAX_JSON_BYTES } from "./routes/define.ts";
import { serveFile } from "./services/audio-store.ts";
import { safeFile, safeSegment } from "./static.ts";
import { BROWSER, type Harness, harness } from "./testing/harness.ts";

const URL0 = "http://127.0.0.1:8787";

describe("encoded paths cannot reach what the plain path cannot", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });

  test("/api/dev/* stays hidden behind percent-encoding (the router decodes, the guard must too)", async () => {
    for (const path of ["/api/%64ev/qa", "/api/de%76/qa", "/api/%64%65%76/telemetry", "/api/dev%2Fqa"]) {
      const res = await h.req("GET", path);
      expect([path, res.status]).toEqual([path, 404]);
    }
  });

  test("a pack version of dots is not a directory name", () => {
    for (const v of [".", "..", "...", ""]) expect([v, safeSegment(v)]).toEqual([v, false]);
    for (const v of ["v1", "2026.11.1", "pack_a-b"]) expect([v, safeSegment(v)]).toEqual([v, true]);
  });

  test("safeFile refuses traversal, absolute paths, NUL and double encoding outside the root", () => {
    const root = mkdtempSync(join(tmpdir(), "oak-static-"));
    try {
      writeFileSync(join(root, "ok.txt"), "x");
      expect(safeFile(root, "ok.txt")).toBe(join(root, "ok.txt"));
      for (const rel of [
        "../etc/passwd",
        "/etc/passwd",
        "..%2Fetc%2Fpasswd",
        "ok.txt%00.png",
        "%2e%2e/x",
        ".",
      ])
        expect([rel, safeFile(root, rel)]).toEqual([rel, null]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("request bodies are bounded while they stream", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });

  test("a declared Content-Length over the limit is refused before the body is read", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulled++;
        ctrl.enqueue(new Uint8Array(64 * 1024).fill(32));
        if (pulled > 200) ctrl.close();
      },
    });
    const res = await h.server.app.request(`${URL0}/api/sketches`, {
      method: "POST",
      headers: {
        ...BROWSER,
        "content-type": "application/json",
        "content-length": String(MAX_JSON_BYTES + 1),
      },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(5);
  });

  test("a chunked JSON body is cut off at the limit, not buffered to the end", async () => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        sent += 256 * 1024;
        ctrl.enqueue(new Uint8Array(256 * 1024).fill(32));
        if (sent > 64 * 1024 * 1024) ctrl.close();
      },
    });
    const res = await h.server.app.request(`${URL0}/api/sketches`, {
      method: "POST",
      headers: { ...BROWSER, "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(MAX_JSON_BYTES + 4 * 256 * 1024);
  });

  test("a body under the limit still parses", async () => {
    const res = await h.req("POST", "/api/confirm", { action: "data.reset", target: "*" });
    expect(res.status).toBe(200);
  });
});

describe("confirm nonces", () => {
  test("flooding /api/confirm cannot grow server memory without bound; the newest nonces stay valid", () => {
    const store = new ConfirmStore(() => new Date("2026-11-11T12:00:00Z"));
    const first = store.issue("data.reset", "*");
    let last = first;
    for (let i = 0; i < MAX_OUTSTANDING_NONCES * 3; i++) last = store.issue("sketch.delete", `s${i}`);
    expect(store.size).toBeLessThanOrEqual(MAX_OUTSTANDING_NONCES);
    // The oldest was evicted; the newest works once.
    expect(store.consume(first.nonce, "data.reset", "*")).toBe(false);
    expect(store.consume(last.nonce, "sketch.delete", `s${MAX_OUTSTANDING_NONCES * 3 - 1}`)).toBe(true);
    expect(store.consume(last.nonce, "sketch.delete", `s${MAX_OUTSTANDING_NONCES * 3 - 1}`)).toBe(false);
  });

  test("a replayed nonce on a second destructive endpoint is refused", async () => {
    const h = await harness();
    try {
      const { nonce } = (await (
        await h.req("POST", "/api/confirm", { action: "data.reset", target: "*" })
      ).json()) as {
        nonce: string;
      };
      const a = h.req("POST", "/api/data/reset", undefined, { "x-oak-confirm": nonce });
      const b = h.req("POST", "/api/data/reset", undefined, { "x-oak-confirm": nonce });
      const statuses = (await Promise.all([a, b])).map((r) => r.status).sort();
      expect(statuses).toEqual([200, 428]);
    } finally {
      await h.close();
    }
  });
});

describe("Range requests", () => {
  const dir = mkdtempSync(join(tmpdir(), "oak-range-"));
  const file = join(dir, "a.bin");
  writeFileSync(file, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  const get = (range: string | null, method = "GET") =>
    serveFile(file, new Request(`${URL0}/x`, { method, headers: range === null ? {} : { range } }), {
      mime: "application/octet-stream",
    });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test.each<[string, number, string | null, number[] | null]>([
    ["bytes=0-0", 206, "bytes 0-0/10", [0]],
    ["bytes=8-", 206, "bytes 8-9/10", [8, 9]],
    ["bytes=-3", 206, "bytes 7-9/10", [7, 8, 9]],
    ["bytes=-30", 206, "bytes 0-9/10", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ["bytes=5-1000", 206, "bytes 5-9/10", [5, 6, 7, 8, 9]],
    ["bytes=10-", 416, "bytes */10", null],
    ["bytes=-0", 416, "bytes */10", null],
    ["bytes=99999999999999999999999-", 416, "bytes */10", null],
    // Not a single satisfiable byte range we understand: the whole file (RFC 9110 allows ignoring Range).
    ["bytes=5-3", 200, null, null],
    ["bytes=0-1,4-5", 200, null, null],
    ["items=0-1", 200, null, null],
    ["bytes=-", 200, null, null],
    ["bytes=1e3-", 200, null, null],
  ])("%s → %d", async (range, status, contentRange, bytes) => {
    const res = get(range);
    expect(res.status).toBe(status);
    expect(res.headers.get("content-range")).toBe(contentRange);
    if (bytes !== null) expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(bytes);
    if (status === 200) expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  test("HEAD carries the length and no body", async () => {
    const res = get("bytes=2-4", "HEAD");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-length")).toBe("3");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });
});

describe("backups", () => {
  test("a zip bomb (a deflated entry far larger than it declares) is refused without inflating it", async () => {
    const { readZip, ZipError } = await import("./lib/zip.ts");
    const big = new Uint8Array(64 * 1024 * 1024); // 64 MB of zeros, ~64 KB deflated
    const deflated = deflateRawSync(big);
    const name = new TextEncoder().encode("backup.json");
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, deflated.length, true);
    lv.setUint32(22, 16, true); // declares 16 bytes
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, deflated.length, true);
    cv.setUint32(24, 16, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length + deflated.length, true);
    const zip = new Uint8Array(local.length + deflated.length + central.length + end.length);
    zip.set(local, 0);
    zip.set(deflated, local.length);
    zip.set(central, local.length + deflated.length);
    zip.set(end, local.length + deflated.length + central.length);
    expect(() => readZip(zip)).toThrow(ZipError);
    // The total of declared sizes is bounded too.
    expect(() => readZip(zip, { maxBytes: 8 })).toThrow("archive too large");
  });
});

describe("the data directory", () => {
  test("a fresh data directory is private to the user (0700); the database and backups are 0600", async () => {
    const { openDb } = await import("./db/index.ts");
    const { dailyBackup } = await import("./services/backup.ts");
    const parent = mkdtempSync(join(tmpdir(), "oak-perm-"));
    const old = process.umask(0o022);
    try {
      const dataDir = join(parent, "nested", ".oak");
      const db = openDb(join(dataDir, "oak.db"));
      const backup = dailyBackup(db, join(dataDir, "backups"), "2026-11-11");
      db.close();
      expect(statSync(dataDir).mode & 0o777).toBe(0o700);
      expect(statSync(join(dataDir, "oak.db")).mode & 0o777).toBe(0o600);
      expect(statSync(join(dataDir, "backups")).mode & 0o777).toBe(0o700);
      expect(statSync(backup as string).mode & 0o777).toBe(0o600);
    } finally {
      process.umask(old);
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("the API key never reaches a log line", () => {
  test("an unhandled error whose message carries the key is logged redacted", async () => {
    const lines: string[] = [];
    const key = `sk-ant-api03-${"z".repeat(40)}`;
    const h = await harness({
      log: (m) => lines.push(m),
      keyValidator: async (k) => {
        throw new Error(`validator exploded for ${k}`);
      },
    });
    try {
      const res = await h.req("POST", "/api/settings/anthropic-key", { key });
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain(key);
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l).not.toContain(key);
      expect(lines.join("\n")).toContain("[redacted]");
    } finally {
      await h.close();
    }
  });
});

describe("the pasted API key", () => {
  test("a key with a line break or control character is refused before validation and never stored", async () => {
    let validated = 0;
    const h = await harness({
      keyValidator: async () => {
        validated++;
        return "unreachable";
      },
    });
    try {
      for (const key of [
        `sk-ant-${"a".repeat(30)}\nX-Evil: 1`,
        `sk-ant-${"a".repeat(30)}\u0000`,
        `sk ant ${"a".repeat(30)}`,
      ]) {
        expect([key, (await h.req("POST", "/api/settings/anthropic-key", { key })).status]).toEqual([
          key,
          400,
        ]);
      }
      expect(validated).toBe(0);
      expect(h.server.deps.secrets.source()).toBe("none");
      // Surrounding whitespace from a paste is fine.
      expect(
        (await h.req("POST", "/api/settings/anthropic-key", { key: `  sk-ant-${"b".repeat(30)}\n` })).status,
      ).toBe(200);
      expect(h.server.deps.secrets.anthropicKey()).toBe(`sk-ant-${"b".repeat(30)}`);
    } finally {
      await h.close();
    }
  });
});

describe("the CSP on documents", () => {
  test("an SVG from dist/ carries the CSP like HTML does (opened on its own it is a document)", async () => {
    const { mkdirSync } = await import("node:fs");
    const h = await harness();
    try {
      const { createServer } = await import("./app.ts");
      const { fixtureContent } = await import("./content/fixture.ts");
      const config = { ...h.server.deps.config, serveDist: true, dbPath: ":memory:" };
      mkdirSync(join(config.distDir, "assets"), { recursive: true });
      writeFileSync(
        join(config.distDir, "assets", "logo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const s = await createServer({
        config,
        content: fixtureContent(),
        graders: { learner: () => h.learner, tutor: () => h.tutorHost },
        tutor: false,
        env: {},
        log: () => {},
      });
      try {
        const res = await s.app.request(`${URL0}/assets/logo.svg`, { headers: { host: "127.0.0.1:8787" } });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        // A rebinding Host gets nothing from dist/ either.
        expect(
          (await s.app.request(`${URL0}/assets/logo.svg`, { headers: { host: "rebind.example:8787" } }))
            .status,
        ).toBe(403);
      } finally {
        await s.close();
      }
    } finally {
      await h.close();
    }
  });
});

describe("hostile backup contents", () => {
  async function importManifest(
    h: Harness,
    mutate: (tables: Record<string, Record<string, unknown>[]>) => void,
  ) {
    const { readZip, writeZip } = await import("./lib/zip.ts");
    const exported = new Uint8Array(await (await h.req("GET", "/api/backup/export?audio=0")).arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(readZip(exported).get("backup.json"))) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    mutate(manifest.tables);
    const archive = writeZip([
      { name: "backup.json", data: new TextEncoder().encode(JSON.stringify(manifest)) },
    ]);
    return h.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
  }

  test("rows that break a foreign key are refused, nothing changes, and foreign keys stay on", async () => {
    const h = await harness();
    try {
      const before = h.server.deps.db.query("SELECT COUNT(*) AS n FROM tutor_backend_records").get();
      const res = await importManifest(h, (t) => {
        t.tutor_backend_records = [
          {
            id: 1,
            conversation_id: "nope",
            backend: "claude-cli",
            seq: 1,
            record_json: "{}",
            excluded: 0,
            created_at: "2026-11-11T00:00:00Z",
          },
        ];
      });
      expect(res.status).toBe(400);
      expect(h.server.deps.db.query("SELECT COUNT(*) AS n FROM tutor_backend_records").get()).toEqual(before);
      expect(h.server.deps.db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      expect(() => h.server.deps.db.run("DELETE FROM unlocks")).not.toThrow(/no such/);
    } finally {
      await h.close();
    }
  });

  test("an audio row pointing outside the data directory is never served and does not break the next export", async () => {
    const h = await harness();
    try {
      const id = "f".repeat(64);
      const res = await importManifest(h, (t) => {
        t.audio_files = [
          {
            id,
            original_name: "x.wav",
            mime: "audio/wav",
            bytes: 4,
            duration_s: null,
            sample_rate: null,
            channels: null,
            stored_path: "audio/../../../../../../etc/hosts",
            peaks_path: "/etc/passwd",
            created_at: "2026-11-11T00:00:00Z",
          },
        ];
      });
      expect(res.status).toBe(200);
      const media = { host: "127.0.0.1:8787", "sec-fetch-site": "same-origin" };
      const got = await h.server.app.request(`${URL0}/api/audio/${id}`, { headers: media });
      expect(got.status).not.toBe(200);
      expect(await got.text()).not.toContain("localhost");
      const peaks = await h.server.app.request(`${URL0}/api/audio/${id}/peaks`, { headers: media });
      expect(peaks.status).not.toBe(200);
      expect((await h.req("GET", "/api/backup/export?audio=1")).status).toBe(200);
      expect((await h.req("GET", "/api/backup")).status).toBe(200);
    } finally {
      await h.close();
    }
  });
});

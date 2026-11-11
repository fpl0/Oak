// An in-page stub of Oak's REST API for the smoke suite: every `/api/*` request is answered from FIXTURES by
// matching it against the contract table, and `/sounds/*` is served from the local sound pack when it exists.
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { contract, type EndpointName } from "@oak/api";
import type { Page, Route } from "@playwright/test";
import { FIXTURES } from "./fixtures.ts";

const ROOT = join(import.meta.dirname, "../..");
const PACK = join(ROOT, "sounds/pack");

const routes = (Object.entries(contract) as [EndpointName, { method: string; path: string }][]).map(
  ([name, def]) => ({
    name,
    method: def.method,
    re: new RegExp(`^/api${def.path.replace(/:[A-Za-z]+/g, "[^/]+")}$`),
  }),
);

export function endpointOf(method: string, pathname: string): EndpointName | null {
  return routes.find((r) => r.method === method && r.re.test(pathname))?.name ?? null;
}

const MIME: Record<string, string> = {
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".js": "text/javascript",
};

export interface StubOptions {
  /** Answer every API call with a network failure (server down). */
  offline?: boolean;
  /** Record of requests that hit the stub, for assertions. */
  log?: { method: string; endpoint: string | null; headers: Record<string, string> }[];
}

export async function installStubApi(page: Page, opts: StubOptions = {}): Promise<void> {
  // A URL predicate, not a glob: "**/api/**" would also catch Vite's /@fs/…/packages/api/src modules.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route: Route) => {
      const req = route.request();
      const url = new URL(req.url());
      const endpoint = endpointOf(req.method(), url.pathname);
      opts.log?.push({ method: req.method(), endpoint, headers: req.headers() });
      if (opts.offline) return route.abort("connectionrefused");
      const body = endpoint ? (FIXTURES as Record<string, unknown>)[endpoint] : undefined;
      if (body === undefined)
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "not_found", message: `stub: no fixture for ${req.method()} ${url.pathname}` },
          }),
        });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    },
  );
  await page.route(
    (url) => url.pathname.startsWith("/sounds/"),
    async (route: Route) => {
      const url = new URL(route.request().url());
      let rel = decodeURIComponent(url.pathname.replace(/^\/sounds\//, ""));
      if (rel === "manifest.json") {
        const versions = existsSync(PACK)
          ? ["v1"].filter((v) => existsSync(join(PACK, v, "manifest.json")))
          : [];
        if (!versions[0]) return route.fulfill({ status: 404, body: "" });
        rel = `${versions[0]}/manifest.json`;
      }
      const abs = normalize(join(PACK, rel));
      if (!abs.startsWith(PACK) || !existsSync(abs)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({
        status: 200,
        contentType: MIME[extname(abs)] ?? "application/octet-stream",
        body: readFileSync(abs),
      });
    },
  );
}

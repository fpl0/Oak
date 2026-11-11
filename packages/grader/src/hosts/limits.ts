// The flag the subprocess host passes to its child and the child's watchdog reads (no side effects:
// the server imports this; watchdog.bun.ts itself only ever runs inside the child).
export const MAX_RSS_FLAG = "--oak-max-rss-mb=";

/** The resident-set limit in bytes from the child's argv, or `null` for none. */
export function maxRssBytes(argv: readonly string[]): number | null {
  const arg = argv.find((a) => a.startsWith(MAX_RSS_FLAG));
  const mb = arg === undefined ? Number.NaN : Number(arg.slice(MAX_RSS_FLAG.length));
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : null;
}

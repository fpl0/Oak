// A zip archive of the album's recordings, written in the browser ("Download every recording", ux §5.3): stored
// entries only (the recordings are compressed audio already), UTF-8 names, CRC-32 and sizes in the local headers.
// The format is PKWARE APPNOTE 6.3.x §4.3 without extensions: enough for a dozen takes, and every archive tool
// opens it. Pure: bytes in, bytes out.

let table: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  table = t;
  return t;
}

/** CRC-32 (IEEE 802.3) of a byte run. */
export function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (t[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive, forward slashes ("01-intro.webm"). */
  name: string;
  data: Uint8Array;
  /** The entry's modification time. Default: now. */
  date?: Date;
}

/** MS-DOS time and date (2-second steps, years from 1980), as the zip headers store them. */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Names must be unique in an archive: a repeated one gets " (2)", " (3)" before its extension. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    if (count === 1) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`;
  });
}

/** The archive's bytes. Entries are stored in the order given. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const names = uniqueNames(entries.map((e) => e.name.replace(/^\/+/, ""))).map((n) => enc.encode(n));
  const now = new Date();
  let size = 22;
  entries.forEach((e, i) => {
    const n = (names[i] as Uint8Array).length;
    size += 30 + n + e.data.length + 46 + n;
  });
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const central: { offset: number; crc: number; time: number; date: number }[] = [];
  let at = 0;
  entries.forEach((e, i) => {
    const name = names[i] as Uint8Array;
    const crc = crc32(e.data);
    const { time, date } = dosDateTime(e.date ?? now);
    central.push({ offset: at, crc, time, date });
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0x0800, true); // UTF-8 names
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, crc, true);
    view.setUint32(at + 18, e.data.length, true);
    view.setUint32(at + 22, e.data.length, true);
    view.setUint16(at + 26, name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(name, at + 30);
    out.set(e.data, at + 30 + name.length);
    at += 30 + name.length + e.data.length;
  });
  const dirStart = at;
  entries.forEach((e, i) => {
    const name = names[i] as Uint8Array;
    const c = central[i] as (typeof central)[number];
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // made by
    view.setUint16(at + 6, 20, true); // needed
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, c.time, true);
    view.setUint16(at + 14, c.date, true);
    view.setUint32(at + 16, c.crc, true);
    view.setUint32(at + 20, e.data.length, true);
    view.setUint32(at + 24, e.data.length, true);
    view.setUint16(at + 28, name.length, true);
    // extra, comment, disk, internal and external attributes: zero (the buffer is zero-filled)
    view.setUint32(at + 42, c.offset, true);
    out.set(name, at + 46);
    at += 46 + name.length;
  });
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - dirStart, true);
  view.setUint32(at + 16, dirStart, true);
  return out;
}

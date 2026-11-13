// The Band's production defaults for harmony (contracts §5.10, Wave 4): at U05–U07 every Band in every flavour
// that ships by then (content/flavours.ts FLAVOUR_RULES: pop and jazz-soul; indie and funk ship in Wave 5) plays
// like a record: the chords sit in a room and off-centre, the bass is low-passed and centred, every part's
// velocity moves (no pasted hits), and nothing clips the bus. Checked on the code the adapter receives, evaluated
// in headless Strudel through `bandCodeFor` exactly as an editor or the pattern player prepares it.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { bandCodeAt, bands } from "../../../content/bands/index.ts";
import { FLAVOUR_RULES, flavourById } from "../../../content/flavours.ts";
import { bandCodeFor } from "./band.ts";
import type { BandSetup } from "./types.ts";

setDefaultTimeout(60_000);

/** Wave 4's lessons are all after U03.L01 and U06.L01 in every order: every stage has been reached. */
const AT_U07 = () => true;
const SHIPPED = Object.entries(FLAVOUR_RULES)
  .filter(([, r]) => ["W2", "W3", "W4"].includes(r.ships))
  .map(([id]) => id);

describe("Band production at U05–U07", () => {
  test("the flavours that exist by U07 are pop and jazz-soul (indie and funk ship in Wave 5)", () => {
    expect(SHIPPED.sort()).toEqual(["flavour.jazz-soul", "flavour.pop"]);
  });

  for (const band of bands) {
    for (const flavour of SHIPPED) {
      test(`${band.id} in ${flavour}`, async () => {
        const prod = flavourById.get(flavour as never)?.production;
        if (!prod) throw new Error(`no production for ${flavour}`);
        const setup: BandSetup = {
          band: band.id,
          flavour: flavour as never,
          code: bandCodeAt(band, flavour, AT_U07).replaceAll("{{key}}", "A4:major"),
          followsLearnerKey: false,
          tracks: ["drums", "bass", "chords"],
        };
        const code = bandCodeFor(setup, {
          key: { tonic: "A", mode: "major" } as never,
          defaultBpm: 96,
          learnerCode: "",
        });
        const meter = band.id === "band.waltz-vamp" ? 3 : 4;
        const r = await evalHeadless(`setcpm(96/${meter})\n${code}`, 4);
        const by = (t: string) => r.events.filter((e) => e.track === t).map((e) => e.value);
        const [drums, bass, chords] = [by("drums"), by("bass"), by("chords")];
        expect(drums.length).toBeGreaterThan(8);
        expect(bass.length).toBeGreaterThan(2);
        expect(chords.length).toBeGreaterThan(5);
        // the bass: low-passed at the flavour's corner, centred, under the chords
        for (const v of bass) {
          expect(v.cutoff).toBe(prod.bassLpf); // `.lpf()` is stored as `cutoff`
          expect(v.pan ?? 0.5).toBe(0.5);
        }
        // the chords: in the flavour's room, panned off-centre
        for (const v of chords) {
          expect(v.room).toBe(prod.room);
          expect(v.pan).toBe(prod.pan.chords);
        }
        // velocities move within the humanise range, and never all the same
        for (const part of [drums, chords]) {
          const vel = part.map((v) => (typeof v.velocity === "number" ? v.velocity : 1));
          expect(new Set(vel).size).toBeGreaterThan(1);
          expect(Math.min(...vel)).toBeGreaterThanOrEqual(1 - 2 * prod.humanizeVelocity - 1e-9);
          expect(Math.max(...vel)).toBeLessThanOrEqual(1);
        }
        // levels leave headroom for the learner's parts
        for (const v of [...drums, ...bass, ...chords]) expect(Number(v.gain ?? 1)).toBeLessThanOrEqual(0.9);
        // in every bar the chords never dip under the bass (a crossing muddies the root on headphones). The
        // low-interval limit (no third under C3) is reported, not asserted: the Band voicings are author:CP's.
        const bars = band.id === "band.phrase-8bar" ? 8 : 4;
        const r8 = bars > 4 ? await evalHeadless(`setcpm(96/${meter})\n${code}`, bars) : r;
        const gaps: number[] = [];
        for (let bar = 0; bar < bars; bar++) {
          const inBar = (t: string) =>
            r8.events.filter((e) => e.track === t && e.onset >= bar && e.onset < bar + 1 && e.midi !== null);
          const lowChord = Math.min(...inBar("chords").map((e) => e.midi as number));
          const bassNotes = inBar("bass").map((e) => e.midi as number);
          if (bassNotes.length > 0 && Number.isFinite(lowChord)) gaps.push(lowChord - Math.max(...bassNotes));
        }
        expect(gaps.length).toBeGreaterThan(0);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
        const muddy = r8.events.filter(
          (e, _i, all) =>
            e.track === "chords" &&
            e.midi !== null &&
            e.midi < 48 &&
            all.some(
              (o) =>
                o.track === "chords" &&
                o.onset === e.onset &&
                o.midi !== null &&
                o.midi - (e.midi as number) >= 3 &&
                o.midi - (e.midi as number) <= 4,
            ),
        );
        if (muddy.length > 0)
          console.info(
            `${band.id} ${flavour} in A: a third under C3 at bars ${[...new Set(muddy.map((e) => Math.floor(e.onset) + 1))].join(" ")}`,
          );
      });
    }
  }
});

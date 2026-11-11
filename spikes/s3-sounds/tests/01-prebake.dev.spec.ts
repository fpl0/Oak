import { expect, test } from "@playwright/test";
import { guardNetwork, openLab, saveResult, sounds } from "./helpers.ts";

test("prebake: API surface, registered sounds, aliases", async ({ page, context }) => {
  const net = await guardNetwork(context);
  const { boot, consoleErrors } = await openLab(page);
  const exportsFound = await page.evaluate(() => window.oak.exports());
  const all = await page.evaluate(() => window.oak.sounds());
  const probe = await page.evaluate(() => ({
    piano: window.oak.sound("piano"),
    gm_piano: window.oak.sound("gm_piano"),
    gm_epiano1: window.oak.sound("gm_epiano1"),
    gm_violin: window.oak.sound("gm_violin"),
    rhodes: window.oak.sound("rhodes"),
    crunch: window.oak.sound("crunch"),
    RolandTR909_bd: window.oak.sound("RolandTR909_bd"),
    tr909_bd: window.oak.sound("tr909_bd"),
    linn_tb: window.oak.sound("linn_tb"),
    tr808_sd: window.oak.sound("tr808_sd"),
    bd: window.oak.sound("bd"),
    _base: window.oak.sound("_base"),
  }));
  const junk = await page.evaluate(() => window.oak.junkBaseProbe());
  const names: string[] = all.names;
  const result = {
    boot,
    exportsFound,
    total: all.total,
    byType: all.byType,
    gm: names.filter((n) => n.startsWith("gm_")),
    oakAliases: names.filter((n) => ["rhodes", "upright", "ebass", "organ", "jazzgtr", "cleangtr", "crunch", "strings", "horns", "tenor"].includes(n)),
    bankAliasSamples: names.filter((n) => /^(tr909|tr808|tr707|linn)_/.test(n)).length,
    probe: {
      ...probe,
      piano: probe.piano && { type: probe.piano.type, notes: Object.keys(probe.piano.samples as object).length },
    },
    junkBaseFromStringSamples: junk,
    soundRequestsDuringPrebake: sounds(net),
    external: net.external,
    consoleErrors,
  };
  saveResult("01-prebake", result);

  expect(exportsFound.aliasBank).toBe("function");
  expect(exportsFound.soundAlias).toBe("function");
  expect(exportsFound.registerZZFXSounds).toBe("function");
  expect(result.gm).toHaveLength(17);
  expect(result.oakAliases).toHaveLength(10);
  expect(probe.gm_violin).toBeNull(); // unmirrored gm_* names are unregistered
  expect(probe.rhodes?.fonts).toEqual(["0040_FluidR3_GM_sf2_file"]);
  expect(probe.tr909_bd).not.toBeNull(); // aliasBank works in 1.3.0
  expect(probe._base).toBeNull(); // Oak prebake strips _base
  expect(junk).not.toBeNull(); // ...which the string form of samples() would have registered
  expect(net.external).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

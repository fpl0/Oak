// bun spikes/s5-pitch/scripts/summarize-results.ts — compact table of results/*.json for FINDINGS.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dir, '..', 'results');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const rows: Record<string, unknown>[] = [];
const uas = new Set<string>();
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const [mode, project, ...rest] = f.replace(/\.json$/, '').split('.');
  const name = rest.join('.');
  if (j.userAgent) uas.add(`${project}: ${j.userAgent}`);
  if (name.startsWith('sine440') && j.sampleRate && j.worklet) {
    rows.push({
      mode,
      browser: project,
      variant: name.replace('sine440.', ''),
      sr: j.sampleRate,
      'msg/s': j.messageRateHz,
      medianHz: j.medianHz,
      cents: j.medianCents,
      voiced: j.voicedPct,
      'gap p95/max': `${j.messageGapMs.p95}/${j.messageGapMs.max}`,
      'lag p95/max': `${j.deliveryLagMs.p95}/${j.deliveryLagMs.max}`,
      'us/call(wklt)': j.worklet.findPitchUsInWorklet,
      'load%': j.worklet.renderLoadPctFromBench,
      maxBlockMs: `${j.worklet.maxBlockMs}@${j.worklet.maxAtBlock}`,
      addModMs: j.addModuleMs,
    });
  }
}
console.table(rows);
for (const u of uas) console.log(u);
for (const f of files.filter((f) => /sung|strudel|new-url/.test(f))) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (f.includes('strudel')) console.log(f, JSON.stringify({ sr: j.sampleRate, voices: j.superdoughVoicesScheduled, peakRms: j.superdoughPeakRms, rate: j.messageRateHz, cents: j.medianCents, range: j.centsRange, gap: j.messageGapMs, segs: j.segments, problems: j.problems }));
  else if (f.includes('new-url')) console.log(f, JSON.stringify({ ok: j.ok, frames: j.frames, url: String(j.workletUrl ?? '').slice(0, 60), problem: String(j.problems?.[0] ?? '').slice(0, 110) }));
  else console.log(f, JSON.stringify({ notes: j.notes, cents: j.cents ?? j.segments.map((s: any) => +s.cents.toFixed(2)), interOnset: j.interOnset, durations: j.durations }));
}

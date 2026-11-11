// How many reviews does ONE fact card cost over its first N days, as a function of desired retention?
// Learner truth = FSRS's own prediction (recall - 0.02), daily sessions, retry after a miss.
import { createSrs, DEFAULT_SRS_CONFIG } from './srs.ts';
import { mulberry32 } from './sim.ts';
for (const dr of [0.8, 0.85, 0.9]) {
  const srs = await createSrs({ fact: { ...DEFAULT_SRS_CONFIG.fact, desiredRetention: dr } });
  const horizons = [30, 100, 200, 300];
  const tot = horizons.map(() => 0);
  let lapses = 0, reviews = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = mulberry32(1000 + i);
    const t0 = new Date('2027-01-04T10:00:00Z');
    let c = srs.createCard('fact', t0, `f${i}`);
    for (let d = 0; d < 300; d++) {
      const now = new Date(t0.getTime() + d * 86400000);
      if (!srs.isDue(c, now)) continue;
      const p = c.reps === 0 ? 0.85 : Math.max(0.3, srs.recallProbability(c, now) - 0.02);
      const ok = r() < p; const u = r();
      c = srs.review(c, { accuracy: ok ? (u < 0.1 ? 0.75 : 1) : 0, fast: u > 0.7, revealed: false }, now).card;
      let n = 1; reviews++;
      if (!ok) { lapses++; c = srs.review(c, { accuracy: r() < 0.9 ? 1 : 0, fast: false, revealed: false }, new Date(now.getTime() + 360000)).card; n++; reviews++; }
      horizons.forEach((h, k) => { if (d < h) tot[k]! += n; });
    }
  }
  console.log(`fact dr=${dr}: reviews per card by day ${horizons.map((h, k) => `${h}: ${(tot[k]! / N).toFixed(2)}`).join('  ')}  | miss rate ${(lapses / (reviews - lapses)).toFixed(3)}`);
}

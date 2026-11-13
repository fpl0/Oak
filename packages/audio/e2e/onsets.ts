// Onset detection for the e2e measurements (pure: also runs under Bun).

/**
 * Onsets of tone bursts, seconds on the capture's own clock: where the 1 ms envelope first crosses half of the
 * channel's loudest burst after at least 150 ms of quiet.
 */
export function burstOnsets(x: Float32Array, sr: number): number[] {
  const win = Math.max(1, Math.round(sr * 0.001));
  const env = new Float32Array(Math.ceil(x.length / win));
  for (let k = 0; k < env.length; k++) {
    let m = 0;
    for (let i = k * win; i < Math.min(x.length, (k + 1) * win); i++)
      m = Math.max(m, Math.abs(x[i] as number));
    env[k] = m;
  }
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  if (peak <= 0) return [];
  const on = 0.5 * peak;
  const quiet = 0.08 * peak;
  const out: number[] = [];
  // Armed after 150 ms of quiet; a rising attack (between quiet and half) never disarms it.
  let armed = true;
  let quietFor = 0;
  for (let k = 0; k < env.length; k++) {
    const v = env[k] as number;
    if (armed && v >= on) {
      // The crossing inside the 1 ms window, sample by sample.
      let at = k * win;
      for (let i = k * win; i < Math.min(x.length, (k + 1) * win); i++)
        if (Math.abs(x[i] as number) >= on) {
          at = i;
          break;
        }
      out.push(at / sr);
      armed = false;
      quietFor = 0;
    } else if (!armed) {
      quietFor = v < quiet ? quietFor + 1 : 0;
      if (quietFor >= 150) armed = true;
    }
  }
  return out;
}

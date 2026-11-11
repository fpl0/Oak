// node spikes/s5-pitch/e2e/cold-worklet-only.mjs   (run from the spike folder)
// Starts Vite dev with a COLD dep cache and loads a page where only the worklet imports pitchy.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, '.vite-cache-cold'), { recursive: true, force: true });
const vite = spawn('node', ['../../node_modules/vite/bin/vite.js', '--config', 'vite.cold.config.ts'], { cwd: root, env: process.env });
let log = '';
vite.stdout.on('data', (d) => (log += d));
vite.stderr.on('data', (d) => (log += d));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  for (let i = 0; i < 50 && !log.includes('Local:'); i++) await new Promise((r) => setTimeout(r, 100));
  const page = await browser.newPage();
  const events = [];
  page.on('console', (m) => events.push(`console.${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => events.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) events.push(`http ${r.status()} ${r.url()}`); });
  page.on('framenavigated', () => events.push('navigated/reloaded'));
  for (const attempt of [1, 2]) {
    await page.goto('http://127.0.0.1:5185/worklet-only.html');
    await page.waitForFunction(() => window.workletOnly);
    let res;
    try { res = await page.evaluate(() => window.workletOnly()); } catch (e) { res = { error: String(e.message).split('\n')[0] }; }
    console.log(`attempt ${attempt}:`, JSON.stringify(res));
    await page.waitForTimeout(500);
  }
  console.log('page events:', JSON.stringify(events, null, 1));
} finally {
  await browser.close();
  vite.kill('SIGTERM');
  await new Promise((r) => vite.on('exit', r));
  console.log('--- vite log ---\n' + log.replace(/\x1b\[[0-9;]*m/g, ''));
}

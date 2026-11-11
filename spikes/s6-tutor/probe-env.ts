// How does a Hono handler reach the Bun server? Run: bun spikes/s6-tutor/probe-env.ts
import path from 'node:path';
import { Hono } from 'hono';
import { getBunServer } from 'hono/bun';

const PORT = 8796;
const app = new Hono<{ Bindings: Bun.Server<undefined> }>();
let server: Bun.Server<undefined>;
app.get('/env', (c) =>
  c.json({
    form: 'Bun.serve({ fetch: app.fetch })',
    envIsTheServerObject: c.env === server,
    helperSameAsEnv: getBunServer<Bun.Server<undefined>>(c) === server,
    envHasTimeout: typeof c.env.timeout === 'function',
    requestIP: c.env.requestIP(c.req.raw)?.address,
  }),
);
server = Bun.serve({ hostname: '127.0.0.1', port: PORT, fetch: app.fetch });
console.log(JSON.stringify(await (await fetch(`http://127.0.0.1:${PORT}/env`)).json()));
// In-memory app.request(): there is no server, c.env is undefined -> handlers must guard.
const mem = new Hono();
mem.get('/env', (c) => c.json({ form: 'app.request() (unit test)', envType: typeof c.env, envKeys: Object.keys(c.env ?? {}) }));
console.log(JSON.stringify(await (await mem.request('/env')).json()));
await server.stop(true);

const child = Bun.spawn({ cmd: [process.execPath, 'run', path.join(import.meta.dir, 'probe-env-default.ts')], stdout: 'pipe', stderr: 'pipe' });
try {
  let out: unknown = null;
  for (let i = 0; i < 50 && out === null; i++) {
    await Bun.sleep(100);
    try {
      out = await (await fetch(`http://127.0.0.1:${PORT}/env`)).json();
    } catch {
      /* not up yet */
    }
  }
  console.log(JSON.stringify(out));
} finally {
  child.kill();
  await child.exited;
}

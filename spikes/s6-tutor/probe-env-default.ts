// `export default { fetch }` form (what `bun run file.ts` auto-serves). Used by probe-env.ts.
import { Hono } from 'hono';
import { getBunServer } from 'hono/bun';

const app = new Hono<{ Bindings: Bun.Server<undefined> }>();
app.get('/env', (c) => {
  const viaHelper = getBunServer<Bun.Server<undefined>>(c);
  return c.json({
    form: 'export default',
    envHasTimeout: typeof c.env?.timeout === 'function',
    envHasRequestIP: typeof c.env?.requestIP === 'function',
    helperSameAsEnv: viaHelper === c.env,
    port: c.env?.port,
    hostname: c.env?.hostname,
  });
});

export default { port: 8796, hostname: '127.0.0.1', fetch: app.fetch };

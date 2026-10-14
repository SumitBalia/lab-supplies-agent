import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { handleMessage, requestSchema } from './agent.js';
import { history, getLab, getProposal, latestReply } from './db.js';
import { Trace } from './trace.js';
import { Tools } from './tools.js';
const app = express();
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', provider: config.MODEL_PROVIDER }));
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const user = Object.entries(config.users).find(([, value]) => {
    const a = Buffer.from(value),
      b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED: Valid user bearer token required.' });
    return;
  }
  res.locals.userId = user[0];
  next();
});
app.post('/chat', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.userId !== res.locals.userId) {
    res.status(403).json({ error: 'USER_MISMATCH: Request user must match bearer identity.' });
    return;
  }
  try {
    res.json(await handleMessage(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.';
    res
      .status(/SESSION_BUSY|REQUEST_ID_CONFLICT/.test(message) ? 409 : 500)
      .json({ error: message });
  }
});
app.get('/session', async (req, res) => {
  const u = res.locals.userId,
    s = String(req.query.sessionId ?? '');
  if (!s || s.length > 100) {
    res.status(400).json({ error: 'sessionId required.' });
    return;
  }
  const latest = latestReply(u, s);
  res.json({
    messages: history(u, s),
    lab: getLab(u),
    proposal: getProposal(u, s),
    provider: config.MODEL_PROVIDER,
    events: latest?.events ?? [],
    traceId: latest?.traceId ?? '',
  });
});
app.get('/orders', async (_req, res) => {
  const trace = new Trace(res.locals.userId, 'orders'),
    tools = new Tools(trace, Date.now() + config.REQUEST_TIMEOUT_MS);
  try {
    await tools.connect();
    res.json(await tools.call('list_orders', { userId: res.locals.userId }));
  } catch {
    res.status(503).json({ error: 'Could not load orders.' });
  } finally {
    await tools.close().catch(() => {});
  }
});
app.post('/faults', async (req, res) => {
  if (config.ALLOW_FAULT_CONTROL !== 'true') {
    res.status(403).json({ error: 'Fault control disabled.' });
    return;
  }
  const trace = new Trace(res.locals.userId, 'fault-control'),
    tools = new Tools(trace, Date.now() + config.REQUEST_TIMEOUT_MS);
  try {
    await tools.connect();
    res.json(await tools.call('configure_faults', { mode: req.body.mode }));
  } catch {
    res.status(400).json({ error: 'Could not configure failures.' });
  } finally {
    await tools.close().catch(() => {});
  }
});
app.get('/faults', async (_req, res) => {
  const trace = new Trace(res.locals.userId, 'fault-control'),
    tools = new Tools(trace, Date.now() + config.REQUEST_TIMEOUT_MS);
  try {
    await tools.connect();
    res.json(await tools.call('get_faults', {}));
  } catch {
    res.status(503).json({ error: 'Could not read failure configuration.' });
  } finally {
    await tools.close().catch(() => {});
  }
});
const server = app.listen(config.PORT, process.env.BIND_HOST ?? '127.0.0.1', () =>
  console.log(`Agent service http://127.0.0.1:${config.PORT} (${config.MODEL_PROVIDER})`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));

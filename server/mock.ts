import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { products } from './seed.js';
import { verifyApproval } from './approval.js';
import type { Order, Product } from './types.js';

mkdirSync(config.DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(config.DATA_DIR, 'mock.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,payload TEXT NOT NULL);`);
for (const p of products)
  db.prepare('INSERT OR IGNORE INTO products VALUES(?,?)').run(p.id, JSON.stringify(p));
const items = (): Product[] =>
  (db.prepare('SELECT payload FROM products ORDER BY id').all() as { payload: string }[]).map((r) =>
    JSON.parse(r.payload),
  );
type Mode = 'off' | 'flaky' | 'rate-limit' | 'server-error' | 'slow' | 'lost-response';
let fault: { mode: Mode; count: number } = { mode: 'off', count: 0 };
const app = express();
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${config.MOCK_API_KEY}`) {
    res
      .status(401)
      .json({ code: 'UNAUTHORIZED', message: 'Valid mock API key required.', retryable: false });
    return;
  }
  next();
});
app.post('/faults', (req, res) => {
  if (config.ALLOW_FAULT_CONTROL !== 'true') {
    res
      .status(403)
      .json({ code: 'DISABLED', message: 'Fault control is disabled.', retryable: false });
    return;
  }
  const parsed = z
    .object({
      mode: z.enum(['off', 'flaky', 'rate-limit', 'server-error', 'slow', 'lost-response']),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ code: 'INVALID_INPUT', message: 'Unknown failure mode.', retryable: false });
    return;
  }
  fault = { mode: parsed.data.mode, count: 0 };
  res.json(fault);
});
app.get('/faults', (_req, res) => res.json(fault));
app.use(async (req, res, next) => {
  fault.count++;
  const mode =
    fault.mode === 'flaky'
      ? (['rate-limit', 'server-error', 'off'][(fault.count - 1) % 3] as Mode)
      : fault.mode;
  if (mode === 'rate-limit') {
    res.set('Retry-After', '0.1').status(429).json({
      code: 'RATE_LIMITED',
      message: 'Supplier is busy. Retry shortly.',
      retryable: true,
      retryAfterMs: 100,
    });
    return;
  }
  if (mode === 'server-error') {
    res.status(503).json({
      code: 'BACKEND_UNAVAILABLE',
      message: 'Supplier service unavailable.',
      retryable: true,
    });
    return;
  }
  if (mode === 'slow')
    await new Promise((resolve) => setTimeout(resolve, config.TOOL_TIMEOUT_MS * 2));
  if (req.destroyed) return;
  next();
});
app.get('/supplies', (req, res) => {
  const parsed = z
    .object({
      source: z.enum(['inventory', 'catalogue']),
      query: z.string().max(100).default(''),
      cursor: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(20).default(3),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ code: 'INVALID_INPUT', message: 'Invalid search parameters.', retryable: false });
    return;
  }
  const { source, query, cursor, limit } = parsed.data;
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const matches = items().filter(
    (p) =>
      p.approved &&
      terms.every((t) => `${p.name} ${p.keywords.join(' ')} ${p.id}`.toLowerCase().includes(t)),
  );
  res.json({
    source,
    items: matches.slice(cursor, cursor + limit),
    total: matches.length,
    nextCursor: cursor + limit < matches.length ? String(cursor + limit) : null,
  });
});
app.get('/supplies/:id', (req, res) => {
  const item = items().find((p) => p.id === req.params.id && p.approved);
  if (!item) {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Supply not found in approved catalogue.',
      retryable: false,
    });
    return;
  }
  res.json(item);
});
app.get('/orders', (req, res) => {
  const userId = String(req.query.userId ?? '');
  res.json({
    orders: (
      db.prepare('SELECT payload FROM orders ORDER BY rowid DESC').all() as { payload: string }[]
    )
      .map((r) => JSON.parse(r.payload) as Order)
      .filter((o) => o.userId === userId),
  });
});
app.post('/orders', async (req, res) => {
  try {
    const input = z
      .object({
        proof: z.string(),
        idempotencyKey: z.string(),
        itemId: z.string(),
        quantity: z.number().int().min(1).max(100),
        lab: z.string().min(1).max(80),
        userId: z.string(),
      })
      .parse(req.body);
    const claims = verifyApproval(input.proof);
    if (
      claims.proposalId !== input.idempotencyKey ||
      claims.userId !== input.userId ||
      claims.itemId !== input.itemId ||
      claims.quantity !== input.quantity ||
      claims.lab !== input.lab
    )
      throw new Error('APPROVAL_MISMATCH: Approved details differ from this order.');
    const existing = db
      .prepare('SELECT payload FROM orders WHERE idempotency_key=?')
      .get(input.idempotencyKey) as { payload: string } | undefined;
    if (existing) {
      res.json({ ...JSON.parse(existing.payload), replayed: true });
      return;
    }
    const item = items().find((p) => p.id === input.itemId && p.approved);
    if (!item) throw new Error('SUPPLIER_NOT_APPROVED: Choose an approved item.');
    if (item.priceCents !== claims.unitPriceCents)
      throw new Error('PRICE_CHANGED: Request a new proposal and approval.');
    const order: Order = {
      id: `PO-${randomUUID().slice(0, 8).toUpperCase()}`,
      itemId: item.id,
      quantity: input.quantity,
      lab: input.lab,
      userId: input.userId,
      totalCents: item.priceCents * input.quantity,
      createdAt: Date.now(),
      idempotencyKey: input.idempotencyKey,
    };
    // A unique durable key makes a committed-but-unacknowledged write safe to replay.
    db.prepare('INSERT INTO orders VALUES(?,?,?)').run(
      order.id,
      input.idempotencyKey,
      JSON.stringify(order),
    );
    if (fault.mode === 'lost-response') {
      req.socket.destroy();
      return;
    }
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({
      code: 'WRITE_REJECTED',
      message: error instanceof Error ? error.message : 'Invalid order.',
      retryable: false,
    });
  }
});
const server = app.listen(config.MOCK_PORT, process.env.BIND_HOST ?? '127.0.0.1', () =>
  console.log(`Mock backend http://127.0.0.1:${config.MOCK_PORT}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );

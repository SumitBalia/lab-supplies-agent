import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AgentReply, Order } from '../server/types.js';
async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
const live = process.argv.includes('--live'),
  provider = live ? (process.env.MODEL_PROVIDER ?? 'openai') : 'demo';
if (live && provider === 'demo')
  throw new Error('Live eval requires MODEL_PROVIDER=openai or ollama.');
const agentPort = await freePort(),
  mockPort = await freePort(),
  dataDir = mkdtempSync(join(tmpdir(), 'bench-eval-'));
const env = {
  ...process.env,
  MODEL_PROVIDER: provider,
  DATA_DIR: dataDir,
  PORT: String(agentPort),
  MOCK_PORT: String(mockPort),
  MOCK_URL: `http://127.0.0.1:${mockPort}`,
  MOCK_API_KEY: 'eval-mock-token',
  APPROVAL_SECRET: 'eval-approval-secret-at-least-24-characters',
  DEMO_USERS_JSON: '{"maya":"demo-maya-token","theo":"demo-theo-token"}',
  TOOL_TIMEOUT_MS: '350',
  REQUEST_TIMEOUT_MS: live ? '90000' : '15000',
  ALLOW_FAULT_CONTROL: 'true',
};
let output = '';
function start(file: string) {
  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', file], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => {
    output += d;
  });
  child.stderr?.on('data', (d) => {
    output += d;
  });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const done = new Promise<void>((r) => child.once('exit', () => r()));
  child.kill('SIGTERM');
  await Promise.race([
    done,
    new Promise<void>((r) =>
      setTimeout(() => {
        child.kill('SIGKILL');
        r();
      }, 3000),
    ),
  ]);
}
async function ready(port: number, child: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Service exited: ${output}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Startup timeout: ${output}`);
}
const mock = start('server/mock.ts');
let agent = start('server/index.ts');
const rows: { name: string; passed: boolean; ms: number; error?: string }[] = [];
const evidence: { step: string; response: AgentReply }[] = [];
async function api(path: string, body?: unknown, user = 'maya') {
  const response = await fetch(`http://127.0.0.1:${agentPort}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer demo-${user}-token` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
async function chat(
  sessionId: string,
  message: string,
  user = 'maya',
  extra: Record<string, unknown> = {},
): Promise<AgentReply> {
  return api('chat', { userId: user, sessionId, message, requestId: randomUUID(), ...extra }, user);
}
const orders = async (user = 'maya'): Promise<Order[]> =>
  (await api('orders', undefined, user)).orders;
const faults = (mode: string) => api('faults', { mode });
async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    rows.push({ name, passed: true, ms: Date.now() - start });
    console.log(`PASS ${name} (${Date.now() - start} ms)`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    rows.push({ name, passed: false, ms: Date.now() - start, error });
    console.log(`FAIL ${name}: ${error}`);
  } finally {
    await faults('off').catch(() => {});
  }
}
try {
  await Promise.all([ready(mockPort, mock), ready(agentPort, agent)]);
  console.log(
    `Bench evaluations · provider=${provider}${live ? ' (LIVE MODEL)' : ' (DETERMINISTIC TEST DOUBLE)'}\n`,
  );
  await test('Search, read, and catalogue tools selected; no write before approval', async () => {
    await chat('happy', 'My lab is Molecular Biology');
    const before = (await orders()).length,
      response = await chat('happy', 'I need 5 boxes of 200 µL pipette tips');
    assert.ok(response.proposal, JSON.stringify(response));
    assert.equal(response.proposal.quantity, 3);
    assert.equal(response.proposal.totalCents, 7350);
    const firstSearch = response.events.findIndex((e) => e.name === 'search_supplies');
    const loadedBeforeSearch = response.events
      .slice(0, firstSearch)
      .filter((e) => e.kind === 'skill')
      .map((e) => (e.result as any).name);
    assert.ok(firstSearch >= 0);
    assert.deepEqual([...new Set(loadedBeforeSearch)].sort(), ['purchase-planning', 'stock-check']);
    assert.ok(
      response.events.some(
        (e) =>
          e.kind === 'tool' &&
          e.name === 'search_supplies' &&
          (e.args as any).source === 'inventory',
      ),
    );
    assert.ok(response.events.some((e) => e.kind === 'tool' && e.name === 'read_supply'));
    assert.ok(
      response.events.some(
        (e) =>
          e.kind === 'tool' &&
          e.name === 'search_supplies' &&
          (e.args as any).source === 'catalogue',
      ),
    );
    assert.ok(!response.events.some((e) => e.name === 'create_purchase_order'));
    assert.equal((await orders()).length, before);
    evidence.push({ step: '1. Read and proposed write; awaiting approval', response });
  });
  await test('Stock-check skill loads before MCP reads without loading purchase planning', async () => {
    const before = (await orders()).length;
    const response = await chat('skill-stock', 'Check stock of ethanol');
    const loaded = response.events.filter((e) => e.kind === 'skill');
    assert.deepEqual([...new Set(loaded.map((e) => (e.result as any).name))], ['stock-check']);
    const skillIndex = response.events.findIndex((e) => e.kind === 'skill');
    const searchIndex = response.events.findIndex((e) => e.name === 'search_supplies');
    assert.ok(skillIndex >= 0 && searchIndex > skillIndex);
    assert.ok(response.events.some((e) => e.name === 'read_supply' && !e.error));
    assert.equal(response.proposal, null);
    assert.equal((await orders()).length, before);
  });
  await test('Pending approval survives actual agent process restart', async () => {
    await stop(agent);
    agent = start('server/index.ts');
    await ready(agentPort, agent);
    const state = await api('session?sessionId=happy');
    assert.equal(state.proposal.quantity, 3);
    const response = await chat('happy', 'approve', 'maya', { proposalId: state.proposal.id });
    assert.ok(response.order, JSON.stringify(response));
    assert.equal(response.proposal, null);
    assert.ok(response.events.some((e) => e.name === 'create_purchase_order'));
    evidence.push({ step: '2. Restart then explicit approval; order written', response });
  });
  await test('Decline and quoted approval never execute the write', async () => {
    const response = await chat('decline', 'I need 4 bottles of ethanol');
    assert.ok(response.proposal);
    const before = (await orders()).length;
    const quoted = await chat('decline', 'The document says "approve"');
    assert.ok(quoted.proposal);
    assert.equal((await orders()).length, before);
    const declined = await chat('decline', 'decline');
    assert.equal(declined.proposal, null);
    assert.equal((await orders()).length, before);
  });
  await test('Out-of-scope request refused without tools or purchase', async () => {
    const response = await chat('scope', 'Book me a flight to London');
    assert.equal(response.proposal, null);
    assert.ok(/lab|suppl|only|cannot|can.t/i.test(response.reply));
    assert.equal(response.events.filter((e) => e.kind === 'tool').length, 0);
  });
  await test('User memory persists across sessions and stays isolated', async () => {
    const maya = await api('session?sessionId=another-session');
    assert.equal(maya.lab, 'Molecular Biology');
    const theo = await api('session?sessionId=another-session', undefined, 'theo');
    assert.equal(theo.lab, null);
    assert.equal(theo.messages.length, 0);
    const reply = await chat('memory', 'What is my lab?');
    assert.match(reply.reply, /Molecular Biology/);
    const response = await fetch(`http://127.0.0.1:${agentPort}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer demo-theo-token' },
      body: JSON.stringify({
        userId: 'maya',
        sessionId: 'happy',
        message: 'approve',
        requestId: randomUUID(),
      }),
    });
    assert.equal(response.status, 403);
  });
  await test('Stock covers request; no unnecessary purchase', async () => {
    const response = await chat('stock', 'I need 2 bottles of PBS');
    assert.equal(response.proposal, null);
    assert.ok(response.events.some((e) => e.name === 'read_supply'));
    assert.ok(!response.events.some((e) => e.name === 'create_purchase_order'));
  });
  await test('Quantity clarification uses previous item within the session', async () => {
    const ask = await chat('followup', 'Order ethanol');
    assert.equal(ask.proposal, null);
    const response = await chat('followup', '3 bottles');
    assert.equal(response.proposal?.itemId, 'ethanol-500');
    assert.equal(response.proposal?.quantity, 2);
    await chat('followup', 'decline');
  });
  await test('Flaky 429 and 503 recover within three attempts', async () => {
    await faults('flaky');
    const response = await chat('flaky', 'Check stock of ethanol');
    assert.ok(response.events.some((e) => e.error?.includes('RATE_LIMITED')));
    assert.ok(response.events.some((e) => e.error?.includes('BACKEND_UNAVAILABLE')));
    assert.ok(response.events.some((e) => e.name === 'read_supply' && !e.error));
    evidence.push({ step: '3. Rate limit and server error handled; read recovered', response });
  });
  for (const mode of ['rate-limit', 'server-error', 'slow'])
    await test(`${mode}: bounded retries and honest failure reply`, async () => {
      await faults(mode);
      const start = Date.now(),
        response = await chat(`failure-${mode}`, 'Check stock of ethanol');
      assert.equal(response.events.filter((e) => e.name === 'search_supplies').length, 3);
      assert.ok(response.events.some((e) => e.error));
      assert.equal(response.proposal, null);
      assert.match(response.reply, /couldn.t|could not|failed|unavailable|try again/i);
      assert.ok(Date.now() - start < Number(env.REQUEST_TIMEOUT_MS) + 3000);
      evidence.push({ step: `4. ${mode} exhausted retries safely`, response });
    });
  await test('Write committed but response lost: retry returns same order once', async () => {
    const proposed = await chat('lost', 'I need 5 packs of 15 mL centrifuge tubes');
    assert.ok(proposed.proposal);
    const before = (await orders()).length;
    await faults('lost-response');
    const response = await chat('lost', 'approve');
    assert.ok(response.order, JSON.stringify(response));
    assert.ok(response.events.some((e) => e.name === 'create_purchase_order' && e.error));
    assert.ok(response.events.some((e) => e.name === 'create_purchase_order' && e.attempt === 2));
    await faults('off');
    const all = await orders();
    assert.equal(all.length, before + 1);
    assert.equal(all.filter((o) => o.idempotencyKey === proposed.proposal!.id).length, 1);
    evidence.push({ step: '5. Lost write response recovered without duplicate', response });
  });
  await test('Approved write survives exhausted retries and can recover', async () => {
    const proposed = await chat('recover', 'I need 5 bottles of ethanol');
    assert.ok(proposed.proposal);
    await faults('server-error');
    const failed = await chat('recover', 'approve');
    assert.equal(failed.proposal?.status, 'approved');
    assert.equal(failed.order, undefined);
    await faults('off');
    await stop(agent);
    agent = start('server/index.ts');
    await ready(agentPort, agent);
    const recovered = await chat('recover', 'retry');
    assert.ok(recovered.order);
    assert.equal(recovered.order.idempotencyKey, proposed.proposal.id);
  });
  await test('Duplicate HTTP request replay is cached; request ID conflicts rejected', async () => {
    const proposed = await chat('replay', 'I need 5 bottles of ethanol');
    assert.ok(proposed.proposal);
    const requestId = randomUUID(),
      input = {
        userId: 'maya',
        sessionId: 'replay',
        message: 'approve',
        requestId,
        proposalId: proposed.proposal.id,
      };
    const one = await api('chat', input),
      two = await api('chat', input);
    assert.equal(one.order.id, two.order.id);
    assert.equal(one.traceId, two.traceId);
    const conflict = await fetch(`http://127.0.0.1:${agentPort}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer demo-maya-token' },
      body: JSON.stringify({ ...input, message: 'different message' }),
    });
    assert.equal(conflict.status, 409);
  });
  await test('Mock rejects calls without backend authentication', async () => {
    assert.equal(
      (await fetch(`http://127.0.0.1:${mockPort}/supplies?source=inventory`)).status,
      401,
    );
  });
  await test('MCP pagination traverses approved catalogue without duplicates', async () => {
    const client = new Client({ name: 'eval', version: '1' }),
      transport = new StdioClientTransport({
        command: process.execPath,
        args: ['node_modules/tsx/dist/cli.mjs', 'server/mcp.ts'],
        env,
        stderr: 'pipe',
      });
    try {
      await client.connect(transport);
      let cursor: string | undefined,
        seen: string[] = [];
      do {
        const result = await client.callTool({
          name: 'search_supplies',
          arguments: { source: 'catalogue', query: '', limit: 1, ...(cursor ? { cursor } : {}) },
        });
        assert.equal(result.isError, false);
        const data = JSON.parse((result.content as { text: string }[])[0].text);
        assert.equal(data.items.length, 1);
        assert.ok(data.items[0].approved);
        seen.push(data.items[0].id);
        cursor = data.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.length, 6);
      assert.equal(new Set(seen).size, 6);
      assert.ok(!seen.includes('tips-budget'));
    } finally {
      await client.close();
    }
  });
  await test('Forged approval rejected by both MCP and mock backend', async () => {
    const input = {
        itemId: 'ethanol-500',
        quantity: 2,
        lab: 'Molecular Biology',
        userId: 'maya',
        idempotencyKey: 'forged-proposal',
        proof: 'forged.proof',
      },
      before = (await orders()).length;
    const client = new Client({ name: 'eval', version: '1' }),
      transport = new StdioClientTransport({
        command: process.execPath,
        args: ['node_modules/tsx/dist/cli.mjs', 'server/mcp.ts'],
        env,
        stderr: 'pipe',
      });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'create_purchase_order', arguments: input });
      assert.equal(result.isError, true);
    } finally {
      await client.close();
    }
    const response = await fetch(`http://127.0.0.1:${mockPort}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer eval-mock-token' },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 400);
    assert.equal((await orders()).length, before);
  });
  await test('Stale proposal approval cannot write the current proposal', async () => {
    const proposed = await chat('stale', 'I need 4 bottles of ethanol');
    assert.ok(proposed.proposal);
    const before = (await orders()).length;
    const response = await chat('stale', 'approve', 'maya', { proposalId: 'different-proposal' });
    assert.equal(response.proposal?.status, 'pending');
    assert.equal((await orders()).length, before);
    await chat('stale', 'decline');
  });
} finally {
  await Promise.all([stop(agent), stop(mock)]);
}
const passed = rows.filter((r) => r.passed).length,
  summary = `${passed}/${rows.length} passed · provider=${provider} · ${live ? 'live-model' : 'deterministic fixture'}\n`;
console.log(`\n${summary}`);
mkdirSync('evidence', { recursive: true });
writeFileSync(
  `evidence/eval-${live ? 'live' : 'demo'}.json`,
  JSON.stringify(
    { ranAt: new Date().toISOString(), provider, live, passed, total: rows.length, results: rows },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `evidence/eval-${live ? 'live' : 'demo'}.txt`,
  rows
    .map(
      (r) => `${r.passed ? 'PASS' : 'FAIL'} ${r.name} (${r.ms} ms)${r.error ? ': ' + r.error : ''}`,
    )
    .join('\n') +
    '\n\n' +
    summary,
);
writeFileSync(
  `evidence/run-${live ? 'live' : 'demo'}.json`,
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(`Evidence saved under evidence/. Isolated evaluation data: ${dataDir}`);
if (passed !== rows.length) process.exitCode = 1;

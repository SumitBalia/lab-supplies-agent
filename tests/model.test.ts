import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../server/config.js';
import { complete } from '../server/model.js';
import { Trace } from '../server/trace.js';
const messages = [{ role: 'user' as const, content: 'Check ethanol' }];
const tools = [
  {
    name: 'search_supplies',
    description: 'Search supplies',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
];
test('OpenAI adapter preserves tool calls and actual reported tokens', async () => {
  const originalFetch = globalThis.fetch,
    old = { ...config };
  let sent: any;
  try {
    config.MODEL_PROVIDER = 'openai';
    config.OPENAI_API_KEY = 'test-only-key';
    config.DATA_DIR = mkdtempSync(join(tmpdir(), 'bench-model-test-'));
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'search_supplies', arguments: '{"query":"ethanol"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      });
    };
    const trace = new Trace('maya', 'test'),
      result = await complete(messages, tools, trace, Date.now() + 1000);
    assert.equal(result.tool_calls?.[0].function.name, 'search_supplies');
    assert.equal(sent.parallel_tool_calls, false);
    assert.equal(sent.tools[0].function.name, 'search_supplies');
    assert.deepEqual(trace.events[0].tokens, { input: 100, output: 20 });
    await complete(messages, [], trace, Date.now() + 1000);
    assert.equal(sent.tools, undefined);
    assert.equal(sent.parallel_tool_calls, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, old);
  }
});
test('Ollama adapter converts object tool arguments into shared contract', async () => {
  const originalFetch = globalThis.fetch,
    old = { ...config };
  let sent: any;
  try {
    config.MODEL_PROVIDER = 'ollama';
    config.DATA_DIR = mkdtempSync(join(tmpdir(), 'bench-model-test-'));
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({
        message: {
          content: '',
          tool_calls: [{ function: { name: 'search_supplies', arguments: { query: 'ethanol' } } }],
        },
        prompt_eval_count: 70,
        eval_count: 10,
      });
    };
    const trace = new Trace('maya', 'test'),
      result = await complete(messages, tools, trace, Date.now() + 1000);
    assert.equal(sent.stream, false);
    assert.deepEqual(JSON.parse(result.tool_calls![0].function.arguments), { query: 'ethanol' });
    assert.deepEqual(trace.events[0].tokens, { input: 70, output: 10 });
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, old);
  }
});
test('Provider errors are traced without reporting fabricated tokens', async () => {
  const originalFetch = globalThis.fetch,
    old = { ...config };
  try {
    config.MODEL_PROVIDER = 'openai';
    config.DATA_DIR = mkdtempSync(join(tmpdir(), 'bench-model-test-'));
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    const trace = new Trace('maya', 'test');
    await assert.rejects(complete(messages, tools, trace, Date.now() + 1000), /HTTP 503/);
    assert.equal(trace.events[0].tokens, null);
    assert.match(trace.events[0].error!, /503/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, old);
  }
});

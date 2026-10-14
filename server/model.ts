import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type { ChatMessage, ToolDefinition, ToolCall, Product } from './types.js';
import type { Trace } from './trace.js';
export interface Completion {
  content: string | null;
  tool_calls?: ToolCall[];
}
function call(name: string, args: unknown): Completion {
  return {
    content: null,
    tool_calls: [
      { id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ],
  };
}
/** Deterministic test double. Not a language model; all data still comes through MCP. */
function demo(messages: ChatMessage[]): Completion {
  const lastUser = messages.findLastIndex((m) => m.role === 'user');
  const text = messages[lastUser]?.content ?? '',
    lower = text.toLowerCase();
  const facts = JSON.parse(messages[0].content!.split('USER_FACTS_JSON:')[1] ?? '{}') as {
    lab?: string;
  };
  const calls = messages
    .slice(lastUser + 1)
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.tool_calls ?? []);
  const results = messages
    .slice(lastUser + 1)
    .filter((m) => m.role === 'tool')
    .map((m) => ({
      name: calls.find((c) => c.id === m.tool_call_id)?.function.name,
      data: JSON.parse(m.content ?? '{}'),
    }));
  if (results.some((r) => r.data.error))
    return {
      content:
        'I could not finish because the supplies service failed after bounded retries. No new purchase order was requested. Please try again.',
    };
  const known = ['pipette', 'tips', 'ethanol', 'pbs', 'gloves', 'tubes', 'centrifuge'];
  const shorthand =
    /those|them|same/i.test(text) ||
    /^\s*\d+\s*(boxes?|packs?|bottles?|units?)\s*[.!]?$/i.test(text);
  const previous = [...messages.slice(0, lastUser)]
    .reverse()
    .find(
      (m) => m.role === 'user' && known.some((k) => (m.content ?? '').toLowerCase().includes(k)),
    )
    ?.content?.toLowerCase();
  const keyword =
    known.find((k) => lower.includes(k)) ??
    (shorthand ? known.find((k) => previous?.includes(k)) : undefined);
  if (!keyword) {
    if (/^\s*(my lab is|remember (that )?my lab is)/i.test(text))
      return { content: `I’ll remember your lab as ${facts.lab}. What supplies do you need?` };
    if (/my lab|remember/i.test(lower))
      return {
        content: facts.lab
          ? `Your saved lab is ${facts.lab}.`
          : 'I don’t have a saved lab for you. Say “My lab is …” to save one.',
      };
    if (/stock|inventory|supplies|reagent|consumable/i.test(lower))
      return {
        content:
          'Which reagent or consumable should I check? Try pipette tips, ethanol, PBS, gloves, or tubes.',
      };
    return {
      content:
        'I can only help with lab supplies, stock checks, and purchase orders. Ask me about pipette tips, ethanol, PBS, gloves, or tubes.',
    };
  }
  const buying =
    /order|buy|need|purchase|replenish/i.test(text) ||
    (shorthand && /order|buy|need|purchase|replenish/i.test(previous ?? ''));
  // The fixture makes skill selection repeatable; live providers choose from the catalog.
  for (const name of buying ? ['stock-check', 'purchase-planning'] : ['stock-check']) {
    if (!results.some((r) => r.name === 'read_skill' && r.data.name === name))
      return call('read_skill', { name });
  }
  const quantityMatch =
    text.match(/\b(\d+)\s*(boxes?|packs?|bottles?|units?)\b/i) ??
    text.match(/\b(?:need|order|buy|purchase)\s+(\d+)\b/i);
  if (buying && !quantityMatch)
    return {
      content:
        'How many whole boxes, bottles, or packs do you need? I’ll check stock and propose buying the shortfall.',
    };
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0;
  if (quantity > 100 || (buying && quantity < 1))
    return { content: 'Please request between 1 and 100 whole packs.' };
  if (buying && !facts.lab)
    return {
      content:
        'Which lab should receive the order? Say “My lab is …”, then repeat your supply request.',
    };
  const inv = results.filter((r) => r.name === 'search_supplies' && r.data.source === 'inventory');
  const query = keyword === 'pipette' ? 'pipette tips' : keyword;
  if (!inv.length) return call('search_supplies', { source: 'inventory', query, limit: 3 });
  if (inv.at(-1)!.data.nextCursor)
    return call('search_supplies', {
      source: 'inventory',
      query,
      cursor: inv.at(-1)!.data.nextCursor,
      limit: 3,
    });
  const found = inv.flatMap((r) => r.data.items as Product[]);
  const requestedSize = lower.includes('1000') ? '1000' : lower.includes('200') ? '200' : null;
  const selected = found.find((p) => !requestedSize || p.id.includes(requestedSize));
  if (!selected)
    return {
      content:
        'I couldn’t find that supply from an approved supplier. Try a more specific item name.',
    };
  const read = results.find((r) => r.name === 'read_supply');
  if (!read) return call('read_supply', { itemId: selected.id });
  const item = read.data as Product;
  if (!buying || item.stock >= quantity)
    return {
      content: `${item.name} (${item.id}): ${item.stock} ${item.unit} in stock at ${item.location}.${buying ? ' Your request is covered by stock; no purchase order is needed.' : ''}`,
    };
  const cat = results.filter((r) => r.name === 'search_supplies' && r.data.source === 'catalogue');
  if (!cat.length) return call('search_supplies', { source: 'catalogue', query, limit: 3 });
  if (cat.at(-1)!.data.nextCursor)
    return call('search_supplies', {
      source: 'catalogue',
      query,
      cursor: cat.at(-1)!.data.nextCursor,
      limit: 3,
    });
  return call('propose_purchase_order', {
    itemId: item.id,
    quantity: quantity - item.stock,
    lab: facts.lab,
  });
}
export async function complete(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  trace: Trace,
  deadline: number,
): Promise<Completion> {
  const start = Date.now();
  try {
    let result: Completion;
    let tokens: { input: number; output: number } | null = null;
    if (config.MODEL_PROVIDER === 'demo') result = demo(messages);
    else {
      const openai = config.MODEL_PROVIDER === 'openai';
      const model = openai ? config.MODEL_NAME : config.OLLAMA_MODEL;
      const definitions = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
      const requestMessages = openai
        ? messages
        : messages.map((m) => ({
            ...m,
            content: m.content ?? '',
            ...(m.tool_calls
              ? {
                  tool_calls: m.tool_calls.map((c) => ({
                    ...c,
                    function: { ...c.function, arguments: JSON.parse(c.function.arguments) },
                  })),
                }
              : {}),
          }));
      const response = await fetch(
        openai ? 'https://api.openai.com/v1/chat/completions' : `${config.OLLAMA_URL}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(openai ? { authorization: `Bearer ${config.OPENAI_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: requestMessages,
            ...(definitions.length
              ? { tools: definitions, ...(openai ? { parallel_tool_calls: false } : {}) }
              : {}),
            ...(!openai ? { stream: false } : {}),
          }),
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        },
      );
      if (!response.ok)
        throw new Error(
          `Model provider returned HTTP ${response.status}. Check configuration and provider availability.`,
        );
      const data = await response.json();
      if (openai) {
        result = data.choices[0].message;
        tokens = data.usage
          ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
          : null;
      } else {
        result = {
          content: data.message.content,
          tool_calls: data.message.tool_calls?.map((c: any) => ({
            id: randomUUID(),
            type: 'function',
            function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments) },
          })),
        };
        tokens = { input: data.prompt_eval_count ?? 0, output: data.eval_count ?? 0 };
      }
    }
    trace.add({
      kind: 'model',
      name: config.MODEL_PROVIDER,
      args: {
        model:
          config.MODEL_PROVIDER === 'demo'
            ? 'deterministic-test-double'
            : config.MODEL_PROVIDER === 'openai'
              ? config.MODEL_NAME
              : config.OLLAMA_MODEL,
        messages,
        tools: tools.map((t) => t.name),
      },
      result,
      latencyMs: Date.now() - start,
      tokens,
    });
    return result;
  } catch (error) {
    trace.add({
      kind: 'model',
      name: config.MODEL_PROVIDER,
      error: error instanceof Error ? error.message : 'Model failed.',
      latencyMs: Date.now() - start,
      tokens: null,
    });
    throw error;
  }
}

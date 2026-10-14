import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './config.js';
import { verifyApproval } from './approval.js';

const server = new McpServer({ name: 'lab-supplies', version: '1.0.0' });
async function backend(path: string, init: RequestInit = {}) {
  try {
    const response = await fetch(`${config.MOCK_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${config.MOCK_API_KEY}`,
      },
      signal: AbortSignal.timeout(config.TOOL_TIMEOUT_MS),
    });
    const data = await response.json();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      isError: !response.ok,
    };
  } catch (error) {
    const timeout = error instanceof Error && /timeout|abort/i.test(error.name);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            code: timeout ? 'TIMEOUT' : 'CONNECTION_LOST',
            message: timeout
              ? 'Backend timed out; a write may already have committed. Retry with the SAME idempotency key.'
              : 'Connection lost. Retry reads, or writes with the SAME idempotency key.',
            retryable: true,
          }),
        },
      ],
      isError: true,
    };
  }
}
server.registerTool(
  'search_supplies',
  {
    description:
      'Search lab inventory or approved supplier catalogue. Use inventory first to check stock; catalogue finds purchasing options. Paginated: follow nextCursor until null. Quantities are whole packs in the returned unit.',
    inputSchema: {
      source: z.enum(['inventory', 'catalogue']),
      query: z.string().max(100),
      cursor: z.string().regex(/^\d+$/).optional(),
      limit: z.number().int().min(1).max(20).default(3),
    },
  },
  async ({ source, query, cursor, limit }) =>
    backend(
      `/supplies?${new URLSearchParams({ source, query, cursor: cursor ?? '0', limit: String(limit) })}`,
    ),
);
server.registerTool(
  'read_supply',
  {
    description:
      'Read one approved supply by its exact ID after search. Returns authoritative stock, pack unit, supplier, price in cents, and lead time.',
    inputSchema: { itemId: z.string().min(1).max(80) },
  },
  async ({ itemId }) => backend(`/supplies/${encodeURIComponent(itemId)}`),
);
server.registerTool(
  'create_purchase_order',
  {
    description:
      'Create exactly one purchase order AFTER explicit human approval. Requires a signed service-issued approval proof binding all details. Reuse proposal ID as idempotencyKey on every retry.',
    inputSchema: {
      itemId: z.string(),
      quantity: z.number().int().min(1).max(100),
      lab: z.string().min(1).max(80),
      userId: z.string(),
      idempotencyKey: z.string(),
      proof: z.string(),
    },
  },
  async (input) => {
    try {
      verifyApproval(input.proof);
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              code: 'APPROVAL_REQUIRED',
              message: error instanceof Error ? error.message : 'Approval required.',
              retryable: false,
            }),
          },
        ],
      };
    }
    return backend('/orders', { method: 'POST', body: JSON.stringify(input) });
  },
);
server.registerTool(
  'list_orders',
  {
    description:
      'List purchase orders for the authenticated user. User scope is injected by the service.',
    inputSchema: { userId: z.string() },
  },
  async ({ userId }) => backend(`/orders?userId=${encodeURIComponent(userId)}`),
);
server.registerTool(
  'configure_faults',
  {
    description: 'Local test administration only. Configure repeatable mock failures.',
    inputSchema: {
      mode: z.enum(['off', 'flaky', 'rate-limit', 'server-error', 'slow', 'lost-response']),
    },
  },
  async (input) => backend('/faults', { method: 'POST', body: JSON.stringify(input) }),
);
server.registerTool(
  'get_faults',
  {
    description: 'Read current local mock failure configuration. Test administration only.',
    inputSchema: {},
  },
  async () => backend('/faults'),
);
await server.connect(new StdioServerTransport());

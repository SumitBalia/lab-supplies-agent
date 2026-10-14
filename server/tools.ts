import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { config } from './config.js';
import type { Trace } from './trace.js';
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(`${code}: ${message}`);
  }
}
export class Tools {
  private client = new Client({ name: 'lab-agent', version: '1.0.0' });
  private transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
      join(process.cwd(), 'server/mcp.ts'),
    ],
    env: Object.fromEntries(
      Object.entries({ ...process.env, DATA_DIR: config.DATA_DIR }).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    stderr: 'pipe',
  });
  constructor(
    private trace: Trace,
    private deadline: number,
  ) {}
  async connect() {
    await this.client.connect(this.transport);
  }
  async definitions() {
    return (await this.client.listTools()).tools;
  }
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const safeArgs = { ...args };
    if ('proof' in safeArgs) safeArgs.proof = '[REDACTED]';
    for (let attempt = 1; attempt <= 3; attempt++) {
      const start = Date.now();
      if (start >= this.deadline)
        throw new ToolError('REQUEST_TIMEOUT', 'Request deadline reached.', false);
      try {
        const result = await this.client.callTool({ name, arguments: args }, undefined, {
          timeout: Math.min(config.TOOL_TIMEOUT_MS + 1000, this.deadline - start),
        });
        const content = result.content as { type: string; text?: string }[];
        const data = JSON.parse(
          content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join(''),
        );
        if (result.isError)
          throw new ToolError(
            data.code ?? 'TOOL_ERROR',
            data.message ?? 'Tool failed.',
            Boolean(data.retryable),
            Number(data.retryAfterMs ?? 0),
          );
        this.trace.add({
          kind: 'tool',
          name,
          args: safeArgs,
          result: data,
          latencyMs: Date.now() - start,
          attempt,
        });
        return data;
      } catch (error) {
        const e =
          error instanceof ToolError
            ? error
            : new ToolError(
                'MCP_ERROR',
                error instanceof Error ? error.message : 'MCP failed.',
                true,
              );
        this.trace.add({
          kind: 'tool',
          name,
          args: safeArgs,
          error: e.message,
          latencyMs: Date.now() - start,
          attempt,
        });
        if (!e.retryable || attempt === 3) throw e;
        const delay =
          Math.max(e.retryAfterMs, 100 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 40);
        if (Date.now() + delay >= this.deadline)
          throw new ToolError('REQUEST_TIMEOUT', 'Retry budget exhausted.', false);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Unreachable');
  }
  async close() {
    await this.client.close();
  }
}

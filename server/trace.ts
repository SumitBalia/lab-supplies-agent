import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type { TraceEvent } from './types.js';
export class Trace {
  readonly id = randomUUID();
  readonly events: TraceEvent[] = [];
  readonly started = Date.now();
  constructor(
    readonly userId: string,
    readonly sessionId: string,
  ) {}
  add(event: TraceEvent) {
    this.events.push(event);
    mkdirSync(config.DATA_DIR, { recursive: true });
    // Credentials and approval proofs must never appear in traces.
    const safe = JSON.stringify(
      {
        time: new Date().toISOString(),
        traceId: this.id,
        userId: this.userId,
        sessionId: this.sessionId,
        ...event,
      },
      (key, value) =>
        /token|secret|authorization|proof|apiKey/i.test(key) && key !== 'tokens'
          ? '[REDACTED]'
          : value,
    );
    appendFileSync(join(config.DATA_DIR, 'traces.jsonl'), safe + '\n');
  }
}

import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';
const env = z
  .object({
    MODEL_PROVIDER: z.enum(['demo', 'openai', 'ollama']).default('demo'),
    MODEL_NAME: z.string().default('gpt-4.1-mini'),
    OPENAI_API_KEY: z.string().default(''),
    OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
    OLLAMA_MODEL: z.string().default('qwen3:8b'),
    PORT: z.coerce.number().default(3001),
    MOCK_PORT: z.coerce.number().default(3002),
    DATA_DIR: z.string().default('./data'),
    MOCK_API_KEY: z.string().min(8).default('local-mock-key'),
    APPROVAL_SECRET: z.string().min(24).default('local-approval-secret-change-me'),
    DEMO_USERS_JSON: z.string().default('{"maya":"demo-maya-token","theo":"demo-theo-token"}'),
    TOOL_TIMEOUT_MS: z.coerce.number().positive().default(1200),
    REQUEST_TIMEOUT_MS: z.coerce.number().positive().default(20000),
    ALLOW_FAULT_CONTROL: z.enum(['true', 'false']).default('true'),
  })
  .parse(process.env);
export const config = {
  ...env,
  DATA_DIR: resolve(env.DATA_DIR),
  MOCK_URL: process.env.MOCK_URL ?? `http://127.0.0.1:${env.MOCK_PORT}`,
  users: z.record(z.string().min(8)).parse(JSON.parse(env.DEMO_USERS_JSON)),
};
if (config.MODEL_PROVIDER === 'openai' && !config.OPENAI_API_KEY)
  throw new Error(
    'OPENAI_API_KEY is required for MODEL_PROVIDER=openai. Use demo for key-free evals.',
  );

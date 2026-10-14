# Operations and configuration

This runbook covers the implemented local application. The [AgentCore document](../AGENTCORE.md) describes a proposed cloud adaptation, not a deployed environment.

Sources: [package scripts](../package.json), [launcher](../scripts/dev.ts), [configuration](../server/config.ts), [environment example](../.env.example), [Dockerfile](../Dockerfile), [Compose file](../compose.yaml).

## Local setup

Use Node.js 24 or later and npm. From the project root:

```sh
npm ci
cp -n .env.example .env
npm run dev
```

`cp -n` leaves an existing local configuration in place. Open [localhost:3000](http://localhost:3000).

| Process | Default endpoint        | Purpose                                           |
| ------- | ----------------------- | ------------------------------------------------- |
| Next.js | `http://127.0.0.1:3000` | UI and browser API proxy.                         |
| Agent   | `http://127.0.0.1:3001` | Authenticated Express API and LangGraph workflow. |
| Mock    | `http://127.0.0.1:3002` | Authenticated inventory/order backend.            |
| MCP     | Stdio child, no port    | Per-request tool server.                          |

The launcher starts mock, agent and Next as three child processes. Development uses Next's webpack mode. It does not wait for dependency readiness before starting siblings; allow startup to finish before sending requests.

SIGINT, SIGTERM or an unexpected child exit cause the launcher to send SIGTERM to its siblings and exit after about one second. The service handlers close their HTTP listeners; the mock also explicitly closes its database before exit. The agent has no explicit database-close call in its shutdown handler. Pending and approved proposal records remain in the data directory.

For the local production build:

```sh
npm run build
npm start
```

`npm start` still launches all three services; it uses `next start` for the web process. It is not a distributed service supervisor.

## Configuration reference

Environment variables are loaded at process start. Restart after changes. The table describes current defaults, not recommendations about model availability.

| Variable              | Default                                   | Behavior                                                                     |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `MODEL_PROVIDER`      | `demo`                                    | Enum: `demo`, `openai`, `ollama`.                                            |
| `MODEL_NAME`          | `gpt-4.1-mini`                            | OpenAI model setting.                                                        |
| `OPENAI_API_KEY`      | Empty                                     | Required at startup when OpenAI is selected. Server-side only.               |
| `OLLAMA_URL`          | `http://127.0.0.1:11434`                  | Ollama API base URL.                                                         |
| `OLLAMA_MODEL`        | `qwen3:8b`                                | Ollama model setting.                                                        |
| `PORT`                | `3001`                                    | Agent HTTP port.                                                             |
| `MOCK_PORT`           | `3002`                                    | Mock HTTP port.                                                              |
| `MOCK_URL`            | Loopback plus `MOCK_PORT`                 | Optional direct override used by MCP.                                        |
| `AGENT_SERVICE_URL`   | `http://127.0.0.1:3001`                   | Next.js proxy upstream; read by the route rather than the shared Zod config. |
| `BIND_HOST`           | `127.0.0.1`                               | Agent/mock and web launcher listening host.                                  |
| `DATA_DIR`            | `./data`                                  | Resolved to an absolute path for databases and traces.                       |
| `MOCK_API_KEY`        | Public local-demo value in `.env.example` | Minimum 8 characters; MCP-to-mock bearer key.                                |
| `APPROVAL_SECRET`     | Public local-demo value in `.env.example` | Minimum 24 characters; HMAC signing secret.                                  |
| `DEMO_USERS_JSON`     | Public Maya/Theo user-token map           | JSON object mapping IDs to token strings, each at least 8 characters.        |
| `TOOL_TIMEOUT_MS`     | `1200`                                    | Positive backend HTTP-attempt timeout.                                       |
| `REQUEST_TIMEOUT_MS`  | `20000`                                   | Positive request budget used by orchestration, model calls and retries.      |
| `ALLOW_FAULT_CONTROL` | `true`                                    | String `true` or `false`; controls fault mutation.                           |

The launcher fixes the web port at 3000. If you change agent `PORT`, also set `AGENT_SERVICE_URL`; the proxy does not derive its default from `PORT`. If the mock is elsewhere, set `MOCK_URL` consistently for MCP.

The proxy timeout remains 35 seconds even when the agent request budget is increased. MCP connect/discovery/close are not all explicitly capped by the request budget. These settings are budgets, not an end-to-end latency SLO.

The default demo credentials are public fixtures. The browser's two demo profiles use their matching tokens; custom configured tokens can be entered in the credentials field. Production identity and secret rotation require further work; see [security](security.md).

## Provider modes

`MODEL_PROVIDER=demo` gives a key-free deterministic demonstration. It is not an LLM.

For the implemented OpenAI adapter, set `MODEL_PROVIDER=openai`, `MODEL_NAME` and `OPENAI_API_KEY` in local environment configuration. For Ollama, run a compatible tool-capable model and configure `MODEL_PROVIDER=ollama`, `OLLAMA_URL` and `OLLAMA_MODEL`. The adapters' exact protocol handling is documented in [backend design](backend.md#model-adapters).

Actual model availability and live behavior have not been validated by the stored demo evaluations. Changing `.env` does not hot-swap a running service.

## Health and diagnostics

```sh
curl http://localhost:3000/api/health
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3002/health
```

These are liveness checks. They do not prove that a model request or order write can succeed. The mock health endpoint does not require its backend key.

For a failed operation, retain the `traceId` from the response or latest session trace. Under the default data directory:

```sh
rg 'REPLACE_WITH_TRACE_ID' data/traces.jsonl
```

Compare model latency with tool attempts, then follow approval events, proposal ID and any receipt. Before retrying an unconfirmed purchase, use the saved proposal's Retry action rather than creating another purchase request. Logs contain private data; see [security and privacy](security.md#traces-and-private-data).

## Troubleshooting

| Symptom                           | Check                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser says agent unavailable    | Launcher output, agent liveness, `AGENT_SERVICE_URL`, and the proxy timeout.                                                                                 |
| Agent exits on startup            | Missing OpenAI key, invalid environment values, malformed registered skill or unwritable data directory.                                                     |
| Requests return 401/403           | Selected demo identity, bearer field, `DEMO_USERS_JSON` and body user ID.                                                                                    |
| Tools report unauthorized         | MCP/mock use the same `MOCK_API_KEY` and expected `MOCK_URL`.                                                                                                |
| Reads repeatedly time out or fail | Current global fault mode, tool deadline and mock process.                                                                                                   |
| Proposal remains approved         | Inspect write errors and existing receipts. Retry keeps the original key; a permanent rejection such as a changed price may need developer reconciliation.   |
| Old seed data persists            | Startup inserts missing products but does not update existing rows. Back up and deliberately manage local data rather than assuming a seed edit migrates it. |
| `SESSION_BUSY` after a crash      | The request-budget-plus-ten-second lease must expire before replacement.                                                                                     |
| New skill edits have no effect    | Restart the agent; for demo decisions, update the programmed fixture as well.                                                                                |

## Container setup

```sh
docker compose up --build
```

The local Dockerfile uses Node 24 Bookworm slim, installs dependencies, builds Next.js, runs as the `node` user and starts the combined launcher. It retains development dependencies used by the TypeScript runtime; it is not a minimal multistage image.

Compose publishes only `127.0.0.1:3000:3000` and persists `/app/data` in the `bench-data` named volume. Inside the container the processes bind to `0.0.0.0`; agent and mock ports are not published by this Compose file.

Compose defaults Ollama to `http://host.docker.internal:11434`. Host resolution depends on the Docker environment, particularly on Linux; configure an accessible URL for your setup. Other provider and demo settings are forwarded by the Compose file, not every variable in the shared config table.

Previously recorded validation covered Compose configuration. Image build/start against a running Docker daemon remains unverified. This documentation update does not claim another container or browser run.

## Backups and local data

The data directory contains `agent.sqlite`, `mock.sqlite`, SQLite WAL/shared-memory sidecars when present, and `traces.jsonl`. The databases and trace file jointly describe workflow and receipts but do not form one transactionally consistent distributed snapshot.

For this local app, stop the services cleanly before copying the data directory. Preserve both databases and needed sidecars rather than copying one live `.sqlite` file in isolation. Preserve the configured approval secret securely as well; it is separate from database contents. If a backup must happen while services run, use a SQLite-aware backup procedure and account for the two independent stores.

Docker data lives in the named volume, outside the container image. Rebuilding the image does not update existing seeded rows or remove stored approvals. There is no automated backup, restore test, migration runner, deletion API or trace rotation job.

See [database retention](database-design.md#retention) for lazy cleanup and [testing](testing.md) for reproducible verification commands.

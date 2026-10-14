# HTTP API

The browser calls Next.js at `http://localhost:3000/api`. Next.js proxies to the Express agent at `http://127.0.0.1:3001` by default. The same routes are available directly on the agent without the `/api` prefix.

Sources: [proxy route](../app/api/[...path]/route.ts), [Express handlers](../server/index.ts), [chat schema and workflow](../server/agent.ts), [record types](../server/types.ts).

## Authentication and transport

All endpoints except health require `Authorization: Bearer <token>`. Tokens map to user IDs through `DEMO_USERS_JSON`. The public demo token for `maya` is `demo-maya-token`; it is a local demonstration credential.

The chat body's `userId` must match the bearer identity. Session and order endpoints derive their user scope from that identity. A session ID alone does not grant access to another user's conversation.

Use JSON request bodies. Express accepts up to 16 KB. Chat strings are validated as described below; malformed JSON and oversized bodies use Express middleware defaults, which may not match the application's JSON error shape.

## Endpoints

| Method and browser path        | Agent path | Result                                                |
| ------------------------------ | ---------- | ----------------------------------------------------- |
| `GET /api/health`              | `/health`  | Process liveness and configured provider.             |
| `POST /api/chat`               | `/chat`    | A reply, proposal or approval/recovery result.        |
| `GET /api/session?sessionId=…` | `/session` | Current user-scoped conversation and active proposal. |
| `GET /api/orders`              | `/orders`  | Current user's order receipts through MCP.            |
| `GET /api/faults`              | `/faults`  | Global local-test failure mode and operation count.   |
| `POST /api/faults`             | `/faults`  | Set that failure mode, if enabled.                    |

The proxy permits only those five single-segment resource names and exports GET/POST. It does not separately validate every method/resource combination. An unsupported combination on an allowed path reaches the upstream route handling.

### Health

```json
{ "status": "ok", "provider": "demo" }
```

HTTP 200 indicates that the agent process answers. It does not check model credentials, mock readiness or database health.

### Chat request

| Field        | Required | Validation                                                                                                         |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `userId`     | Yes      | String, 1–80 characters; must match bearer identity.                                                               |
| `sessionId`  | Yes      | String, 1–100 characters.                                                                                          |
| `message`    | Yes      | Trimmed string, 1–4,000 characters.                                                                                |
| `requestId`  | No       | String, 1–100 characters; generated UUID when omitted.                                                             |
| `proposalId` | No       | String; a non-empty supplied value must match the active proposal for a decision. No explicit schema length bound. |

Unknown body keys are rejected. The `sessionId`, `userId` and request ID are not trimmed by the schema.

```json
{
  "userId": "maya",
  "sessionId": "example-session",
  "message": "I need 5 boxes of 200 µL pipette tips",
  "requestId": "example-request-2"
}
```

### Chat response

Every handled chat outcome returns:

```ts
interface AgentReply {
  reply: string;
  proposal: Proposal | null;
  order?: Order;
  traceId: string;
  events: TraceEvent[];
}
```

A pending proposal means approval is still required. A confirmed write returns `order` and clears the active `proposal` in the reply. An unconfirmed write returns a failure explanation with the saved `approved` proposal; the order may already exist.

Tool exhaustion, provider failures and unconfirmed writes are generally caught and returned as **HTTP 200 with an explanatory `AgentReply`**. Clients must inspect the reply, proposal, receipt and trace rather than treating every 200 as a successful purchase.

### Session response

```ts
{
  messages: ChatMessage[];
  lab: string | null;
  proposal: Proposal | null;
  provider: 'demo' | 'openai' | 'ollama';
  events: TraceEvent[];
  traceId: string;
}
```

`sessionId` is required and limited to 100 characters. A new session returns an empty message list, no active proposal and any still-valid lab memory for that user. Events and trace ID come from the latest cached response, defaulting to `[]` and `""`.

This read does not expire pending proposals or perform retention cleanup.

### Orders and faults

Orders return `{ "orders": [] }` or a list of the authenticated user's `Order` records. There is no pagination on this endpoint.

Faults return `{ "mode": "off", "count": 0 }`. Set a mode with:

```json
{ "mode": "flaky" }
```

Allowed modes are `off`, `flaky`, `rate-limit`, `server-error`, `slow` and `lost-response`. Setting one resets `count` to zero. Fault state is shared by all users of the mock and resets on process restart. Any authenticated demo user can administer it when enabled; there is no separate administrator role. See [failure behavior](mcp-tools.md#failure-injection).

## Approval and replay rules

Approval is a **new chat request** in the same user/session. Send the reviewed proposal ID and an exact supported message. The service lowercases and trims the decision and removes one trailing `.` or `!` before matching:

- Approve: `approve`, `yes`, `approved`, `confirm`.
- Decline a pending proposal: `decline`, `no`, `reject`, `cancel`.
- Recover an approved unconfirmed write: `retry`.

Quoted text and phrases such as `please approve it` are not exact decisions. `retry` does not approve a pending proposal. An approved uncertain purchase cannot be declined. A stale non-empty `proposalId` prevents the decision. Omitting it or sending an empty string supplies no reviewed-proposal binding. Clients should always send the non-empty reviewed ID even though the API makes it optional.

For HTTP transport replay, resend the **same** `requestId`, normalized message and proposal ID. Within the retained cache, this returns the original reply and trace. Reusing that ID for changed input returns 409. A later business recovery instead uses a new request ID and `message: "retry"`; the service reuses the original proposal ID as the order key.

## Example flow

Save a lab:

```sh
curl http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo-maya-token' \
  -d '{"userId":"maya","sessionId":"example-session","message":"My lab is Molecular Biology","requestId":"example-request-1"}'
```

Request supplies:

```sh
curl http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo-maya-token' \
  -d '{"userId":"maya","sessionId":"example-session","message":"I need 5 boxes of 200 µL pipette tips","requestId":"example-request-2"}'
```

With the seeded item, two boxes are in stock and the proposal purchases three boxes for 7,350 cents. Copy its returned `proposal.id` into this later request:

```sh
curl http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo-maya-token' \
  -d '{"userId":"maya","sessionId":"example-session","message":"approve","proposalId":"REPLACE_WITH_RETURNED_ID","requestId":"example-request-3"}'
```

Read receipts:

```sh
curl http://localhost:3000/api/orders \
  -H 'Authorization: Bearer demo-maya-token'
```

## Status codes and errors

| Status | Conditions                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| 200    | Health/read success, fault configuration success, or a handled chat outcome including operational failure. |
| 400    | Invalid chat schema or session ID; invalid fault configuration or failure of its MCP/backend operation.    |
| 401    | Missing or invalid bearer token.                                                                           |
| 403    | Chat user differs from bearer identity, or fault mutation is disabled.                                     |
| 404    | Proxy path outside its allowlist; upstream unknown routes can use Express defaults.                        |
| 409    | `SESSION_BUSY` or `REQUEST_ID_CONFLICT`.                                                                   |
| 500    | Uncaught chat-handler exception, such as a final persistence failure.                                      |
| 503    | Proxy connection/timeout failure, or orders/fault-read dependency failure.                                 |

Application errors normally use `{ "error": "..." }`; invalid chat input also includes Zod `details`. MCP error codes are a different internal contract described in [MCP tools](mcp-tools.md#error-contract).

The Next.js proxy uses a fixed 35-second fetch timeout and forwards upstream status/body with JSON content type. A proxy 503 can occur while the agent still has work in progress; transport failure is not proof that a write did not commit.

## Shared records

The authoritative interfaces are in [server/types.ts](../server/types.ts). Fields below are exhaustive for the declared domain records; the mock may additionally return `replayed: true` when an existing receipt is recovered.

| Record        | Fields                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Product`     | `id`, `name`, `unit`, `stock`, `location`, `supplier`, `approved`, `priceCents`, `currency: 'USD'`, `leadDays`, `keywords`.                                                       |
| `Proposal`    | `id`, `userId`, `sessionId`, `itemId`, `itemName`, `supplier`, `quantity`, `unit`, `unitPriceCents`, `totalCents`, `lab`, `status`, `createdAt`, `expiresAt`, optional `orderId`. |
| `Order`       | `id`, `itemId`, `quantity`, `lab`, `userId`, `totalCents`, `createdAt`, `idempotencyKey`.                                                                                         |
| `ChatMessage` | `role`, `content`, optional `tool_calls`, optional `tool_call_id`. Stored session history currently contains user/assistant messages only.                                        |
| `TraceEvent`  | `kind`, `name`, `latencyMs`, optional `args`, `result`, `error`, `attempt`, `tokens`.                                                                                             |

Proposal statuses are `pending`, `approved`, `completed`, `declined`. Quantities are whole packs, prices are integer USD cents and timestamps are Unix milliseconds. Trace kinds are `model`, `tool`, `approval`, `request`, `memory`, `skill`. Token counts, when present, are `{input, output}`; unknown counts can be `null`.

Domain identifiers, names, supplier, location, unit and lab fields are strings. `Product.approved` is boolean, `keywords` is a string array, and stock/lead time, quantities, prices and timestamps are numbers. Trace names/errors are strings and `latencyMs`/`attempt` are numbers; `args` and `result` can contain arbitrary JSON values. A message's `content` is a string or null and its role is `system`, `user`, `assistant` or `tool`.

There is no versioned OpenAPI specification, generated client, streaming response or cancellation endpoint in the current application.

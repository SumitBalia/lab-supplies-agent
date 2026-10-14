# MCP tool contracts

All application access to mock inventory, catalogue, ordering and fault administration passes through the custom MCP server. The server uses JSON-RPC over stdio and authenticates its HTTP calls to the mock. It has no network listener.

Sources: [tool registrations](../server/mcp.ts), [client and retry broker](../server/tools.ts), [mock HTTP implementation](../server/mock.ts), [model allowlist](../server/agent.ts).

## Visibility and transport

| Tool                     | Registered in MCP | Model-visible | Caller                                    |
| ------------------------ | ----------------- | ------------- | ----------------------------------------- |
| `search_supplies`        | Yes               | Yes           | LangGraph tool node.                      |
| `read_supply`            | Yes               | Yes           | LangGraph tool node.                      |
| `create_purchase_order`  | Yes               | No            | Service approval/recovery handler.        |
| `list_orders`            | Yes               | No            | Authenticated orders HTTP handler.        |
| `configure_faults`       | Yes               | No            | Local fault-administration HTTP handler.  |
| `get_faults`             | Yes               | No            | Local fault-status HTTP handler.          |
| `read_skill`             | No                | Yes           | Local application-skill handler.          |
| `propose_purchase_order` | No                | Yes           | Local proposal validator and persistence. |

The broker starts `server/mcp.ts` using the current Node executable and the installed `tsx` CLI. It connects, discovers schemas as needed, calls tools and closes the client after the request. Cached chat replies bypass this work. The MCP process inherits the local service environment, including backend configuration.

## Search

`search_supplies` arguments:

| Argument | Schema                                                              |
| -------- | ------------------------------------------------------------------- |
| `source` | Required: `inventory` or `catalogue`.                               |
| `query`  | Required string, maximum 100 characters; an empty query is allowed. |
| `cursor` | Optional string containing digits only; initial offset is `"0"`.    |
| `limit`  | Integer 1–20, default 3.                                            |

Result:

```ts
{
  source: 'inventory' | 'catalogue';
  items: Product[];
  total: number;
  nextCursor: string | null;
}
```

Follow `nextCursor` with the same source and query until it is null. The mock normalizes query text and requires every resulting term to match the item's name, keywords or ID. Both sources currently use the same seeded, approved product set; they are distinct workflow views rather than separate supplier/inventory systems.

## Read

`read_supply` takes `{itemId: string}`, length 1–80. It returns an approved `Product`, or a non-retryable `NOT_FOUND` error.

A product contains `id`, `name`, `unit`, `stock`, `location`, `supplier`, `approved`, `priceCents`, `currency`, `leadDays` and `keywords`. Use this authoritative read to distinguish packs from their contained quantity. See the [shared API records](api.md#shared-records).

## Privileged purchase write

`create_purchase_order` takes:

| Argument         | Schema and meaning                                     |
| ---------------- | ------------------------------------------------------ |
| `itemId`         | String identifying the approved item.                  |
| `quantity`       | Integer 1–100 whole packs.                             |
| `lab`            | String, 1–80 characters.                               |
| `userId`         | String supplied by the authenticated service workflow. |
| `idempotencyKey` | String; the immutable proposal ID.                     |
| `proof`          | Service-issued signed approval proof.                  |

MCP verifies the proof's signature and expiry before forwarding the request. The mock verifies it again and compares its proposal ID, user, item, quantity and lab to the order arguments. The signed session remains part of the proof but is not a separate mock order argument. For a new receipt, the mock also checks approved-product eligibility and the signed unit price against the current price.

The mock first looks for an existing receipt under the same key after validating bound arguments. If found, it returns that receipt with `replayed: true`. Otherwise it inserts a new order receipt using a unique key. A direct mock write returns 201 for a new order and 200 for a replay; MCP wraps the resulting JSON, and the agent chat returns its own HTTP 200 reply contract.

The model never receives this tool definition. Approval proofs are created only by the service after a later explicit decision. See [backend workflow](backend.md#approval-and-recovery) and [security](security.md#purchase-authorization).

## Service-only reads and administration

- `list_orders`: `{userId: string}` → `{orders: Order[]}`. The public orders handler injects bearer-derived user scope. The mock returns matching receipts newest first, without pagination.
- `get_faults`: `{}` → `{mode, count}`.
- `configure_faults`: `{mode}` → `{mode, count: 0}`. Allowed modes are listed below. Mutations require `ALLOW_FAULT_CONTROL=true` at both service and mock boundaries.

These are trusted local service tools. A process with access to MCP and backend credentials is inside the local trust boundary; tool schemas alone are not end-user authorization.

## Error contract

Tool results contain text blocks carrying JSON:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "{\"code\":\"RATE_LIMITED\",\"message\":\"Supplier is busy. Retry shortly.\",\"retryable\":true,\"retryAfterMs\":100}"
    }
  ]
}
```

Successful backend JSON is wrapped in the same text-content form with `isError: false`. The broker parses it and converts an error result to `ToolError(code, message, retryable, retryAfterMs)`.

| Code                  | Typical origin                                                                                                     | Retryable                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `RATE_LIMITED`        | Mock HTTP 429, with `retryAfterMs: 100`.                                                                           | Yes                          |
| `BACKEND_UNAVAILABLE` | Mock HTTP 503.                                                                                                     | Yes                          |
| `TIMEOUT`             | MCP's backend HTTP timeout.                                                                                        | Yes                          |
| `CONNECTION_LOST`     | MCP's backend connection failure, including lost write response.                                                   | Yes                          |
| `MCP_ERROR`           | Client/transport exception normalized by broker.                                                                   | Yes, within remaining budget |
| `UNAUTHORIZED`        | Mock backend key missing or incorrect.                                                                             | No                           |
| `NOT_FOUND`           | Approved item read has no match.                                                                                   | No                           |
| `INVALID_INPUT`       | Invalid mock parameters or fault mode.                                                                             | No                           |
| `DISABLED`            | Fault mutation disabled at mock.                                                                                   | No                           |
| `APPROVAL_REQUIRED`   | MCP cannot verify the supplied proof; message includes the detailed reason.                                        | No                           |
| `WRITE_REJECTED`      | Mock write validation failed; message can include `APPROVAL_MISMATCH`, `SUPPLIER_NOT_APPROVED` or `PRICE_CHANGED`. | No                           |

SDK schema validation can reject a malformed tool call before the backend runs. A broker deadline can also raise non-retryable `REQUEST_TIMEOUT` locally. Local proposal-policy and skill errors are graph/application errors, not mock HTTP errors.

The broker makes at most three attempts for transient errors. Delay is `max(retryAfterMs, 100 * 2^(attempt-1)) + 0..39 ms`, if it fits within the deadline. SDK call timeout is the lesser of remaining budget and `TOOL_TIMEOUT_MS + 1000`. MCP's backend HTTP attempt uses `TOOL_TIMEOUT_MS`, default 1,200 ms. The default request budget is 20,000 ms. Connection, discovery and close are not all explicitly capped by that budget.

## Failure injection

| Mode            | Mock behavior                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `off`           | Normal behavior.                                                                                                 |
| `flaky`         | Global operation cycle: 429, then 503, then success.                                                             |
| `rate-limit`    | Persistent HTTP 429.                                                                                             |
| `server-error`  | Persistent HTTP 503.                                                                                             |
| `slow`          | Delay twice the configured backend timeout.                                                                      |
| `lost-response` | Insert a new order, then destroy the socket before returning its receipt. A replay returns the existing receipt. |

Fault state is global, in memory and reset on mock restart. Health and fault-administration endpoints bypass the injected-failure middleware. Inventory and order reads also participate in its operation count. Lost-response mode does not deliberately fail ordinary reads.

## Mock HTTP mapping

These are internal backend routes, not additional browser API endpoints:

| MCP tool                | Mock route                                        |
| ----------------------- | ------------------------------------------------- |
| `search_supplies`       | `GET /supplies?source=…&query=…&cursor=…&limit=…` |
| `read_supply`           | `GET /supplies/:id`                               |
| `create_purchase_order` | `POST /orders`                                    |
| `list_orders`           | `GET /orders?userId=…`                            |
| `configure_faults`      | `POST /faults`                                    |
| `get_faults`            | `GET /faults`                                     |

MCP supplies `Authorization: Bearer <MOCK_API_KEY>` on each backend request. Mock `GET /health` is unauthenticated and is used for local liveness/evaluation setup. Application modules do not call the inventory/order mock directly; the evaluation suite can do so to test the boundary.

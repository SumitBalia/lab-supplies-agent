# Security and privacy

Bench is a local demonstration with public demo credentials and a mock ordering service. This guide describes its implemented boundaries and known limits. It is not a production security certification.

Sources: [agent authentication](../server/index.ts), [configuration](../server/config.ts), [approval proof](../server/approval.ts), [MCP](../server/mcp.ts), [mock validation](../server/mock.ts), [trace serialization](../server/trace.ts).

## Identity and user isolation

The agent maps bearer tokens to user IDs through `DEMO_USERS_JSON` and uses constant-time token comparison. Chat input must name that same user. Session, lab and proposal lookups use user scope, and the orders handler injects the bearer-derived user ID into its MCP call.

Health is intentionally unauthenticated and reports process liveness. The application has no production login, role system, account management, ingress rate limiter or managed identity provider. The browser exposes two fixed demo profiles and an editable bearer field.

Local processes bind to loopback by default. Compose binds processes inside its container and publishes only the Next.js port on host loopback. This is not an application TLS implementation; widening network access requires revisiting identity, transport and operational controls.

## Purchase authorization

The model can search/read supplies, read local skills and propose a purchase. It never receives `create_purchase_order`. A later exact human decision is interpreted by service code, with proposal owner/session scope, pending expiry and optional reviewed-proposal ID checked there.

Before proposing, the service requires exact-item search/read evidence from the current request, approved eligibility, a saved matching lab, whole-pack limits, the price ceiling and the explicit requested-quantity shortfall. These checks remain effective even if model guidance is ignored.

After approval is persisted, the service creates a short-lived proof:

| Claim                       | Purpose                                                   |
| --------------------------- | --------------------------------------------------------- |
| `proposalId`                | Original purchase identity and receipt deduplication key. |
| `userId`, `sessionId`       | Approval ownership context.                               |
| `itemId`, `quantity`, `lab` | Exact approved purchase details.                          |
| `unitPriceCents`            | Approved price for a new write.                           |
| `expiresAt`                 | Ten-minute proof lifetime.                                |

The proof is base64url-encoded JSON plus an HMAC-SHA256 signature. It is signed, not encrypted, and is internal to the service/MCP/mock interaction.

MCP verifies signature and expiry. The mock verifies them again, compares proposal ID/user/item/quantity/lab with order arguments, then returns an existing receipt or validates current eligibility/price before a new insert. Session binding is carried in the signed claims; the mock has no separate order-session argument to compare.

The same proposal key is used for retries. This prevents duplicate mock receipts under that key; it does not make independent systems transactional or authorize an unrelated purchase. Approved uncertain writes remain recoverable rather than being automatically declined.

## Tool and skill trust

MCP authenticates to the mock using `MOCK_API_KEY`. The backend key is a trusted workload credential, not a substitute for user approval. A local process with these credentials is inside the demonstration's service trust boundary.

Application skill names are allowlisted. `read_skill` cannot turn model arguments into arbitrary filesystem paths, run scripts or grant tools. Registered Markdown is trusted repository-maintained instruction content; supply data and user facts are treated as data in the system policy.

Prompt instructions request relevant skill loading and safe handling of product text, but skill loading is not code-enforced and malicious catalogue-text behavior has not been validated with a live model. Authorization must continue to be enforced in code.

## Credentials and fault administration

Default user tokens, backend key and approval secret are public local-demo values. Provider keys stay on the server, and `.env` is excluded from the container build context. There is no implemented secret rotation workflow, secret manager or production credential provisioning.

Any authenticated demo user can change global fault mode when `ALLOW_FAULT_CONTROL=true`. Set it to `false` to disable mutations at the service and mock boundaries. Status reads remain available. Failure controls simulate supplier problems; they are not production traffic protection.

## Traces and private data

Each request collects events in memory and appends JSONL records with time, trace/user/session IDs and event details. Model traces include user messages, saved lab context, tool conversation and potentially loaded skill instructions. Tool results and response-cache snapshots can also contain private application data.

The JSONL serializer redacts object keys matching `token`, `secret`, `authorization`, `proof` or `apiKey`, except the usage field `tokens`. It does not scrub arbitrary secrets embedded in text strings. It also does not mutate the in-memory event list later returned to the UI. The tool broker separately masks approval proof arguments before creating its tool events.

Therefore the current mechanism is targeted field redaction, not a general sensitive-data scrubber. Avoid placing credentials in chat or product text. Treat SQLite files, WAL sidecars, logs, cache snapshots, screenshots and evaluation artifacts as private data where their contents require it.

There is no application-managed at-rest encryption, JSONL rotation, deletion API or central log access policy. [Database retention](database-design.md#retention) documents the implemented lazy cleanup; [operations](operations.md#backups-and-local-data) covers local backup handling.

## Known limits and verification

Tests cover user mismatch, memory isolation, unsigned/tampered/expired proofs, forged writes, stale proposal IDs and lost-response deduplication. They do not establish production security, distributed fencing or live-model resistance to prompt injection.

Before a wider deployment, resolve production authentication and purchasing roles, secret lifecycle, trusted identity propagation, shared-state concurrency, audit retention/deletion, monitoring and a real supplier's idempotency contract. Those are proposed migration concerns in [AGENTCORE.md](../AGENTCORE.md), not current implemented controls.

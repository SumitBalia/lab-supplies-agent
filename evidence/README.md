# Demonstration evidence

Latest recorded results: **19/19 deterministic integration cases passed**, plus **7/7 approval, model-adapter and skill tests**. Type checking, formatting and the production build passed during implementation. See the [testing guide](../docs/testing.md) for execution scope, timestamps and remaining gaps. No live-model result is claimed.

Captured local browser flow (before application skills were added):

1. [Stock search and read](01-stock.jpg)
2. [Proposed purchase awaiting approval](02-proposal.jpg)
3. [Explicit approval and purchase receipt](03-approved-order.jpg)
4. [Transient failures recovered](04-failure-recovered.jpg)
5. [Timeout retries exhausted and reported](05-timeout-handled.jpg)

`npm run eval` writes `eval-demo.txt`, `eval-demo.json`, and `run-demo.json` from the executed deterministic-provider suite. The run JSON includes reads, proposals, explicit approvals after restart, transient failure recovery, timeout exhaustion, and lost write-response recovery.

`npm run eval -- --live` writes separate live-model evidence only when an actual provider is configured. Deterministic-provider evidence must not be described as live LLM performance.

Browser screenshots, when captured, appear here and document the actual local interface. To reproduce the demonstration, follow the walkthrough in the root README. The JSON evidence provides full tool arguments/results where a screenshot cannot fit them.

# Testing and evidence

Bench distinguishes infrastructure correctness from language-model behavior. Its default evaluations run a deterministic fixture against real local agent, MCP and mock processes. They do not establish the quality of a live model.

Sources: [evaluation runner](../scripts/eval.ts), [unit tests](../tests), [CI workflow](../.github/workflows/ci.yml), [stored evaluation JSON](../evidence/eval-demo.json), [text results](../evidence/eval-demo.txt).

## Recorded verification

| Check                                                  | Last recorded result and scope                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic integration suite                        | 19/19 passed. Stored run time: October 14, 2026, 19:39:57 IST. Artifact provider is `demo`, `live: false`.                      |
| Unit/protocol suite                                    | 7/7 passed in the preceding implementation work: two approval, three provider-adapter and two skill tests.                      |
| Type checking, formatting and Next.js production build | Passed in the preceding implementation work.                                                                                    |
| Browser demonstration                                  | Earlier screenshots cover reads, proposals, approval, transient recovery and timeout handling. They predate application skills. |
| Live OpenAI/Ollama evaluations                         | Not run; no live-model result is claimed.                                                                                       |
| Container runtime                                      | Compose configuration was validated; Docker image/runtime verification is pending.                                              |

This documentation update validates Markdown formatting and internal links; it does not rerun the application suites or replace their recorded results with a fresh execution claim. The evaluation JSON carries the exact source timestamp as `2026-10-14T14:09:57.328Z`.

## Commands

From the project root after installing dependencies:

```sh
npm run typecheck
npm run format:check
npm test
npm run eval
npm run build
```

For an actual provider, configure credentials/model access first, then explicitly select it:

```sh
MODEL_PROVIDER=openai npm run eval -- --live
# Or, with a running compatible local model:
MODEL_PROVIDER=ollama npm run eval -- --live
```

An existing `.env` containing `MODEL_PROVIDER=demo` must not be mistaken for a live configuration. `--live` rejects demo. Provider/model defaults are configuration examples, not evidence that those models are available locally or on an account.

## Unit and protocol tests

| File                                          | Coverage                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [approval.test.ts](../tests/approval.test.ts) | Exact signed purchase claims, tampering rejection, expired proof and unsigned input.                                |
| [model.test.ts](../tests/model.test.ts)       | Stubbed OpenAI/Ollama request/response conversion, tool-call preservation, usage counts and provider-error tracing. |
| [skills.test.ts](../tests/skills.test.ts)     | Catalog metadata versus loaded body; unknown names, path traversal attempts and extra arguments rejected.           |

Provider tests replace `fetch`; they are protocol tests rather than live-provider tests. Skill tests do not prove that a language model follows the Markdown instructions.

## Integration evaluations

`npm run eval` starts isolated mock and agent processes on free loopback ports with a temporary data directory. The runner forces demo mode, uses 350 ms backend-attempt timeouts and a 15-second request budget. Live mode uses a 90-second agent budget. It calls the agent directly, so it does not test the Next.js 35-second proxy timeout.

Assertions inspect traces, active proposals and stored order counts, not only response wording. The suite performs real agent process restarts. It stops its child services, retains the temporary data directory for inspection and reports its path. Each case resets fault mode afterward when possible.

| Case                                              | Main invariant                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Purchase tool selection and pre-approval boundary | Both relevant skills load before inventory search; inventory/catalogue/read evidence produces the expected shortfall, with no order write. |
| Stock-check skill routing                         | Stock-check loads before reads without purchase-planning; stock reads create no proposal or order.                                         |
| Pending proposal after process restart            | A saved proposal can be approved after an actual restart.                                                                                  |
| Decline and quoted approval                       | Neither executes the write.                                                                                                                |
| Out-of-scope request                              | Refused without tool activity or purchase.                                                                                                 |
| User memory isolation                             | Lab survives another session, remains isolated and a forged body user is rejected.                                                         |
| Stock-covered request                             | No unnecessary purchase.                                                                                                                   |
| Quantity follow-up                                | Current quantity resolves the earlier item.                                                                                                |
| Flaky backend                                     | 429 and 503 recover within the attempt limit.                                                                                              |
| Persistent rate limit                             | Bounded attempts and an honest failure reply.                                                                                              |
| Persistent server error                           | Bounded attempts and an honest failure reply.                                                                                              |
| Slow backend                                      | Timeout exhaustion within the evaluation budget.                                                                                           |
| Committed write with lost response                | Retry returns one receipt under the original key.                                                                                          |
| Approved write after exhausted retries            | Approved state survives a restart and recovers.                                                                                            |
| HTTP replay/conflict                              | Same input returns cached receipt/trace; changed input under the same ID returns 409.                                                      |
| Backend authentication                            | Mock rejects access without its key.                                                                                                       |
| Catalogue pagination                              | Traverses approved results without duplicates.                                                                                             |
| Forged approval                                   | MCP and mock both reject it.                                                                                                               |
| Stale proposal decision                           | Cannot write the current proposal.                                                                                                         |

Skill-order assertions allow either loading order for the two purchase skills while requiring both before inventory search. This avoids treating one fixture-specific order as the only valid model behavior.

## Artifacts

- `evidence/eval-demo.json`: timestamp, provider, live flag, aggregate count and individual case results.
- `evidence/eval-demo.txt`: readable case outcomes and timings.
- `evidence/run-demo.json`: trace-rich selected read/proposal/approval/failure examples.
- Equivalent `eval-live.*` and `run-live.json` files are written only by an executed live run.
- [Evidence index](../evidence/README.md): links to the five captured browser screenshots.

The automated runner starts no Next.js server or browser. Screenshots are separate manual/browser evidence and do not prove that a new backend feature was visually exercised.

The local CI workflow installs with Node 24, runs type checking, formatting, tests, evaluations and build, then uploads evidence even when a step fails. The presence of this workflow is not a claim that hosted GitHub CI has executed for this local project.

## Remaining gaps

Live-model skill/tool selection, broad natural-language quantity handling and semantic SKU ambiguity need a separate benchmark. The deterministic fixture does not exercise how a model interprets malicious product text, follows a skill body or asks appropriate clarifying questions.

There is no automated browser/accessibility suite, multi-worker fencing test, comprehensive distributed crash/race injection, deletion/restore test or real supplier integration. Stock is not reserved or decremented. Price changes can leave an approved proposal requiring developer reconciliation. Business-write deduplication should not be described as exactly-once HTTP delivery.

When changing a behavior, add an assertion about its visible outcome or durable invariant. Keep source/protocol checks separate from actual live-model and browser evidence.

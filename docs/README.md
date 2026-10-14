# Bench application documentation

This documentation describes the implemented local application, reviewed against the source on October 14, 2026. It is intended for developers and assignment reviewers. The [root README](../README.md) remains the quick setup and demonstration entry point.

## Documentation map

| Document                                                                     | Questions it answers                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Application architecture](architecture/Bench-System-Design.md)              | Which processes run, where are the trust boundaries, and how do proposal and approval requests interact?                        |
| [Database design](database-design.md)                                        | What does each SQLite database own, which constraints exist, and what survives restart?                                         |
| [HTTP API](api.md)                                                           | Which browser and agent endpoints exist, what do they accept, and how do errors and replay work?                                |
| [MCP tools](mcp-tools.md)                                                    | Which tools are registered, which can the model call, and how do pagination and tool errors work?                               |
| [Frontend](frontend.md)                                                      | How does the React page restore sessions, review proposals, retry requests and display traces?                                  |
| [Backend](backend.md)                                                        | How do Express, LangGraph, model providers, approvals and retries fit together?                                                 |
| [Application skills](skills.md)                                              | How are Markdown skills discovered and loaded, and how do developers add one?                                                   |
| [Operations and configuration](operations.md)                                | How do you run, configure, inspect and back up the local services?                                                              |
| [Testing and evidence](testing.md)                                           | What was tested, how are evaluations reproduced, and what remains unverified?                                                   |
| [Security and privacy](security.md)                                          | How are identity, purchase authorization, secrets and private trace data handled?                                               |
| [Domain glossary](../GLOSSARY.md)                                            | What do stock, packs, purchase proposals, approvals and receipts mean?                                                          |
| [Proposed AgentCore deployment](../AGENTCORE.md)                             | What would change for AWS? This is a separate proposal, not the current runtime.                                                |
| [Proposed real-time inventory and RAG](architecture/AgentCore-RAG-Design.md) | How would Bedrock context retrieval, validated live SQL, lab isolation and purchase revalidation work? This is not implemented. |

## Suggested reading paths

- **Run the demonstration:** root README → operations → testing.
- **Understand the agent:** architecture → backend → MCP tools → application skills.
- **Integrate a client:** HTTP API → frontend → security.
- **Change persistence or recovery:** database design → backend → testing.

## Documentation conventions

Implementation details belong in the owning guide above. Other guides link to them rather than maintaining another copy of the contract. Source references identify the authoritative implementation; if code changes, update its owning guide and any affected diagrams.

Mermaid blocks are editable diagram sources. View them in a Markdown renderer that supports Mermaid. This documentation update checks source structure and links; it does not establish that every renderer displays diagrams identically.

The default provider is a deterministic test double. Recorded local checks, actual provider execution, Docker runtime validation and proposed cloud behavior are distinguished throughout the guides. Previously captured browser screenshots predate the application skills feature.

Repository engineering-skill configuration lives in [docs/agents](agents/issue-tracker.md). It governs development workflows and is separate from the [application's runtime skills](skills.md).

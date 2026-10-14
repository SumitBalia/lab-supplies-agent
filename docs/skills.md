# Application skills

Bench's runtime skills are reusable Markdown workflow instructions for its lab-supplies agent. They are part of the application repository. Codex engineering skills and their [repository configuration](agents/issue-tracker.md) serve a separate development workflow.

Sources: [registry](../server/skills.ts), [prompt and local tool handler](../server/agent.ts), [demo routing](../server/model.ts).

## Current skills

| Skill                                                     | Trigger and outcome                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [stock-check](../skills/stock-check/SKILL.md)             | Inventory questions and the inventory prerequisite for purchasing. Search all pages, identify the exact item, read it and report stock/location.     |
| [purchase-planning](../skills/purchase-planning/SKILL.md) | Purchase requests and quantity follow-ups. Establish quantity and lab, check stock and approved catalogue evidence, then propose only the shortfall. |

A stock check uses stock-check. A purchase uses both skills. Lab memory questions and unrelated requests do not require a skill. The model may ask a clarification rather than proceeding to inventory or a proposal.

## Discovery and loading

At agent startup, the registry reads the explicitly named `skills/<name>/SKILL.md` files and validates their limited frontmatter. It keeps the instruction bodies in memory. Missing or malformed registered files prevent startup.

Each graph invocation gets a metadata catalog of names and descriptions in its system prompt. The model can call:

```json
{ "name": "stock-check" }
```

through the local `read_skill` tool. The handler returns `{name, description, instructions}` as a tool message in the current model conversation. This discloses the body to the model only when requested, although the files were read into process memory at startup.

`read_skill` is not an MCP tool and makes no backend call. Its schema permits only registered names and rejects extra arguments. Model-supplied paths cannot be used to read arbitrary files.

## Authority and observability

The system prompt asks the model to load relevant skills before supply tools. The handler **does not enforce a loaded-skill prerequisite**. This is procedural guidance, not the purchase authorization boundary.

Actual order writes remain unavailable to the model. Proposal evidence, saved lab, quantity/price limits, approval, proof generation and idempotency are enforced by service/backend code. A skill cannot grant a new tool or substitute for human approval.

Successful loads emit `kind: "skill"`, `name: "read_skill"`, arguments naming the skill and result metadata containing its name/description. Errors use the same kind with an exhausted-error event. The existing activity panel displays these events. Model-call traces can also contain the instruction body because they record the model conversation.

## Editing and adding a skill

For an existing workflow, edit its Markdown file and restart the agent. There is no file watcher or runtime skill editor.

To add another workflow:

1. Create `skills/<name>/SKILL.md` with a concise name, description and useful instructions.
2. Add that name to the explicit `names` registration in `server/skills.ts`. Its enum and catalog then include the skill.
3. Update routing guidance in `server/agent.ts` if the new workflow changes which skills should apply.
4. Add behavior-focused evaluations. Update `server/model.ts` if the deterministic demonstration should exercise the new skill.
5. Restart and verify the intended skill and MCP events. Run live evaluation separately to check a real model's interpretation.

The loader supports exactly two plain, single-line frontmatter fields in this order:

```markdown
---
name: stock-summary
description: Summarize an identified supply item's available stock and location.
---

# Stock summary

Use authoritative item data to report its SKU, ordering unit, stock and location.
```

The folder name, registered name and frontmatter name must match. The current parser is not a general YAML implementation: multiline/quoted metadata, additional frontmatter fields and alternate ordering are not supported. Instruction bodies must be nonempty Markdown.

Keep data access routed through existing tools. Files can explain a workflow, but the current loader does not execute scripts, discover arbitrary skill folders or load auxiliary reference files automatically.

## Verification limits

The deterministic fixture chooses skill calls in code and consumes real MCP data. It does not interpret the Markdown instructions as a language model would. Editing a skill body alone therefore does not change the fixture's programmed decisions.

Unit tests check catalog/body separation and name/path restrictions. Integration evaluations check that the relevant skill events precede inventory search and that purchasing still requires approval. OpenAI and Ollama receive the same metadata and tool contract, but their live skill-selection quality remains unverified. See [testing](testing.md).

# Domain docs

How engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring

Use the single-context layout:

- Read `GLOSSARY.md` at the repo root when it exists.
- Read ADRs in root `docs/adr/` that touch the area being explored.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved, including when reached through `/grill-with-docs` or `/improve-codebase-architecture`.

## File structure

- `GLOSSARY.md`: shared vocabulary for this application.
- `docs/adr/`: numbered architecture decision records for this application.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis or test, use the glossary's defined term. Avoid synonyms the glossary explicitly rejects.

If a needed concept is missing, first check whether the project already uses another term. Record a real vocabulary gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain why the decision is worth reopening before proceeding.

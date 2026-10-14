# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file.
- Triage state is recorded as a `Status:` line near the top of each issue file. Use the role strings in `docs/agents/triage-labels.md`.
- A triaged issue also records `Category: bug` or `Category: enhancement` near the top.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create the appropriate spec or individual issue file under `.scratch/<feature-slug>/`, creating its directory if needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or issue number directly. Issue numbering is local to each feature directory; if a bare number matches multiple features, ask which feature they mean.

## Wayfinding operations

Used by `/wayfinder`. The map is a file with one child file per ticket.

- **Map:** `.scratch/<effort>/map.md` with the Notes / Decisions-so-far / Fog body.
- **Child ticket:** `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records `research`, `prototype`, `grilling` or `task`. Wayfinding uses `Status: open`, `Status: claimed` and `Status: resolved` for its work lifecycle.
- **Blocking:** a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier:** scan `.scratch/<effort>/issues/` for open, unblocked, unclaimed files; first by number wins.
- **Claim:** set `Status: claimed` and save before work.
- **Resolve:** append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer with a gist and link to Decisions-so-far in `map.md`.

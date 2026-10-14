# Triage labels

The engineering skills use five canonical triage roles. For this local Markdown tracker, record the corresponding string in an issue's `Status:` line.

| Canonical role    | Local status string | Meaning                                             |
| ----------------- | ------------------- | --------------------------------------------------- |
| `needs-triage`    | `needs-triage`      | Maintainer needs to evaluate this issue.            |
| `needs-info`      | `needs-info`        | Waiting on the reporter for more information.       |
| `ready-for-agent` | `ready-for-agent`   | Fully specified and ready for agent implementation. |
| `ready-for-human` | `ready-for-human`   | Requires human implementation.                      |
| `wontfix`         | `wontfix`           | Will not be actioned.                               |

When a skill mentions a triage role, use its local status string from this table. A triaged issue has exactly one triage status and a category of `bug` or `enhancement`.

Wayfinding tickets use the separate work lifecycle documented in `docs/agents/issue-tracker.md`.

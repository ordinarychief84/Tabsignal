---
name: skill-name-here
description: One-line description. Used by the agent to decide relevance. Be specific.
trigger: When this skill should be invoked (file pattern, user phrasing, task type)
inputs: What the agent passes in
outputs: What this skill returns
---

# Skill Name

## Purpose
Why this skill exists. What problem it solves.

## When to invoke
Concrete triggers. Examples:
- User types `/the-thing`
- User asks for X in the context of Y
- A specific file pattern is being edited

## Inputs
| Name | Type | Required | Notes |
|---|---|---|---|
| input-1 | string | yes | what it is |
| input-2 | bool   | no  | default false |

## Outputs
What the agent gets back. Format, shape, files written.

## How it works
Step-by-step. Reference scripts in `./scripts/` and resources in `./resources/`.

1. Validate input via `scripts/validate.sh`
2. Look up the relevant style guide in `resources/`
3. Generate output following `examples/`

## Scripts
- `scripts/validate.sh` — input validation
- `scripts/run.sh` — main entry point

## Resources
- `resources/checklist.md`
- `resources/style-guide.md`

## Examples
- `examples/canonical.md` — gold-standard reference

## Failure modes
What can go wrong, and what the agent should do.

## Notes
Edge cases, caveats, related skills.

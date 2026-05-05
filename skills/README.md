# Skills

Local skill workspace. Pattern per skill:

```
skills/<skill-name>/
├── SKILL.md      # mission control — what the skill does, when to invoke
├── scripts/      # executable enforcers (validation, networking, codegen)
├── resources/    # knowledge base (checklists, style guides, references)
└── examples/     # gold-standard syntactically-valid references
```

Use `_template/` as a copy-and-rename starting point.

---

## Inventory

### Reference repositories (cloned globally to `~/.claude/skills/_external/`)

Run `bash bootstrap.sh` from the project root once tooling is installed; it fetches:

- `obra/superpowers`
- `obra/superpowers-lab`
- `yusufkaraaslan/Skill_Seekers`
- `BehiSecc/awesome-claude-skills`

These are reference libraries — review them, copy patterns, but don't edit in place (they're external sources).

### Named skills (status)

| Skill | Category | Install path | Status |
|---|---|---|---|
| Rube MCP Connector | integrations | MCP server, configured per-host | Manual — see https://rube.app for connector setup |
| Document Suite | documents | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Theme Factory | design | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Algorithmic Art | media | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Slack GIF Creator | media | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Webapp Testing | testing | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| MCP Builder | dev | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Brand Guidelines | design | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| Systematic Debugging | dev | Claude.ai catalog skill | Manual — enable in Claude.ai settings, no local install |
| ui/ux pro max | design | unverified — likely Claude.ai catalog | Search `_external/awesome-claude-skills` after bootstrap; if not present, treat as Claude.ai-only |

> **Honest read on the catalog skills:** Document Suite, Theme Factory, etc. live in the Claude.ai web app's skill marketplace (Claude → Settings → Skills). They're not packaged as local files. If you want them in this Claude Code session, they're enabled at the account level, not the project level. The bootstrap script will surface any of these that turn out to have a local equivalent in the cloned reference repos.

### Stitch skills (`npx skills add google-labs-code/stitch-skills ...`)

The bootstrap runs all 7 commands and logs each exit code:

- `stitch-design`
- `stitch-loop`
- `design-md`
- `enhance-prompt`
- `react:components`
- `remotion`
- `shadcn-ui`

If the `skills` CLI package or the `google-labs-code/stitch-skills` source doesn't exist as published, the bootstrap log (`/tmp/tabcall_bootstrap.log`) will show it. Re-run after fixing.

---

## Adding a new local skill

```bash
cp -r skills/_template skills/my-new-skill
# edit skills/my-new-skill/SKILL.md
```

Each skill's `SKILL.md` must declare:
- **Name** (kebab-case, matches folder)
- **When to invoke** (trigger conditions)
- **Inputs / outputs**
- **Tools used** (which scripts in `scripts/`, which references in `resources/`)

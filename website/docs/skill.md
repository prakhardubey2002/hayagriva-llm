---
sidebar_position: 6
title: Agent Skills
description: Generate Cursor / Claude Agent Skills (SKILL.md) with hayagriva-llm.
---

# Agent Skills (SKILL.md)

**hayagriva-llm** can scaffold a [Cursor Agent Skill](https://cursor.com/docs/context/skills): a folder under `.cursor/skills/<name>/` containing `SKILL.md` with YAML frontmatter and editable sections (Instructions, Workflow, Examples, and more).

Use this when you want agents to follow project-specific workflows without repeating context every session.

---

## Quickest path (OpenRouter)

Set `OPEN_ROUTER_API_KEY` in `.env`, then from your package root:

```bash
hayagriva-llm generateskill
```

This command:

- Calls **OpenRouter once** to fill the skill content
- **Overwrites** an existing `SKILL.md` if present
- Uses your **package description** (or `llm.package.json` summary) as the brief when you omit `--brief`

Equivalent:

```bash
hayagriva-llm skill --generateskill
```

---

## `skill` command (static or AI)

```bash
hayagriva-llm skill [options]
```

| Option            | Description                                                       | Default                |
| ----------------- | ----------------------------------------------------------------- | ---------------------- |
| `--generateskill` | Same as `generateskill` (AI + overwrite)                          | off                    |
| `--mode <type>`   | `static` (local template) or `ai` (OpenRouter)                    | `static`               |
| `--name <slug>`   | Folder name under `.cursor/skills/`                               | slug from package name |
| `--brief <text>`  | Purpose / trigger hints for the skill                             | package description    |
| `--scope <where>` | `project` or `personal` (`~/.cursor/skills/`)                     | `project`              |
| `--force`         | Overwrite existing `SKILL.md`                                     | off                    |
| `--api-key <key>` | OpenRouter key (AI mode)                                          | env                    |
| `--model <name>`  | OpenRouter model                                                  | `openai/gpt-4o-mini`   |
| `--freellmrouter` | Ranked free models via [Free LLM Router](./free-llm-router)         | off                    |
| `--verbose`       | Debug logging                                                     | off                    |

### Examples

```bash
# No API — template from package.json / llm.package.json
hayagriva-llm skill --mode static

# AI with custom brief
hayagriva-llm skill --mode ai --brief "Review API and OpenAPI changes" --force

# Personal skill (all projects)
hayagriva-llm generateskill --scope personal --name my-workflow
```

---

## Output layout

```
.cursor/skills/
└── hayagriva-metadata/    # example folder name
    └── SKILL.md
```

`SKILL.md` includes a comment marker so you know what to customize:

```markdown
<!-- hayagriva-llm: edit the sections below ... -->
```

Edit **Instructions**, **Workflow**, **Examples**, and **Your notes** after generation. Add optional files in the same folder (`reference.md`, scripts, etc.) per Cursor’s skill conventions.

---

## Suggested workflow

1. Run `hayagriva-llm generate` so `llm.package.json` exists (richer AI skill content).
2. Run `hayagriva-llm generateskill`.
3. Tweak `SKILL.md` under the hayagriva-llm comment for team rules.
4. Commit `.cursor/skills/` if the skill is shared with the repo.

---

## Environment

Same as [AI mode](./ai-mode): `OPEN_ROUTER_API_KEY` is required for `generateskill` and `--mode ai`. Optional: `OPEN_ROUTER_MODEL`, `--freellmrouter` + `FREE_LLM_ROUTER_API_KEY`.

---

## Related

- [`generate`](./intro) — `llm.package.json` / `llm.package.txt`
- [`agent`](./intro) — `AGENT.md` operating manual
- [`generate --rule`](./intro) — `.cursor/rules/*.mdc` project rules

---
sidebar_position: 1
title: Introduction
description: Get started with hayagriva-llm — structured LLM metadata for Node.js packages.
---

# Introduction

**hayagriva-llm** defines a structured LLM metadata standard for Node.js packages: similar to `llm.txt` for websites, but built for the npm ecosystem. It generates two files:

- **`llm.package.json`** — Machine-readable metadata (exports, hooks, frameworks, summary, side effects, keywords).
- **`llm.package.txt`** — LLM-optimized plain-text summary for context windows and search (e.g. Cursor, Antigravity).

---

## Install

```bash
npm install -g hayagriva-llm
# or
npx hayagriva-llm generate
```

**Requirements:** Node.js 18+

---

## Quick start

From your package root:

```bash
# Static mode — no API key; extracts exports from your entry file
hayagriva-llm generate

# AI mode — richer metadata via OpenRouter (set OPEN_ROUTER_API_KEY)
hayagriva-llm generate --mode ai
```

This writes `llm.package.json` and `llm.package.txt` in the current directory.

---

## Options

| Option            | Description                      | Default                   |
| ----------------- | -------------------------------- | ------------------------- |
| `--mode <type>`   | `static` or `ai`                 | `static`                  |
| `--api-key <key>` | OpenRouter API key (AI mode)     | `OPEN_ROUTER_API_KEY` env |
| `--model <name>`  | OpenRouter model (AI mode)       | `openai/gpt-4o-mini`      |
| `--include-src`   | Include full source in AI prompt | off                       |
| `--verbose`       | Debug logging                    | off                       |

---

## Environment

- **`OPEN_ROUTER_API_KEY`** — Required for `--mode ai`. Get a key at [OpenRouter](https://openrouter.ai/keys).
- **`OPEN_ROUTER_MODEL`** — Optional default model for AI mode.

Copy `.env.example` to `.env` in your project and set these as needed.

---

## What's next

- [Flow & architecture](./flow) — How the CLI works (static vs AI, entry detection).
- [Schema](./schema) — Structure of `llm.package.json` and `llm.package.txt`.
- [AI mode](./ai-mode) — Multi-step AI flow and guardrails.

For using the package in your project, Husky, and GitHub Actions, see the [README in the repository](https://github.com/your-username/Hayagriva-LLM#readme) (replace `your-username` with your GitHub username).

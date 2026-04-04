---
sidebar_position: 5
title: Free LLM Router
description: Use ranked free OpenRouter models with automatic caching and fallbacks.
---

# Free LLM Router

When you want **AI mode** without pinning a single free model, hayagriva-llm can integrate with **[Free LLM Router](https://freellmrouter.com/docs)**.

## What it does

1. **Discover free models** — Fetches a live-ranked list of free [OpenRouter](https://openrouter.ai/) model IDs from the router API (filtered for `chat` use case, sorted by capability).
2. **Call OpenRouter** — Every completion still goes to OpenRouter’s API using your **`OPEN_ROUTER_API_KEY`** (or `--api-key`). Billing and quotas remain on OpenRouter.
3. **Automatic fallback** — If a model is rate-limited, overloaded, or returns bad output, the CLI tries the next model in the list.
4. **Feedback** — Successful and failed attempts are reported to Free LLM Router (fire-and-forget), which helps community health signals. This does not use your OpenRouter quota.

## Caching

The model list is **cached in memory for about 15 minutes** (same idea as the [official helper](https://freellmrouter.com/docs)): repeated `generate` runs in the same process avoid hammering the router API. If a refresh fails but a stale list exists, the CLI **reuses the last good list** (with a warning in non-production).

## CLI

```bash
# Implies AI mode; needs both keys (see below)
hayagriva-llm generate --freellmrouter
```

`--model` / `OPEN_ROUTER_MODEL` are **not** used for picking the free model when this flag is set; the router supplies the ordered list (up to 25 models).

## Environment

| Variable                  | Role                                                                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPEN_ROUTER_API_KEY`     | Required. Authenticates **OpenRouter** chat requests.                                                                                                                                                                                                                                           |
| `FREE_LLM_ROUTER_API_KEY` | Required for `--freellmrouter`. Authenticates **only** the router’s `GET /models/ids` (and optional feedback). **Create or copy your key** in the [Free LLM Router dashboard (API tab)](https://freellmrouter.com/dashboard?tab=api). See also [documentation](https://freellmrouter.com/docs). |

### Where to get `FREE_LLM_ROUTER_API_KEY`

1. Sign in at [Free LLM Router](https://freellmrouter.com/).
2. Open **[Dashboard → API](https://freellmrouter.com/dashboard?tab=api)** to create or view your API key.
3. Put that value in `FREE_LLM_ROUTER_API_KEY` (it is **not** your OpenRouter key).

### Dedicated OpenRouter key and credit limit

As in [Free LLM Router — Set up OpenRouter](https://freellmrouter.com/docs), use a **separate OpenRouter API key** only for free-model usage and set a **low credit limit** on your OpenRouter account (e.g. \$1) so you are not charged if a non-free model is selected by mistake.

- Create the key under **[OpenRouter Keys](https://openrouter.ai/keys)** or your workspace (e.g. [default workspace → Keys](https://openrouter.ai/workspaces/default/keys)).
- Store it in **`OPEN_ROUTER_API_KEY`**. It is **not** the same value as **`FREE_LLM_ROUTER_API_KEY`**.

## See also

- [AI mode](./ai-mode) — Multi-step prompts and validation.
- [Introduction](./intro) — Install and quick start.

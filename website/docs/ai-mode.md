---
sidebar_position: 4
title: AI mode
description: Multi-step AI flow and guardrails with OpenRouter.
---

# AI mode

AI mode uses **OpenRouter** and a **multi-step flow with strong guardrails** so that:

1. Each step has a narrow, strict schema — easier to validate and less sensitive to model or adapter changes.
2. Failures are attributed to a specific step (`package-overview` or `exports`).
3. The overall structure (merge → build → write) stays the same regardless of provider.

---

## Steps

### Step 1: Package overview

- **Input:** Package manifest (and optionally entry source).
- **Prompt:** Ask for exactly `summary`, `sideEffects`, `keywords`, `frameworks`.
- **Validation:** All four fields required; `summary` must be a string; the other three must be string arrays.
- **On failure:** Error message includes `[AI step "package-overview"]`.

### Step 2: Exports

- **Input:** Same as step 1 (manifest + optional source).
- **Prompt:** Ask for `exports` (object) and `hooks` (array). Each export must have `type`, `description`, `hook`; optional `params`, `returns`, `sideEffect`, `example`.
- **Validation:** `exports` must be an object; each value normalized to at least `type`, `description`, `hook`; invalid entries dropped. `hooks` must be a string array.
- **On failure:** Error message includes `[AI step "exports"]`.

---

## Merging

Results of step 1 and step 2 are merged into a single `AIRawResponse`:

- `summary`, `sideEffects`, `keywords`, `frameworks` from step 1.
- `exports`, `hooks` from step 2.

That object is then passed into the same `buildJsonMetadata` / `buildTxtMetadata` pipeline used in static mode.

---

## Environment and options

- **API key:** Required. Set `OPEN_ROUTER_API_KEY` or pass `--api-key`.
- **Model:** Optional. Set `OPEN_ROUTER_MODEL` or pass `--model` (default: `openai/gpt-4o-mini`).
- **`--include-src`:** Include full entry file source in both AI prompts for richer context.

---

## Extensibility

- Validators only require the fields above. Additional keys in the AI response (root or per-export) are preserved where possible so new fields or adapters don't break the pipeline.
- If a step returns extra keys, they are merged into the metadata so `llm.package.json` can evolve with new IDE or search hints.

---
sidebar_position: 3
title: Schema
description: llm.package.json and llm.package.txt format.
---

# Schema

## llm.package.json

Machine-readable metadata. Consumed by tooling and IDEs.

| Field         | Type                 | Required | Description                                   |
| ------------- | -------------------- | -------- | --------------------------------------------- |
| `name`        | string               | yes      | Package name (from package.json).             |
| `version`     | string               | yes      | Package version.                              |
| `description` | string               | yes      | Short description (from package.json).        |
| `exports`     | object               | yes      | Map of export name → export meta (see below). |
| `hooks`       | string[]             | yes      | Names of exports that are React-style hooks.  |
| `frameworks`  | string[]             | yes      | e.g. `["react", "vue"]`.                      |
| `generatedBy` | string               | yes      | e.g. `hayagriva-llm@1.0.0`.                   |
| `mode`        | `"static"` \| `"ai"` | yes      | How metadata was produced.                    |
| `summary`     | string               | no       | One-paragraph summary (AI mode).              |
| `sideEffects` | string[]             | no       | Package-level side effects (AI mode).         |
| `keywords`    | string[]             | no       | Search/keyword hints (AI mode).               |

**Export meta** (each value in `exports`):

| Field         | Type                                  | Required | Description                                |
| ------------- | ------------------------------------- | -------- | ------------------------------------------ |
| `type`        | `"function"` \| `"class"` \| `"type"` | yes      | Kind of export.                            |
| `description` | string                                | yes      | One-line summary.                          |
| `hook`        | boolean                               | yes      | True if name starts with `use`.            |
| `params`      | string                                | no       | e.g. `url: string, options?: RequestInit`. |
| `returns`     | string                                | no       | Return type or brief description.          |
| `sideEffect`  | boolean                               | no       | True if the export has side effects.       |
| `example`     | string                                | no       | One-line usage example.                    |

Additional keys from AI or adapters are preserved so the structure remains extensible.

---

## llm.package.txt

Plain-text, LLM-optimized summary. Sections:

- **Package** / **Version**
- **Description**
- **Summary** (if present)
- **Side effects** (if present)
- **Keywords** (if present)
- **Exports** — one line per export; hooks marked; optional params/returns/sideEffect/example
- **Hooks** — list of hook names
- **Frameworks** (if present)

Used for context windows, retrieval, and search.

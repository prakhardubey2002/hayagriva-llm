# hayagriva-llm

[![npm version](https://img.shields.io/npm/v/hayagriva-llm.svg)](https://www.npmjs.com/package/hayagriva-llm)
[![npm downloads](https://img.shields.io/npm/dw/hayagriva-llm.svg)](https://www.npmjs.com/package/hayagriva-llm)
[![npm total downloads](https://img.shields.io/npm/dt/hayagriva-llm.svg)](https://www.npmjs.com/package/hayagriva-llm)
[![Node.js Version](https://img.shields.io/node/v/hayagriva-llm)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-prakhardubey2002%2Fhayagriva--llm-blue)](https://github.com/prakhardubey2002/hayagriva-llm)

**Structured LLM metadata for Node.js packages** — the first standard for machine-readable package context in the npm ecosystem. Generates `llm.package.json` and `llm.package.txt` for indexing, search, and IDE tooling (e.g. Cursor, Antigravity).

📖 **Documentation:** https://deepwiki.com/prakhardubey2002/hayagriva-llm

---

## Install

```bash
npm install -g hayagriva-llm
# or
npx hayagriva-llm generate
```

**Requirements:** Node.js 18+

---

## Usage

From your package root:

```bash
hayagriva-llm generate [options]
```

| Option            | Description                                                                                                                          | Default                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `--mode <type>`   | `static` (ts-morph) or `ai` (OpenRouter)                                                                                             | `static`                                    |
| `--api-key <key>` | OpenRouter API key (required for `--mode ai`)                                                                                        | `OPEN_ROUTER_API_KEY` env                   |
| `--model <name>`  | OpenRouter model (AI mode)                                                                                                           | `openai/gpt-4o-mini` or `OPEN_ROUTER_MODEL` |
| `--include-src`   | Include full entry source in AI prompt                                                                                               | off                                         |
| `--verbose`       | Debug logging                                                                                                                        | off                                         |
| `--freellmrouter` | Use [Free LLM Router](https://freellmrouter.com/docs) for ranked free OpenRouter models (`FREE_LLM_ROUTER_API_KEY`; implies AI mode) | off                                         |
| `--rule`          | Also generate a Cursor rule `.mdc` in `.cursor/rules/`                                                                               | off                                         |

### Agent operating manual (AGENT.md)

Generate a thorough `AGENT.md` file (an operating manual for coding agents):

```bash
hayagriva-llm agent [options]
```

| Option         | Description               | Default    |
| -------------- | ------------------------- | ---------- |
| `--out <file>` | Output filename           | `AGENT.md` |
| `--force`      | Overwrite existing output | off        |

**Examples:**

```bash
# Static mode (no API key): extract exports from TypeScript/JavaScript entry
hayagriva-llm generate

# AI mode: richer metadata (summary, side effects, keywords) via OpenRouter
hayagriva-llm generate --mode ai

# AI mode with Free LLM Router: live free-model list, in-process cache (~15m), per-step fallback on OpenRouter
hayagriva-llm generate --freellmrouter

# AI with custom model and full source context
hayagriva-llm generate --mode ai --model openai/gpt-4o --include-src --verbose

# Also generate a Cursor rule file (.cursor/rules/<package-name>.mdc)
hayagriva-llm generate --rule
hayagriva-llm generate --mode ai --rule

# Generate AGENT.md (manual for coding agents)
hayagriva-llm agent

# Write to a custom filename and overwrite if it already exists
hayagriva-llm agent --out Agent.md --force
```

---

## Environment

| Variable                  | Description                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPEN_ROUTER_API_KEY`     | OpenRouter API key (required for AI mode; used for all chat completions)                                                                                                              |
| `OPEN_ROUTER_MODEL`       | Default model for AI mode (e.g. `openai/gpt-4o-mini`; not used for model pick when `--freellmrouter` is set)                                                                          |
| `FREE_LLM_ROUTER_API_KEY` | [Free LLM Router](https://freellmrouter.com/docs) key (required with `--freellmrouter` only; get it from the [API tab in the dashboard](https://freellmrouter.com/dashboard?tab=api)) |

Copy `.env.example` to `.env` and set `OPEN_ROUTER_API_KEY` (and optionally `OPEN_ROUTER_MODEL`) for AI mode. Legacy names `OPENROUTER_API_KEY` and `HAYAGRIVA_LLM_MODEL` are still supported.

With **`--freellmrouter`**, hayagriva-llm calls OpenRouter using your OpenRouter key while the router supplies an ordered list of free model IDs. The list is **cached in memory for about 15 minutes**; if the router is unreachable, a **stale cached list** is reused when available (see [Free LLM Router docs](https://freellmrouter.com/docs)).

### Dedicated OpenRouter key (recommended for `--freellmrouter`)

[Free LLM Router](https://freellmrouter.com/docs) recommends a **separate OpenRouter API key** used only for free models, plus a **low credit limit** (e.g. \$1) on OpenRouter so an accidental paid model does not charge your account.

1. Open **[OpenRouter → Keys](https://openrouter.ai/keys)** (or your workspace keys page, e.g. [default workspace keys](https://openrouter.ai/workspaces/default/keys)).
2. Create a **new** key (do not reuse a production key).
3. In OpenRouter billing/settings, set a **credit limit** appropriate for experimentation.
4. Put that key in **`OPEN_ROUTER_API_KEY`**, and set **`FREE_LLM_ROUTER_API_KEY`** to your Free LLM Router key from the **[dashboard → API tab](https://freellmrouter.com/dashboard?tab=api)** ([docs](https://freellmrouter.com/docs)).

---

## Output

- **`llm.package.json`** — Structured metadata: name, version, description, `exports`, `hooks`, `frameworks`, optional `summary`, `sideEffects`, `keywords`; IDE- and search-friendly.
- **`llm.package.txt`** — LLM-optimized plain-text summary for context windows and retrieval.

### Observability (local)

Every run writes analytics to a local hidden folder in the **package you run from**:

- **`.hayagriva-llm/runs.jsonl`**: append-only history (one JSON per run)
- **`.hayagriva-llm/last-run.json`**: the most recent run (pretty JSON)

This folder is meant to be **local-only** (it’s ignored by git).

To view a local dashboard:

```bash
# from your package root (where .hayagriva-llm/ exists)
npx hayagriva-llm dashboard
# or
hayagriva-llm dashboard --port 4177
```

---

## Flow (high level)

```mermaid
flowchart TB
  subgraph CLI
    A[hayagriva-llm generate] --> B[Load package.json]
    B --> C[Detect entry file]
    C --> D{Mode?}
  end

  subgraph Static["Static mode"]
    D -->|static| E[ts-morph: extract exports, JSDoc, hooks]
    E --> F[Build metadata]
  end

  subgraph AI["AI mode (guardrails)"]
    D -->|ai| G[Step 1: Package overview]
    G --> H[Validate: summary, sideEffects, keywords, frameworks]
    H --> I[Step 2: Exports]
    I --> J[Validate: exports map, hooks]
    J --> K[Merge steps]
    K --> F
  end

  F --> L[Write llm.package.json]
  F --> M[Write llm.package.txt]
```

Detailed flow (entry detection, validation, and file layout) is documented on DeepWiki: https://deepwiki.com/prakhardubey2002/hayagriva-llm

---

## Using hayagriva-llm in your package

Add it as a **devDependency** so your package always ships up-to-date LLM metadata.

### 1. Install

```bash
npm install -D hayagriva-llm
```

### 2. Generate metadata (manual or script)

From your package root:

```bash
# Static mode — no API key; uses ts-morph on your entry file
npx hayagriva-llm generate

# AI mode — set OPEN_ROUTER_API_KEY in .env first
npx hayagriva-llm generate --mode ai
```

This writes `llm.package.json` and `llm.package.txt` in the current directory. Commit them so consumers and tooling (e.g. Cursor, Antigravity) can use them.

### 3. Add an npm script (optional)

In your `package.json`:

```json
{
  "scripts": {
    "llm:generate": "hayagriva-llm generate",
    "prepublishOnly": "npm run llm:generate"
  }
}
```

- **`llm:generate`** — run whenever you want to refresh metadata.
- **`prepublishOnly`** — regenerates metadata before `npm publish` so the published package always has current exports.

For AI mode in scripts, ensure `OPEN_ROUTER_API_KEY` (and optionally `OPEN_ROUTER_MODEL`) are set in your environment or in a `.env` file. The CLI loads `.env` via `dotenv` automatically.

---

## Automating with Husky

Use [Husky](https://typicode.github.io/husky/) to run `hayagriva-llm generate` automatically (e.g. before commit) so `llm.package.json` and `llm.package.txt` stay in sync without manual runs.

### 1. Install Husky

```bash
npm install -D husky
npx husky init
```

This creates `.husky/` and a default `pre-commit` hook.

### 2. Hook: regenerate metadata before commit

Edit `.husky/pre-commit` so it runs the generator and re-stages the output:

```bash
# Regenerate LLM metadata (uses .env for OPEN_ROUTER_API_KEY if you use --mode ai)
npx hayagriva-llm generate

# Re-stage generated files so they are included in the commit
git add llm.package.json llm.package.txt
```

- **Static mode:** No env needed; the hook just runs `hayagriva-llm generate` (default mode is `static`).
- **AI mode:** Set `OPEN_ROUTER_API_KEY` (and optionally `OPEN_ROUTER_MODEL`) in `.env` in the repo root. The CLI loads `.env` automatically. Example hook for AI mode:

  ```bash
  npx hayagriva-llm generate --mode ai
  git add llm.package.json llm.package.txt
  ```

### 3. Combine with lint / test (optional)

Run lint and tests in the same hook, then generate metadata:

```bash
# Example: lint and test first, then regenerate metadata
npm run lint
npm test
npx hayagriva-llm generate
git add llm.package.json llm.package.txt
```

Adjust `lint` / `test` to match your `package.json` scripts.

### 4. Different hooks to fit your workflow

| Hook         | When it runs             | Use case                                      |
| ------------ | ------------------------ | --------------------------------------------- |
| `pre-commit` | Before each commit       | Always keep metadata in sync with latest code |
| `pre-push`   | Before each push         | Lighter; regenerate only before pushing       |
| `post-merge` | After `git pull` / merge | Refresh metadata after pulling changes        |

Example **pre-push** (`.husky/pre-push`):

```bash
npm test
npx hayagriva-llm generate
git add llm.package.json llm.package.txt
```

---

## Automating with GitHub Actions

Run `hayagriva-llm generate` in CI to validate that metadata is present and up to date, or to publish it as an artifact.

### Example: check metadata on push/PR

Create `.github/workflows/llm-metadata.yml`:

```yaml
name: LLM metadata

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  generate-and-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install hayagriva-llm
        run: npm install -D hayagriva-llm

      - name: Generate LLM metadata (static)
        run: npx hayagriva-llm generate

      - name: Check metadata is committed
        run: |
          git diff --exit-code llm.package.json llm.package.txt || \
            (echo "::error::llm.package.json or llm.package.txt are out of date. Run: npx hayagriva-llm generate" && exit 1)
```

This fails the workflow if someone forgets to run the generator after changing exports.

### Example: generate with AI in CI (optional)

If you want AI mode in CI, add your OpenRouter key as a repo secret (e.g. `OPEN_ROUTER_API_KEY`) and run:

```yaml
- name: Generate LLM metadata (AI)
  env:
    OPEN_ROUTER_API_KEY: ${{ secrets.OPEN_ROUTER_API_KEY }}
  run: npx hayagriva-llm generate --mode ai
```

Then use the same “check metadata is committed” step, or upload `llm.package.json` / `llm.package.txt` as artifacts.

To use **Free LLM Router** in CI, add a second secret for `FREE_LLM_ROUTER_API_KEY` and run `npx hayagriva-llm generate --freellmrouter` (still set `OPEN_ROUTER_API_KEY` for OpenRouter).

---

## Docs

Full documentation: https://deepwiki.com/prakhardubey2002/hayagriva-llm

| Page                                                                       | Description                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------- |
| [Introduction](https://deepwiki.com/prakhardubey2002/hayagriva-llm)        | Get started, install, options                   |
| [Flow & architecture](https://deepwiki.com/prakhardubey2002/hayagriva-llm) | End-to-end pipeline and Mermaid diagrams        |
| [Schema](https://deepwiki.com/prakhardubey2002/hayagriva-llm)              | `llm.package.json` and `llm.package.txt` format |
| [AI mode](https://deepwiki.com/prakhardubey2002/hayagriva-llm)             | Multi-step AI flow and guardrails               |

**Documentation:** https://deepwiki.com/prakhardubey2002/hayagriva-llm

### Documentation Hosting

1. **View docs:** https://deepwiki.com/prakhardubey2002/hayagriva-llm
2. **Docs are hosted on DeepWiki** (see link above).
3. **Keep updated:** Update source in the repo; consult the DeepWiki link above for the latest docs.

DeepWiki documentation: https://deepwiki.com/prakhardubey2002/hayagriva-llm

---

## Pre-commit (Husky)

This repo uses [Husky](https://typicode.github.io/husky/) for pre-commit hooks. On commit, the hook runs:

1. **Lint** — `npm run lint` (ESLint on `src/` and `test/`)
2. **Test** — `npm test` (Vitest)
3. **Build** — `npm run build`
4. **Size limit** — `npx size-limit` (checks `dist/cli.cjs` and `dist/cli.mjs` stay under 50 kB)

Install once: `npm install`. The `prepare` script runs `husky` so the `.husky/pre-commit` hook is installed.

---

## Publishing to npm

1. **Login** — `npm login` (create an account at [npmjs.com](https://www.npmjs.com/signup) if needed).
2. **Publish** — From the package root run:
   ```bash
   npm publish
   ```
   `prepublishOnly` will run lint, tests, and build before publishing. Only the `dist/` folder is included (`files` in package.json); README and LICENSE are included by npm by default.

Repository: [github.com/prakhardubey2002/hayagriva-llm](https://github.com/prakhardubey2002/hayagriva-llm) · npm: [hayagriva-llm](https://www.npmjs.com/package/hayagriva-llm). For a scoped package (e.g. `@your-org/hayagriva-llm`), set `"name": "@your-org/hayagriva-llm"` and run `npm publish --access public`.

---

## License

[MIT](LICENSE)

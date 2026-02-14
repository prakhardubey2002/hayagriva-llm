---
sidebar_position: 2
title: Flow & architecture
description: End-to-end flow from CLI to generated files.
---

# Flow & architecture

End-to-end flow of the package from CLI invocation to generated files.

---

## Full pipeline

```mermaid
flowchart TB
  Start([User: hayagriva-llm generate]) --> LoadPkg[Load package.json from cwd]
  LoadPkg --> DetectEntry[Detect entry file]
  DetectEntry --> EntryLogic{Entry found?}

  EntryLogic -->|source / module / main| ResolvePath[Resolve path: source → module → main]
  EntryLogic -->|fallback| Fallback[Try: src/index.ts, index.ts, src/index.js, index.js]
  ResolvePath --> Mode
  Fallback --> Mode

  Mode{--mode?}

  Mode -->|static| Static[Static mode]
  Mode -->|ai| AI[AI mode]

  subgraph StaticMode["Static mode"]
    Static --> TsMorph[ts-morph: parse entry file]
    TsMorph --> Extract[Extract: exported functions, classes, types]
    Extract --> JSDoc[Read JSDoc descriptions]
    JSDoc --> Hooks[Mark hooks: name starts with use]
    Hooks --> BuildStatic[Build JSON + TXT metadata]
  end

  subgraph AIMode["AI mode (multi-step, guardrails)"]
    AI --> CheckKey{OPEN_ROUTER_API_KEY?}
    CheckKey -->|missing| ErrKey[Error: require API key]
    CheckKey -->|set| Step1[Step 1: Package overview]
    Step1 --> Prompt1[Prompt: summary, sideEffects, keywords, frameworks]
    Prompt1 --> Call1[OpenRouter API call]
    Call1 --> Validate1[Validate: all fields present, correct types]
    Validate1 -->|fail| Err1[Throw: step package-overview]
    Validate1 -->|ok| Step2[Step 2: Exports]
    Step2 --> Prompt2[Prompt: exports map, hooks]
    Prompt2 --> Call2[OpenRouter API call]
    Call2 --> Validate2[Validate: exports object, each export type/description/hook]
    Validate2 -->|fail| Err2[Throw: step exports]
    Validate2 -->|ok| Merge[Merge overview + exports]
    Merge --> BuildAI[Build JSON + TXT metadata]
  end

  BuildStatic --> Write
  BuildAI --> Write

  subgraph Output["Output"]
    Write[Write llm.package.json + llm.package.txt]
  end

  Write --> End([Done])
```

---

## Entry file detection

```mermaid
flowchart LR
  A[package.json] --> B{source?}
  B -->|yes, file exists| C[Use source]
  B -->|no| D{module?}
  D -->|yes, file exists| E[Use module]
  D -->|no| F{main?}
  F -->|yes, file exists| G[Use main]
  F -->|no| H[Fallback list]
  H --> I[src/index.ts]
  I --> J[index.ts]
  J --> K[src/index.js]
  K --> L[index.js]
  C --> M[Entry path]
  E --> M
  G --> M
  L --> M
```

Priority: **source** → **module** → **main** → first existing of `src/index.ts`, `index.ts`, `src/index.js`, `index.js`.

---

## AI mode: two-step guardrails

AI mode uses **two separate API calls** so each step has a narrow, strict schema.

```mermaid
sequenceDiagram
  participant CLI
  participant aiMode
  participant OpenRouter
  participant Validator

  CLI->>aiMode: runAiMode(input, apiKey, model)
  aiMode->>aiMode: buildUserContent(manifest + optional source)

  Note over aiMode,OpenRouter: Step 1 — Package overview
  aiMode->>OpenRouter: POST (system: overview prompt, user: content)
  OpenRouter-->>aiMode: raw JSON
  aiMode->>Validator: validatePackageOverview(parsed)
  Validator-->>aiMode: { summary, sideEffects, keywords, frameworks }
  alt validation fails
    Validator-->>aiMode: throw
    aiMode-->>CLI: Error: [AI step "package-overview"] ...
  end

  Note over aiMode,OpenRouter: Step 2 — Exports
  aiMode->>OpenRouter: POST (system: exports prompt, user: content)
  OpenRouter-->>aiMode: raw JSON
  aiMode->>Validator: validateExportsStep(parsed)
  Validator-->>aiMode: { exports, hooks }
  alt validation fails
    Validator-->>aiMode: throw
    aiMode-->>CLI: Error: [AI step "exports"] ...
  end

  aiMode->>aiMode: mergeStepsToAIRawResponse(overview, exportsStep)
  aiMode-->>CLI: AIRawResponse
```

**Step 1** enforces: `summary` (string), `sideEffects`, `keywords`, `frameworks` (string arrays).  
**Step 2** enforces: `exports` (object), each value has `type`, `description`, `hook`; optional `params`, `returns`, `sideEffect`, `example`. `hooks` must be a string array.

---

## Output generation (both modes)

```mermaid
flowchart LR
  Meta[Metadata: name, version, description, exports, hooks, frameworks, ...] --> JSON[buildJsonMetadata]
  Meta --> TXT[buildTxtMetadata]
  JSON --> File1[llm.package.json]
  TXT --> File2[llm.package.txt]
```

Same merge step for static and AI: `buildJsonMetadata` and `buildTxtMetadata` consume the unified metadata shape and write the two files under the current working directory.

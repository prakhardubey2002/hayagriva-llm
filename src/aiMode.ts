/**
 * AI mode: multipart flow — small calls with progress feedback.
 * 1) Package overview. 2) List export names. 3..N) Export details in batches.
 */

import { readFileSync } from 'node:fs';
import {
  callOpenRouterWithValidator,
  validatePackageOverview,
  validateExportsStep,
  validateExportNamesList,
  type ExportsStepResult,
  type TokenUsage,
} from './openrouter.js';
import type { AIRawResponse } from './types.js';

const BATCH_SIZE = 8;
const BATCH_CONTEXT_MAX_CHARS = 24000;

const STEP_OVERVIEW_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: Produce a COMPREHENSIVE package-level overview so crawlers and LLMs can understand every use case and reason to use this package. Use the package manifest, optional source, and current llm.package.json (if provided) as reference.

Output schema — required fields first, then extensions for richer indexing:
{
  "summary": "Two to four clear sentences: what the package does, who it is for, and main value. Write so a crawler or developer can immediately understand purpose and scope.",
  "sideEffects": ["package-level side effects e.g. patches globals", "reads process.env", "modifies DOM"],
  "keywords": ["broad", "search", "terms", "ecosystem", "use-case keywords", "e.g. http, validation, react, cli", "at least 5-15 terms"],
  "frameworks": ["react", "vue", "node", "etc or empty array"],
  "whenToUse": "One paragraph: when should a developer choose this package? Describe typical scenarios (e.g. 'Use when building X', 'Choose when you need Y'). Be specific.",
  "reasonToUse": ["Reason 1: short bullet", "Reason 2: short bullet", "Reason 3: ...", "at least 3-5 reasons"],
  "useCases": ["Concrete scenario 1: e.g. Building a REST API with validation", "Scenario 2: ...", "at least 3-5 use cases"],
  "documentation": "URL to official docs or README, or 'See README' if none",
  "relatedPackages": ["npm-package-a", "alternative-or-complementary-package", "optional; empty array if none"],
  "extensions": {
    "capabilities": ["high level capabilities; 5-12 bullets"],
    "configuration": ["env vars / config knobs; if unknown: empty array"],
    "limitations": ["known limitations or non-goals; empty if none"],
    "security": ["security considerations: secrets, network, filesystem, exec; empty if none"],
    "observability": ["logs/metrics/telemetry emitted by the package (if any)"],
    "integration": ["IDE/tooling integration hints: Cursor, Antigravity, search/indexing"],
    "examples": ["short usage examples at package level (not per-export)"]
  }
}

Rules: summary 2-4 sentences. All arrays are string arrays only. Be comprehensive so each use case and reason is clear.`;

const STEP_LIST_NAMES_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: List the exact names of every exported symbol from the package. Return ONLY the names, no descriptions.

Output schema:
{
  "names": ["exportName1", "exportName2", "useMyHook", "..."]
}

Rules: "names" must be an array of strings. One entry per export. No duplicates.`;

const STEP_BATCH_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: For ONLY the export names listed below, return COMPREHENSIVE metadata so crawlers and IDEs understand what each export does, when to use it, and how. Do not add any export not in the list.

Output schema — every export must have type, description, hook; fill params, returns, example when useful:
{
  "exports": {
    "<exportName>": {
      "type": "function" | "class" | "type",
      "description": "Three to five sentences: what it does, when to use it, and main behavior. Be specific so a developer or crawler can understand without reading source.",
      "hook": false,
      "params": "Optional: parameter names and types or short signature, e.g. 'options: { key: string }, callback?: () => void'",
      "returns": "Optional: return type or one-line description of return value",
      "sideEffect": false,
      "example": "Optional: short code snippet or usage, e.g. 'createServer({ port: 3000 })' or "import { x } from 'pkg'; x()"",
      "stability": "Optional: 'stable' | 'experimental' | 'deprecated'",
      "notes": "Optional: caveats, gotchas, performance notes"
    }
  },
  "hooks": ["useX", "useY"]
}

Rules: type must be "function", "class", or "type". hook: true only for names starting with "use". Do not add exports not in the list. Provide examples when meaningful.`;

export interface AiModeInput {
  packageJsonContent: string;
  entryPath: string | null;
  includeSrc: boolean;
  /** If we can statically determine export names, pass them to avoid an extra AI call. */
  exportNames?: string[];
  existingLlmPackageJson?: string;
}

export function buildUserContent(input: AiModeInput): string {
  const { packageJsonContent, entryPath, includeSrc, existingLlmPackageJson, exportNames } = input;
  let content = 'Package manifest:\n' + packageJsonContent;
  if (existingLlmPackageJson) {
    content += '\n\nCurrent llm.package.json (use as reference):\n' + existingLlmPackageJson;
  }
  if (exportNames && exportNames.length > 0) {
    content += '\n\nExport names (from static analysis):\n' + JSON.stringify(exportNames);
  }
  if (includeSrc && entryPath) {
    try {
      content += '\n\nEntry file source:\n' + readFileSync(entryPath, 'utf-8');
    } catch {
      // omit on read error
    }
  }
  return content;
}

export interface AiProgressReport {
  current: number;
  total: number;
  message: string;
}

export type AiProgressCallback = (report: AiProgressReport) => void;

export interface AiCallReport {
  step: string;
  model: string;
  systemPromptChars: number;
  userContentChars: number;
  responseChars: number;
  usage?: TokenUsage;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type AiCallCallback = (report: AiCallReport) => void;

/**
 * Run AI mode: multipart flow with small calls and progress. Merges all batches.
 */
function addUsage(acc: TokenUsage, u: TokenUsage): void {
  acc.prompt_tokens += u.prompt_tokens;
  acc.completion_tokens += u.completion_tokens;
  acc.total_tokens += u.total_tokens;
}

export async function runAiMode(
  input: AiModeInput,
  apiKey: string,
  model: string,
  onProgress?: AiProgressCallback,
  onCall?: AiCallCallback
): Promise<AIRawResponse> {
  const userContent = buildUserContent(input);
  const totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const onUsage = (u: TokenUsage) => addUsage(totalUsage, u);

  let exportNames = input.exportNames ?? [];
  if (exportNames.length === 0) {
    onProgress?.({ current: 0, total: 0, message: 'Preflight: listing export names (AI)' });
    const namesStart = Date.now();
    let responseChars = 0;
    let rawChars = 0;
    let usage: TokenUsage | undefined;
    exportNames = await callOpenRouterWithValidator(
      {
        apiKey,
        model,
        systemPrompt: STEP_LIST_NAMES_PROMPT,
        userContent,
        onUsage,
        onMeta: (m) => {
          responseChars = m.responseChars;
          rawChars = m.rawJsonChars;
          usage = m.usage;
        },
      },
      validateExportNamesList,
      'export-names'
    );
    onCall?.({
      step: 'export-names',
      model,
      systemPromptChars: STEP_LIST_NAMES_PROMPT.length,
      userContentChars: userContent.length,
      responseChars: responseChars || rawChars,
      usage,
      startedAt: new Date(namesStart).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - namesStart,
    });
    onProgress?.({
      current: 0,
      total: 0,
      message: `Preflight: export names resolved (${exportNames.length})`,
    });
  }
  const batches: string[][] = [];
  for (let i = 0; i < exportNames.length; i += BATCH_SIZE) {
    batches.push(exportNames.slice(i, i + BATCH_SIZE));
  }

  const totalSteps = 1 + batches.length;

  onProgress?.({ current: 1, total: totalSteps, message: 'Package overview' });
  const overviewStart = Date.now();
  let overviewResponseChars = 0;
  let overviewRawChars = 0;
  let overviewUsage: TokenUsage | undefined;
  const overview = await callOpenRouterWithValidator(
    {
      apiKey,
      model,
      systemPrompt: STEP_OVERVIEW_PROMPT,
      userContent,
      onUsage,
      onMeta: (m) => {
        overviewResponseChars = m.responseChars;
        overviewRawChars = m.rawJsonChars;
        overviewUsage = m.usage;
      },
    },
    validatePackageOverview,
    'package-overview'
  );
  onCall?.({
    step: 'package-overview',
    model,
    systemPromptChars: STEP_OVERVIEW_PROMPT.length,
    userContentChars: userContent.length,
    responseChars: overviewResponseChars || overviewRawChars,
    usage: overviewUsage,
    startedAt: new Date(overviewStart).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - overviewStart,
  });

  const mergedExports: AIRawResponse['exports'] = {};
  const mergedHooks: string[] = [];

  if (batches.length === 0) {
    // nothing else
  } else {
    let packageLabel = 'this package';
    try {
      const pkg = JSON.parse(input.packageJsonContent) as { name?: string; version?: string };
      if (pkg.name) packageLabel = `${pkg.name}${pkg.version ? ` @ ${pkg.version}` : ''}`;
    } catch {
      // ignore
    }
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;
      onProgress?.({
        current: 2 + i,
        total: totalSteps,
        message: `Export details (batch ${batchNum}/${batches.length}, ${batch.length} exports)`,
      });
      const baseContext =
        userContent.length <= BATCH_CONTEXT_MAX_CHARS
          ? userContent
          : userContent.slice(0, BATCH_CONTEXT_MAX_CHARS) + '\n…(context truncated)…';
      const batchUserContent =
        `${baseContext}\n\n` +
        `Package: ${packageLabel}\n\n` +
        `Export names to describe (only these):\n${JSON.stringify(batch)}`;
      const batchStart = Date.now();
      let responseChars = 0;
      let rawChars = 0;
      let usage: TokenUsage | undefined;
      const result = await callOpenRouterWithValidator<ExportsStepResult>(
        {
          apiKey,
          model,
          systemPrompt: STEP_BATCH_PROMPT,
          userContent: batchUserContent,
          onUsage,
          onMeta: (m) => {
            responseChars = m.responseChars;
            rawChars = m.rawJsonChars;
            usage = m.usage;
          },
        },
        validateExportsStep,
        `exports-batch-${batchNum}`
      );
      onCall?.({
        step: `exports-batch-${batchNum}`,
        model,
        systemPromptChars: STEP_BATCH_PROMPT.length,
        userContentChars: batchUserContent.length,
        responseChars: responseChars || rawChars,
        usage,
        startedAt: new Date(batchStart).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - batchStart,
      });
      Object.assign(mergedExports, result.exports);
      for (const h of result.hooks) {
        if (!mergedHooks.includes(h)) mergedHooks.push(h);
      }
    }
  }

  return {
    summary: overview.summary,
    sideEffects: overview.sideEffects,
    keywords: overview.keywords,
    frameworks: overview.frameworks,
    whenToUse: overview.whenToUse,
    reasonToUse: overview.reasonToUse,
    useCases: overview.useCases,
    documentation: overview.documentation,
    relatedPackages: overview.relatedPackages,
    extensions: overview.extensions,
    exports: mergedExports,
    hooks: mergedHooks,
    usage: totalUsage.total_tokens > 0 ? totalUsage : undefined,
    inputChars: userContent.length,
    batches: { size: BATCH_SIZE, batchCount: batches.length },
  };
}

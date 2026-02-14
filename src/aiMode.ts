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
} from './openrouter.js';
import type { AIRawResponse } from './types.js';

const BATCH_SIZE = 8;

const STEP_OVERVIEW_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: Produce a COMPREHENSIVE package-level overview so crawlers and LLMs can understand every use case and reason to use this package. Use the package manifest, optional source, and current llm.package.json (if provided) as reference.

Output schema — required fields first, then optional (include them for richer indexing):
{
  "summary": "Two to four clear sentences: what the package does, who it is for, and main value. Write so a crawler or developer can immediately understand purpose and scope.",
  "sideEffects": ["package-level side effects e.g. patches globals", "reads process.env", "modifies DOM"],
  "keywords": ["broad", "search", "terms", "ecosystem", "use-case keywords", "e.g. http, validation, react, cli", "at least 5-15 terms"],
  "frameworks": ["react", "vue", "node", "etc or empty array"],
  "whenToUse": "One paragraph: when should a developer choose this package? Describe typical scenarios (e.g. 'Use when building X', 'Choose when you need Y'). Be specific.",
  "reasonToUse": ["Reason 1: short bullet", "Reason 2: short bullet", "Reason 3: ...", "at least 3-5 reasons"],
  "useCases": ["Concrete scenario 1: e.g. Building a REST API with validation", "Scenario 2: ...", "at least 3-5 use cases"],
  "documentation": "URL to official docs or README, or 'See README' if none",
  "relatedPackages": ["npm-package-a", "alternative-or-complementary-package", "optional; empty array if none"]
}

Rules: summary 2-4 sentences. All arrays are string arrays only. Be comprehensive so each use case and reason is clear.`;

const STEP_LIST_NAMES_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: List the exact names of every exported symbol from the package (from manifest and optional source). Return ONLY the names, no descriptions.

Output schema:
{
  "names": ["exportName1", "exportName2", "useMyHook", ...]
}

Rules: "names" must be an array of strings. One entry per export. No duplicates.`;

const STEP_BATCH_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: For ONLY the export names listed below, return COMPREHENSIVE metadata so crawlers and IDEs understand what each export does, when to use it, and how. Do not add any export not in the list.

Output schema — every export must have type, description, hook; fill params, returns, example when useful:
{
  "exports": {
    "<exportName>": {
      "type": "function" | "class" | "type",
      "description": "Two to three sentences: what it does, when to use it, and main behavior. Be specific so a developer or crawler can understand without reading source.",
      "hook": false,
      "params": "Optional: parameter names and types or short signature, e.g. 'options: { key: string }, callback?: () => void'",
      "returns": "Optional: return type or one-line description of return value",
      "sideEffect": false,
      "example": "Optional: short code snippet or usage, e.g. 'createServer({ port: 3000 })' or 'import { x } from "pkg"; x()'"
    }
  },
  "hooks": ["useX", "useY"]
}

Rules: type must be "function", "class", or "type". hook: true only for names starting with "use". Descriptions must be 2-3 sentences and comprehensive.`;

export interface AiModeInput {
  packageJsonContent: string;
  entryPath: string | null;
  includeSrc: boolean;
  existingLlmPackageJson?: string;
}

export function buildUserContent(input: AiModeInput): string {
  const { packageJsonContent, entryPath, includeSrc, existingLlmPackageJson } = input;
  let content = 'Package manifest:\n' + packageJsonContent;
  if (existingLlmPackageJson) {
    content += '\n\nCurrent llm.package.json (use as reference):\n' + existingLlmPackageJson;
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

/**
 * Run AI mode: multipart flow with small calls and progress. Merges all batches.
 */
export async function runAiMode(
  input: AiModeInput,
  apiKey: string,
  model: string,
  onProgress?: AiProgressCallback
): Promise<AIRawResponse> {
  const userContent = buildUserContent(input);

  // Step 1: List export names first so we know total step count (then we can show 1/N, 2/N, 3/N consistently)
  const names = await callOpenRouterWithValidator(
    { apiKey, model, systemPrompt: STEP_LIST_NAMES_PROMPT, userContent },
    validateExportNamesList,
    'export-names'
  );

  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    batches.push(names.slice(i, i + BATCH_SIZE));
  }

  const totalSteps = 2 + batches.length;
  onProgress?.({ current: 1, total: totalSteps, message: 'Listing export names' });

  // Step 2: Package overview
  onProgress?.({ current: 2, total: totalSteps, message: 'Package overview' });
  const overview = await callOpenRouterWithValidator(
    { apiKey, model, systemPrompt: STEP_OVERVIEW_PROMPT, userContent },
    validatePackageOverview,
    'package-overview'
  );

  const mergedExports: AIRawResponse['exports'] = {};
  const mergedHooks: string[] = [];

  if (batches.length === 0) {
    onProgress?.({ current: 2, total: totalSteps, message: 'No exports (list was empty)' });
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
        current: 3 + i,
        total: totalSteps,
        message: `Export details (batch ${batchNum}/${batches.length}, ${batch.length} exports)`,
      });
      const batchUserContent = `Package: ${packageLabel}\n\nExport names to describe (only these):\n${JSON.stringify(batch)}`;
      const result = await callOpenRouterWithValidator<ExportsStepResult>(
        {
          apiKey,
          model,
          systemPrompt: STEP_BATCH_PROMPT,
          userContent: batchUserContent,
        },
        validateExportsStep,
        `exports-batch-${batchNum}`
      );
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
    exports: mergedExports,
    hooks: mergedHooks,
  };
}

/**
 * AI mode: multi-step OpenRouter flow with strong guardrails.
 * Step 1: Package overview (summary, sideEffects, keywords, frameworks).
 * Step 2: Exports (names, type, description, hook, optional params/returns/sideEffect/example).
 */

import { readFileSync } from 'node:fs';
import {
  callOpenRouterWithValidator,
  validatePackageOverview,
  validateExportsStep,
  type PackageOverview,
} from './openrouter.js';
import type { AIRawResponse } from './types.js';

const STEP_OVERVIEW_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: From the package manifest (and optional source, and current llm.package.json if provided) produce a package-level overview. If current llm.package.json is given, use it as reference and update or refine the sections.

Output schema (all fields required; use empty array if none):
{
  "summary": "One short paragraph describing what this package does, for IDE search and context.",
  "sideEffects": ["list", "of", "package-level side effects e.g. patches globals, reads process.env"],
  "keywords": ["search", "terms", "e.g. http, validation, react"],
  "frameworks": ["react", "vue", "etc or empty array"]
}

Rules: summary must be 1-3 sentences. Arrays must be string arrays only.`;

const STEP_EXPORTS_PROMPT = `You are a strict metadata generator for Node.js packages. Output ONLY valid JSON, no markdown, no explanation.

Task: List every exported symbol from the package (from manifest and optional source, and current llm.package.json if provided). If current llm.package.json is given, use it as reference and update or refine the exports/hooks sections. For each export provide type, description, and whether it is a hook.

Output schema:
{
  "exports": {
    "<exportName>": {
      "type": "function" | "class" | "type",
      "description": "One-line summary of what this export does.",
      "hook": false,
      "params": "optional: e.g. url: string, options?: RequestInit",
      "returns": "optional: e.g. Promise<Response> or brief description",
      "sideEffect": false,
      "example": "optional: one-line usage example"
    }
  },
  "hooks": ["useX", "useY"]
}

Rules:
- type must be exactly "function", "class", or "type".
- description must be a non-empty string for every export.
- hook: true only for functions whose name starts with "use" (React-style hooks).
- hooks array must list exactly those export names where hook is true.
- params, returns, sideEffect, example are optional; omit if not relevant.`;

export interface AiModeInput {
  packageJsonContent: string;
  entryPath: string | null;
  includeSrc: boolean;
  /** Existing llm.package.json as JSON string; when set, AI uses it as reference to update sections. */
  existingLlmPackageJson?: string;
}

export function buildUserContent(input: AiModeInput): string {
  const { packageJsonContent, entryPath, includeSrc, existingLlmPackageJson } = input;
  let content = 'Package manifest:\n' + packageJsonContent;
  if (existingLlmPackageJson) {
    content += '\n\nCurrent llm.package.json (use as reference; update sections as needed):\n' + existingLlmPackageJson;
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

export type AiProgressCallback = (step: 'overview' | 'exports') => void;

/**
 * Run AI mode: two-step flow with strict validation, then merge into AIRawResponse.
 */
export async function runAiMode(
  input: AiModeInput,
  apiKey: string,
  model: string,
  onProgress?: AiProgressCallback
): Promise<AIRawResponse> {
  const userContent = buildUserContent(input);

  onProgress?.('overview');
  const overview = await callOpenRouterWithValidator(
    {
      apiKey,
      model,
      systemPrompt: STEP_OVERVIEW_PROMPT,
      userContent,
    },
    validatePackageOverview,
    'package-overview'
  );

  onProgress?.('exports');
  const exportsStep = await callOpenRouterWithValidator(
    {
      apiKey,
      model,
      systemPrompt: STEP_EXPORTS_PROMPT,
      userContent,
    },
    validateExportsStep,
    'exports'
  );

  return mergeStepsToAIRawResponse(overview, exportsStep);
}

function mergeStepsToAIRawResponse(
  overview: PackageOverview,
  exportsStep: { exports: AIRawResponse['exports']; hooks: string[] }
): AIRawResponse {
  return {
    summary: overview.summary,
    sideEffects: overview.sideEffects,
    keywords: overview.keywords,
    frameworks: overview.frameworks,
    exports: exportsStep.exports,
    hooks: exportsStep.hooks,
  };
}

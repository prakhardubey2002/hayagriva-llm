/**
 * Main orchestration: load package.json, detect entry, run mode, write outputs.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectEntryFile } from './parseExports.js';
import { extractStaticExports, getHooksFromExports } from './staticMode.js';
import { runAiMode } from './aiMode.js';
import { buildJsonMetadata } from './buildJsonMetadata.js';
import { buildTxtMetadata } from './buildTxtMetadata.js';
import { getVersion } from './version.js';
import { checkOpenRouterAuth } from './openrouter.js';
import {
  printAuthChecking,
  printAuthSuccess,
  printAuthFailure,
  printRateLimited,
  printAiModeHeader,
  printStep,
  printAiStepsDone,
} from './ui.js';
import type { GenerateOptions, PackageJsonLike, ExportsMap } from './types.js';
import type { AIRawResponse, LLMPackageJson } from './types.js';

const PKG_NAME = 'hayagriva-llm';

/** Keys we always generate; any other key in existing file is preserved when merging. */
const GENERATED_KEYS = new Set([
  'name', 'version', 'description', 'exports', 'hooks', 'frameworks',
  'generatedBy', 'mode', 'summary', 'sideEffects', 'keywords',
  'whenToUse', 'reasonToUse', 'useCases', 'documentation', 'relatedPackages',
]);

function loadExistingMeta(jsonPath: string): LLMPackageJson | null {
  if (!existsSync(jsonPath)) return null;
  try {
    const raw = readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    if (data === null || typeof data !== 'object') return null;
    return data as LLMPackageJson;
  } catch {
    return null;
  }
}

/**
 * Merge new metadata with existing: new content wins for known sections;
 * any extra keys from existing are preserved.
 */
function mergeWithExisting(newMeta: LLMPackageJson, existing: LLMPackageJson): LLMPackageJson {
  const merged = { ...newMeta };
  for (const key of Object.keys(existing)) {
    if (!GENERATED_KEYS.has(key)) {
      (merged as Record<string, unknown>)[key] = (existing as Record<string, unknown>)[key];
    }
  }
  return merged;
}

const KNOWN_AI_KEYS = new Set([
  'exports', 'hooks', 'frameworks', 'summary', 'sideEffects', 'keywords',
  'whenToUse', 'reasonToUse', 'useCases', 'documentation', 'relatedPackages',
]);

function getExtrasFromAIResponse(result: AIRawResponse): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (KNOWN_AI_KEYS.has(key) || value === undefined || value === null) continue;
    extras[key] = value;
  }
  return extras;
}

function loadPackageJson(cwd: string): PackageJsonLike {
  const path = resolve(cwd, 'package.json');
  if (!existsSync(path)) {
    throw new Error(
      `No package.json found at ${path}. Run this command from your package root (where package.json lives).`
    );
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as PackageJsonLike;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw new Error(`Failed to load package.json at ${path}: ${err.message}`);
  }
}

export async function generate(cwd: string, options: GenerateOptions): Promise<void> {
  const { mode, apiKey, model, includeSrc, verbose } = options;
  const log = verbose ? (msg: string) => console.error('[hayagriva-llm]', msg) : () => { };

  const jsonPath = resolve(cwd, 'llm.package.json');
  const txtPath = resolve(cwd, 'llm.package.txt');
  const existing = loadExistingMeta(jsonPath);
  if (existing) log('Using existing llm.package.json as reference');

  log('Loading package.json');
  const packageJson = loadPackageJson(cwd);

  log('Detecting entry file');
  const entryPath = detectEntryFile(packageJson, cwd);
  if (!entryPath) {
    log('No entry file found; exports will be empty in static mode.');
  } else {
    log('Entry: ' + entryPath);
  }

  let exports: ExportsMap;
  let hooks: string[];
  let frameworks: string[] = [];
  let summary: string | undefined;
  let sideEffects: string[] | undefined;
  let keywords: string[] | undefined;
  let whenToUse: string | undefined;
  let reasonToUse: string[] | undefined;
  let useCases: string[] | undefined;
  let documentation: string | undefined;
  let relatedPackages: string[] | undefined;
  let extras: Record<string, unknown> = {};

  if (mode === 'static') {
    if (entryPath) {
      exports = extractStaticExports(entryPath);
      hooks = getHooksFromExports(exports);
    } else {
      exports = {};
      hooks = [];
    }
  } else {
    const key = apiKey ?? process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!key || key.trim() === '') {
      throw new Error('AI mode requires --api-key or OPEN_ROUTER_API_KEY (or OPENROUTER_API_KEY)');
    }
    printAiModeHeader();
    printAuthChecking();
    let authResult: Awaited<ReturnType<typeof checkOpenRouterAuth>>;
    try {
      authResult = await checkOpenRouterAuth(key.trim(), model);
    } catch (e) {
      printAuthFailure(e instanceof Error ? e.message : String(e));
      throw e;
    }
    if (!authResult.ok) {
      if (authResult.reason === 'rate_limited') {
        printRateLimited(authResult.message);
        throw new Error('OpenRouter model rate-limited (429). Retry later or use another model (OPEN_ROUTER_MODEL).');
      }
      printAuthFailure('invalid or unauthorized API key');
      throw new Error('OpenRouter API key invalid or unauthorized (401)');
    }
    printAuthSuccess();
    const onProgress = (report: { current: number; total: number; message: string }) => {
      printStep(report.current, report.total, report.message);
    };
    const result = await runAiMode(
      {
        packageJsonContent: JSON.stringify(packageJson, null, 2),
        entryPath,
        includeSrc,
        existingLlmPackageJson: existing ? JSON.stringify(existing, null, 2) : undefined,
      },
      key.trim(),
      model,
      onProgress
    );
    printAiStepsDone();
    exports = result.exports;
    hooks = result.hooks ?? [];
    frameworks = result.frameworks ?? [];
    summary = result.summary;
    sideEffects = result.sideEffects;
    keywords = result.keywords;
    whenToUse = result.whenToUse;
    reasonToUse = result.reasonToUse;
    useCases = result.useCases;
    documentation = result.documentation;
    relatedPackages = result.relatedPackages;
    extras = getExtrasFromAIResponse(result);
  }

  const generatedBy = `${PKG_NAME}@${getVersion()}`;
  const meta = buildJsonMetadata({
    packageJson,
    exports,
    hooks,
    frameworks,
    mode,
    generatedBy,
    summary,
    sideEffects,
    keywords,
    whenToUse,
    reasonToUse,
    useCases,
    documentation,
    relatedPackages,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  });

  const finalMeta = existing ? mergeWithExisting(meta, existing) : meta;

  writeFileSync(jsonPath, JSON.stringify(finalMeta, null, 2) + '\n', 'utf-8');
  writeFileSync(txtPath, buildTxtMetadata(finalMeta), 'utf-8');

  // Always print outcome so user sees feedback even without --verbose
  if (existing) {
    console.log('Updated llm.package.json (merged with existing)');
    console.log('Updated llm.package.txt');
  } else {
    console.log('Created llm.package.json');
    console.log('Created llm.package.txt');
  }
  log('Paths: ' + jsonPath + ', ' + txtPath);
}

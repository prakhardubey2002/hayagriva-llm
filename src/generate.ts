/**
 * Main orchestration: load package.json, detect entry, run mode, write outputs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectEntryFile } from './parseExports.js';
import { extractStaticExports, getHooksFromExports } from './staticMode.js';
import { runAiMode } from './aiMode.js';
import { buildJsonMetadata } from './buildJsonMetadata.js';
import { buildTxtMetadata } from './buildTxtMetadata.js';
import { buildRuleMdc } from './buildRuleMdc.js';
import { getVersion } from './version.js';
import { checkOpenRouterAuth, checkOpenRouterAuthTryModels } from './openrouter.js';
import { getModelIds } from './freeLlmRouter.js';
import { appendRunJsonl, newRunId, writeLastRun, type AiCallAnalytics, type GenerateRunAnalytics } from './observability.js';
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
 * existing content is preserved when new omits optional keys.
 */
function mergeWithExisting(newMeta: LLMPackageJson, existing: LLMPackageJson): LLMPackageJson {
  const merged: LLMPackageJson = { ...(existing as LLMPackageJson), ...(newMeta as LLMPackageJson) };
  const a = existing.extensions;
  const b = newMeta.extensions;
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    merged.extensions = { ...(a as Record<string, unknown>), ...(b as Record<string, unknown>) };
  }
  return merged;
}

const KNOWN_AI_KEYS = new Set([
  'exports', 'hooks', 'frameworks', 'summary', 'sideEffects', 'keywords',
  'whenToUse', 'reasonToUse', 'useCases', 'documentation', 'relatedPackages',
  'extensions',
  // observability-only keys (never written into llm.package.json)
  'usage', 'inputChars', 'batches',
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

/** Safe filename slug from package name for .mdc rule file. */
function ruleFilenameFromPackageName(name: string): string {
  const slug = name.replace(/@/g, '').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'project';
  return `${slug}.mdc`;
}

export async function generate(cwd: string, options: GenerateOptions): Promise<void> {
  const { mode, apiKey, model, includeSrc, verbose, generateRule, freeLlmRouter } = options;
  const log = verbose ? (msg: string) => console.error('[hayagriva-llm]', msg) : () => { };

  const jsonPath = resolve(cwd, 'llm.package.json');
  const txtPath = resolve(cwd, 'llm.package.txt');
  const existing = loadExistingMeta(jsonPath);
  if (existing) log('Using existing llm.package.json as reference');

  const run: GenerateRunAnalytics = {
    id: newRunId(),
    command: 'generate',
    cwd,
    startedAt: new Date().toISOString(),
    node: { version: process.version, platform: process.platform, arch: process.arch },
    package: { name: 'unknown', version: '0.0.0', entryPath: null },
    flags: {
      mode,
      includeSrc: Boolean(includeSrc),
      verbose: Boolean(verbose),
      apiKeyProvided: Boolean(apiKey && apiKey.trim() !== ''),
      model,
      ...(freeLlmRouter ? { freeLlmRouter: true } : {}),
    },
  };

  log('Loading package.json');
  const packageJson = loadPackageJson(cwd);
  run.package = {
    name: packageJson.name ?? 'unknown',
    version: packageJson.version ?? '0.0.0',
    description: typeof packageJson.description === 'string' ? packageJson.description : undefined,
    entryPath: null,
  };

  log('Detecting entry file');
  const entryPath = detectEntryFile(packageJson, cwd);
  run.package.entryPath = entryPath;
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
  let extensions: Record<string, unknown> | undefined;
  let extras: Record<string, unknown> = {};

  try {
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
      let freeRouterModelIds: string[] | undefined;
      let freeRouterRequestId: string | undefined;
      if (freeLlmRouter) {
        log('Fetching free model list from Free LLM Router (cached ~15m in-process)');
        const { ids, requestId } = await getModelIds(['chat'], 'capable', 25);
        if (!ids.length) {
          throw new Error(
            'Free LLM Router returned no models; check FREE_LLM_ROUTER_API_KEY (get a key: https://freellmrouter.com/dashboard?tab=api) and https://freellmrouter.com/docs'
          );
        }
        freeRouterModelIds = ids;
        freeRouterRequestId = requestId;
        if (verbose) {
          log(`Free LLM Router: ${ids.length} candidate model(s), requestId=${requestId ?? 'n/a'}`);
        }
      }
      printAiModeHeader();
      printAuthChecking();
      let authResult: Awaited<ReturnType<typeof checkOpenRouterAuth>>;
      try {
        authResult = freeRouterModelIds?.length
          ? await checkOpenRouterAuthTryModels(key.trim(), freeRouterModelIds)
          : await checkOpenRouterAuth(key.trim(), model);
      } catch (e) {
        printAuthFailure(e instanceof Error ? e.message : String(e));
        throw e;
      }
      if (!authResult.ok) {
        if (authResult.reason === 'rate_limited') {
          printRateLimited(authResult.message);
          throw new Error(
            freeRouterModelIds?.length
              ? 'OpenRouter: all Free LLM Router candidate models failed or were rate-limited (429). Retry later.'
              : 'OpenRouter model rate-limited (429). Retry later or use another model (OPEN_ROUTER_MODEL).'
          );
        }
        printAuthFailure('invalid or unauthorized API key');
        throw new Error('OpenRouter API key invalid or unauthorized (401)');
      }
      printAuthSuccess();

      // Prefer local export discovery so step counts are stable and we reduce AI overhead.
      let exportNames: string[] = [];
      if (entryPath) {
        try {
          const staticExports = extractStaticExports(entryPath);
          exportNames = Object.keys(staticExports);
        } catch {
          exportNames = [];
        }
      }

      const onProgress = (report: { current: number; total: number; message: string }) => {
        printStep(report.current, report.total, report.message);
      };

      const aiCalls: AiCallAnalytics[] = [];

      const result = await runAiMode(
        {
          packageJsonContent: JSON.stringify(packageJson, null, 2),
          entryPath,
          includeSrc,
          exportNames,
          existingLlmPackageJson: existing ? JSON.stringify(existing, null, 2) : undefined,
        },
        key.trim(),
        model,
        onProgress,
        (c) => {
          aiCalls.push({
            step: c.step,
            startedAt: c.startedAt,
            finishedAt: c.finishedAt,
            durationMs: c.durationMs,
            model: c.model,
            systemPromptChars: c.systemPromptChars,
            userContentChars: c.userContentChars,
            responseChars: c.responseChars,
            usage: c.usage,
          });
        },
        freeRouterModelIds?.length
          ? { freeRouter: { modelIds: freeRouterModelIds, requestId: freeRouterRequestId } }
          : undefined
      );
      printAiStepsDone();

      run.ai = {
        calls: aiCalls,
        totals: result.usage,
        inputChars: result.inputChars,
        batches: result.batches,
      };

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
      extensions = typeof result.extensions === 'object' && result.extensions ? (result.extensions as Record<string, unknown>) : undefined;
      extras = getExtrasFromAIResponse(result);
    }
  } catch (e) {
    run.ok = false;
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - Date.parse(run.startedAt);
    run.error = { message: e instanceof Error ? e.message : String(e) };
    writeLastRun(cwd, run);
    appendRunJsonl(cwd, run);
    throw e;
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
    extensions,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  });

  const finalMeta = existing ? mergeWithExisting(meta, existing) : meta;

  writeFileSync(jsonPath, JSON.stringify(finalMeta, null, 2) + '\n', 'utf-8');
  writeFileSync(txtPath, buildTxtMetadata(finalMeta), 'utf-8');

  let rulePath: string | undefined;
  if (generateRule) {
    const rulesDir = resolve(cwd, '.cursor', 'rules');
    if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });
    const ruleFile = ruleFilenameFromPackageName(finalMeta.name);
    rulePath = resolve(rulesDir, ruleFile);
    writeFileSync(rulePath, buildRuleMdc(finalMeta), 'utf-8');
  }

  // Always print outcome so user sees feedback even without --verbose
  if (existing) {
    console.log('Updated llm.package.json (merged with existing)');
    console.log('Updated llm.package.txt');
  } else {
    console.log('Created llm.package.json');
    console.log('Created llm.package.txt');
  }
  if (rulePath) console.log('Created ' + rulePath);
  log('Paths: ' + jsonPath + ', ' + txtPath + (rulePath ? ', ' + rulePath : ''));

  run.ok = true;
  run.finishedAt = new Date().toISOString();
  run.durationMs = Date.now() - Date.parse(run.startedAt);
  run.outputs = { jsonPath, txtPath, action: existing ? 'updated' : 'created' };
  writeLastRun(cwd, run);
  appendRunJsonl(cwd, run);

  console.log(`Dashboard: run "hayagriva-llm dashboard" (serves ${resolve(cwd, '.hayagriva-llm')})`);
}

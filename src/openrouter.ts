/**
 * OpenRouter API client. Supports single-call and multi-step flows with strict validators.
 */

import type { ExportMeta, ExportsMap } from './types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Thrown when OpenRouter returns a non-OK HTTP status (used for fallback and feedback). */
export class OpenRouterHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenRouterHttpError';
    this.status = status;
  }
}

/** Map HTTP status to Free LLM Router feedback issue type. */
export function issueFromHttpStatus(status: number): 'rate_limited' | 'unavailable' | 'error' {
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'error';
}

/** Result of auth/availability check: ok, unauthorized (401), or rate-limited (429). */
export type AuthCheckResult = { ok: true } | { ok: false; reason: 'unauthorized' } | { ok: false; reason: 'rate_limited'; message: string };

/**
 * Minimal request to validate API key and model availability.
 * Returns { ok: true }, { ok: false, reason: 'unauthorized' } on 401, or { ok: false, reason: 'rate_limited', message } on 429.
 */
export async function checkOpenRouterAuth(apiKey: string, model: string): Promise<AuthCheckResult> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'x' }],
      max_tokens: 1,
    }),
  });
  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (res.status === 429) {
    const text = await res.text();
    return { ok: false, reason: 'rate_limited', message: text.slice(0, 400) };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterHttpError(res.status, `OpenRouter API error ${res.status}: ${text.slice(0, 300)}`);
  }
  return { ok: true };
}

/**
 * Try OpenRouter auth with the first model that succeeds. Stops on 401 (invalid key).
 * Other failures try the next candidate (Free LLM Router free-model list).
 */
export async function checkOpenRouterAuthTryModels(
  apiKey: string,
  models: string[]
): Promise<AuthCheckResult> {
  if (models.length === 0) {
    return { ok: false, reason: 'rate_limited', message: 'No candidate models from Free LLM Router' };
  }
  let last429 = '';
  for (const model of models) {
    try {
      const r = await checkOpenRouterAuth(apiKey, model);
      if (r.ok) return { ok: true };
      if (r.reason === 'unauthorized') return r;
      last429 = r.message;
    } catch (e) {
      if (e instanceof OpenRouterHttpError && e.status === 401) {
        return { ok: false, reason: 'unauthorized' };
      }
      last429 = e instanceof Error ? e.message : String(e);
    }
  }
  if (last429) return { ok: false, reason: 'rate_limited', message: last429 };
  return { ok: false, reason: 'rate_limited', message: 'All candidate models failed auth check' };
}

/** Token usage from OpenRouter API response. */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  /** Called with usage from the API response when present (for observability). */
  onUsage?: (usage: TokenUsage) => void;
  /** Called with response metadata (usage + sizes) for per-call analytics. */
  onMeta?: (meta: { usage?: TokenUsage; responseChars: number; rawJsonChars: number }) => void;
}

/**
 * Strips markdown code fence if present. Handles ```json ... ```, ``` ... ```, and inline text.
 */
export function stripMarkdownJson(raw: string): string {
  let trimmed = raw.trim();
  // Remove optional leading BOM or whitespace
  trimmed = trimmed.replace(/^\uFEFF/, '');
  // Try: ```json ... ``` or ``` ... ``` (multiline; content may have newlines)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    trimmed = codeBlockMatch[1].trim();
  }
  // If still no JSON object, try extracting first { ... } (nested braces)
  if (!trimmed.startsWith('{')) {
    const start = trimmed.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < trimmed.length; i++) {
        if (trimmed[i] === '{') depth++;
        else if (trimmed[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) trimmed = trimmed.slice(start, end + 1);
    }
  }
  return trimmed;
}

function normalizeJsonForParsing(raw: string): string {
  let s = raw.trim();
  // Replace “smart quotes” with ASCII quotes (common model formatting issue)
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // Remove trailing commas in objects/arrays: { "a": 1, } or [1,2,]
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function parseJsonWithSmallRepairs(rawJson: string): unknown {
  const normalized = normalizeJsonForParsing(rawJson);
  return JSON.parse(normalized) as unknown;
}

/**
 * Low-level: send request, return parsed JSON (no validation).
 * Throws on HTTP error, missing content, or invalid JSON.
 */
export async function callOpenRouterRaw(options: OpenRouterOptions): Promise<unknown> {
  const { apiKey, model, systemPrompt, userContent } = options;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new OpenRouterHttpError(res.status, `OpenRouter API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter response missing choices[0].message.content');
  }
  const u = data?.usage;
  const usage: TokenUsage | undefined =
    u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
      ? {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : u.prompt_tokens + u.completion_tokens,
      }
      : undefined;
  if (usage && options.onUsage) options.onUsage(usage);

  const rawJson = stripMarkdownJson(content);
  if (options.onMeta) {
    options.onMeta({ usage, responseChars: content.length, rawJsonChars: rawJson.length });
  }
  try {
    return parseJsonWithSmallRepairs(rawJson);
  } catch {
    const snippet = rawJson.slice(0, 500);
    const hint = rawJson.includes('```') ? ' (Response may be in a code block; strip failed.)' : '';
    throw new Error(
      'OpenRouter returned invalid JSON.' + hint + ' Raw (first 500 chars): ' + snippet
    );
  }
}

/**
 * Call OpenRouter and validate response with a strict validator. Throws on validation failure.
 */
export async function callOpenRouterWithValidator<T>(
  options: OpenRouterOptions,
  validate: (parsed: unknown) => T,
  stepName: string
): Promise<T> {
  const parsed = await callOpenRouterRaw(options);
  try {
    return validate(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[AI step "${stepName}"] Validation failed: ${msg}`);
  }
}

export type FreeRouterFeedbackIssue = 'error' | 'rate_limited' | 'unavailable';

export interface FreeRouterCallFeedback {
  requestId?: string;
  onSuccess: (modelId: string) => void;
  onIssue: (modelId: string, issue: FreeRouterFeedbackIssue, details?: string) => void;
}

/**
 * Try OpenRouter models in order until one returns valid JSON for the step.
 * Optional feedback hooks for [Free LLM Router](https://freellmrouter.com/docs).
 */
export async function callOpenRouterWithValidatorTryModels<T>(
  base: Omit<OpenRouterOptions, 'model'>,
  models: string[],
  validate: (parsed: unknown) => T,
  stepName: string,
  feedback?: FreeRouterCallFeedback
): Promise<{ result: T; modelUsed: string }> {
  if (models.length === 0) {
    throw new Error(`[AI step "${stepName}"] No OpenRouter models to try`);
  }
  let lastError: Error | undefined;
  for (const model of models) {
    try {
      const result = await callOpenRouterWithValidator({ ...base, model }, validate, stepName);
      feedback?.onSuccess(model);
      return { result, modelUsed: model };
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e);
      if (e instanceof OpenRouterHttpError) {
        feedback?.onIssue(model, issueFromHttpStatus(e.status), details);
      } else {
        feedback?.onIssue(model, 'error', details);
      }
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error(`[AI step "${stepName}"] All models failed`);
}

// --- Strict validators for multi-step AI ---

export interface PackageOverview {
  summary: string;
  sideEffects: string[];
  keywords: string[];
  frameworks: string[];
  whenToUse?: string;
  reasonToUse?: string[];
  useCases?: string[];
  documentation?: string;
  relatedPackages?: string[];
  extensions?: Record<string, unknown>;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

/**
 * Guardrail: Step 1 response must have summary (string), sideEffects, keywords, frameworks (string[]).
 * Optional: whenToUse, reasonToUse, useCases, documentation, relatedPackages.
 */
export function validatePackageOverview(parsed: unknown): PackageOverview {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.summary !== 'string') {
    throw new Error('Missing or invalid "summary" (must be a string)');
  }
  if (!isStringArray(o.sideEffects)) {
    throw new Error('"sideEffects" must be an array of strings');
  }
  if (!isStringArray(o.keywords)) {
    throw new Error('"keywords" must be an array of strings');
  }
  if (!isStringArray(o.frameworks)) {
    throw new Error('"frameworks" must be an array of strings');
  }
  const out: PackageOverview = {
    summary: o.summary.trim(),
    sideEffects: o.sideEffects,
    keywords: o.keywords,
    frameworks: o.frameworks,
  };
  if (typeof o.whenToUse === 'string') out.whenToUse = o.whenToUse.trim();
  if (isStringArray(o.reasonToUse)) out.reasonToUse = o.reasonToUse;
  if (isStringArray(o.useCases)) out.useCases = o.useCases;
  if (typeof o.documentation === 'string') out.documentation = o.documentation.trim();
  if (isStringArray(o.relatedPackages)) out.relatedPackages = o.relatedPackages;
  if (o.extensions && typeof o.extensions === 'object') out.extensions = o.extensions as Record<string, unknown>;
  return out;
}

function isExportKind(s: string): s is ExportMeta['type'] {
  return s === 'function' || s === 'class' || s === 'type';
}

function normalizeExportEntry(name: string, value: unknown): ExportMeta | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const type = v.type as string;
  if (!isExportKind(type)) return null;
  const description = typeof v.description === 'string' ? v.description : '';
  const hook = Boolean(v.hook);
  const base: ExportMeta = { type, description, hook };
  const optionalKeys = ['params', 'returns', 'sideEffect', 'example'] as const;
  for (const key of optionalKeys) {
    const val = v[key];
    if (typeof val === 'string') (base as Record<string, unknown>)[key] = val;
    else if (key === 'sideEffect' && typeof val === 'boolean') (base as Record<string, unknown>)[key] = val;
  }
  for (const [key, val] of Object.entries(v)) {
    if (['type', 'description', 'hook', ...optionalKeys].includes(key)) continue;
    if (val !== undefined && val !== null) (base as Record<string, unknown>)[key] = val;
  }
  return base;
}

export interface ExportsStepResult {
  exports: ExportsMap;
  hooks: string[];
}

/**
 * Guardrail: Step 2 response must have exports (object) and hooks (string[]). Each export: type, description, hook.
 */
export function validateExportsStep(parsed: unknown): ExportsStepResult {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  if (o.exports === null || typeof o.exports !== 'object') {
    throw new Error('Missing or invalid "exports" (must be an object)');
  }
  const exportsMap: ExportsMap = {};
  for (const [name, value] of Object.entries(o.exports)) {
    const entry = normalizeExportEntry(name, value);
    if (entry) exportsMap[name] = entry;
  }
  const hooks = isStringArray(o.hooks) ? o.hooks : [];
  return { exports: exportsMap, hooks };
}

/**
 * Validator for "list export names only" step. Returns array of export names.
 */
export function validateExportNamesList(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  if (!isStringArray(o.names)) {
    throw new Error('Missing or invalid "names" (must be an array of strings)');
  }
  return o.names;
}

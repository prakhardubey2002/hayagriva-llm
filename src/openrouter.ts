/**
 * OpenRouter API client. Supports single-call and multi-step flows with strict validators.
 */

import type { ExportMeta, ExportsMap } from './types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
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
    throw new Error(`OpenRouter API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter response missing choices[0].message.content');
  }

  const rawJson = stripMarkdownJson(content);
  try {
    return JSON.parse(rawJson) as unknown;
  } catch (parseErr) {
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

// --- Strict validators for multi-step AI ---

export interface PackageOverview {
  summary: string;
  sideEffects: string[];
  keywords: string[];
  frameworks: string[];
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

/**
 * Guardrail: Step 1 response must have exactly summary (string), sideEffects, keywords, frameworks (string[]).
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
  return {
    summary: o.summary.trim(),
    sideEffects: o.sideEffects,
    keywords: o.keywords,
    frameworks: o.frameworks,
  };
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

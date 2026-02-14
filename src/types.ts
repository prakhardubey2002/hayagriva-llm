/**
 * Core types for hayagriva-llm metadata generation.
 * Extensible for AI/adapters: extra fields are preserved.
 */

export type ExportKind = 'function' | 'class' | 'type';

/** Core export fields; AI/adapters may add more (params, returns, sideEffect, etc.). */
export interface ExportMeta {
  type: ExportKind;
  description: string;
  hook: boolean;
  /** Optional: for IDE/search (e.g. param names, signature). */
  params?: string;
  /** Optional: return type or one-liner. */
  returns?: string;
  /** Optional: true if has side effects (IO, mutates state). */
  sideEffect?: boolean;
  /** Optional: example usage or snippet. */
  example?: string;
  [key: string]: unknown;
}

export interface ExportsMap {
  [name: string]: ExportMeta;
}

/** Extended metadata for IDE/indexing (Cursor, Antigravity, etc.). */
export interface LLMPackageJson {
  name: string;
  version: string;
  description: string;
  /** One-paragraph summary for search/context (AI mode). */
  summary?: string;
  /** Side effects at package level (e.g. "patches globals", "reads env"). */
  sideEffects?: string[];
  /** Search/keyword hints. */
  keywords?: string[];
  exports: ExportsMap;
  hooks: string[];
  frameworks: string[];
  generatedBy: string;
  mode: 'static' | 'ai';
  /** Preserve any extra fields from AI/adapters so structure doesn't break. */
  [key: string]: unknown;
}

export interface PackageJsonLike {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  module?: string;
  source?: string;
  [key: string]: unknown;
}

export interface GenerateOptions {
  mode: 'static' | 'ai';
  apiKey?: string;
  model: string;
  includeSrc: boolean;
  verbose: boolean;
}

/** AI response: only exports required; rest optional and extensible. */
export interface AIRawResponse {
  exports: Record<string, ExportMeta>;
  hooks?: string[];
  frameworks?: string[];
  summary?: string;
  sideEffects?: string[];
  keywords?: string[];
  [key: string]: unknown;
}

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

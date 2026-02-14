/**
 * Build llm.package.json structure. Supports extended AI fields and pass-through extras.
 */

import type { LLMPackageJson, ExportsMap, PackageJsonLike } from './types.js';

export interface JsonMetadataInput {
  packageJson: PackageJsonLike;
  exports: ExportsMap;
  hooks: string[];
  frameworks: string[];
  mode: 'static' | 'ai';
  generatedBy: string;
  /** From AI or static extension. */
  summary?: string;
  sideEffects?: string[];
  keywords?: string[];
  whenToUse?: string;
  reasonToUse?: string[];
  useCases?: string[];
  documentation?: string;
  relatedPackages?: string[];
  /** Any extra keys (e.g. from AI adapter) to preserve. */
  extras?: Record<string, unknown>;
}

export function buildJsonMetadata(input: JsonMetadataInput): LLMPackageJson {
  const {
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
    extras = {},
  } = input;

  const base: LLMPackageJson = {
    name: packageJson.name ?? 'unknown',
    version: packageJson.version ?? '0.0.0',
    description: typeof packageJson.description === 'string' ? packageJson.description : '',
    exports,
    hooks,
    frameworks,
    generatedBy,
    mode,
  };

  if (summary !== undefined) base.summary = summary;
  if (sideEffects !== undefined) base.sideEffects = sideEffects;
  if (keywords !== undefined) base.keywords = keywords;
  if (whenToUse !== undefined) base.whenToUse = whenToUse;
  if (reasonToUse !== undefined) base.reasonToUse = reasonToUse;
  if (useCases !== undefined) base.useCases = useCases;
  if (documentation !== undefined) base.documentation = documentation;
  if (relatedPackages !== undefined) base.relatedPackages = relatedPackages;

  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && value !== null && !(key in base)) {
      (base as Record<string, unknown>)[key] = value;
    }
  }

  return base;
}

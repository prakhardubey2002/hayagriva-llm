/**
 * Resolves the entry file for package metadata extraction.
 * Priority: source → module → main → src/index.ts → index.ts
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PackageJsonLike } from './types.js';

const CANDIDATE_ENTRIES = [
  (pkg: PackageJsonLike) => pkg.source,
  (pkg: PackageJsonLike) => pkg.module,
  (pkg: PackageJsonLike) => pkg.main,
] as const;

const FALLBACK_PATHS = ['src/index.ts', 'index.ts', 'src/index.js', 'index.js'];

/**
 * Detects the package entry file from package.json and cwd.
 * Returns absolute path or null if none found.
 */
export function detectEntryFile(
  packageJson: PackageJsonLike,
  cwd: string
): string | null {
  for (const getField of CANDIDATE_ENTRIES) {
    const value = getField(packageJson);
    if (typeof value === 'string' && value.trim()) {
      const candidate = resolve(cwd, value);
      if (existsSync(candidate)) return candidate;
    }
  }

  for (const rel of FALLBACK_PATHS) {
    const candidate = resolve(cwd, rel);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

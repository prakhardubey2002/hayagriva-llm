import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgentMd } from './buildAgentMd.js';

export function generateAgentMd(
  cwd: string,
  options?: { outFile?: string; force?: boolean }
): { path: string; action: 'created' | 'updated' } {
  const file = options?.outFile?.trim() ? options.outFile.trim() : 'AGENT.md';
  const path = resolve(cwd, file);
  const existed = existsSync(path);
  if (existed && !options?.force) {
    throw new Error(`Refusing to overwrite existing ${file}. Re-run with --force to overwrite.`);
  }
  const content = buildAgentMd(cwd);
  writeFileSync(path, content, 'utf-8');
  return { path, action: existed ? 'updated' : 'created' };
}


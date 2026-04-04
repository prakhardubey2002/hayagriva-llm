import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LLMPackageJson, PackageJsonLike } from './types.js';
import { getVersion } from './version.js';

function safeReadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function getRepoPackageJson(cwd: string): PackageJsonLike | null {
  return safeReadJson<PackageJsonLike>(resolve(cwd, 'package.json'));
}

function getLlmPackageJson(cwd: string): LLMPackageJson | null {
  return safeReadJson<LLMPackageJson>(resolve(cwd, 'llm.package.json'));
}

function bullets(items: string[] | undefined): string[] {
  if (!items || items.length === 0) return ['- (none)'];
  return items.map((x) => `- ${x}`);
}

function codeBlock(lines: string[]): string[] {
  return ['```', ...lines, '```'];
}

function formatExports(meta: LLMPackageJson | null): string[] {
  if (!meta) {
    return [
      '- (not available — run `hayagriva-llm generate` to create `llm.package.json`, then re-run this command)',
    ];
  }
  const entries = Object.entries(meta.exports ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return ['- (none detected)'];

  const lines: string[] = [];
  for (const [name, info] of entries) {
    const tag = info.hook ? ' (hook)' : '';
    const desc = typeof info.description === 'string' && info.description.trim() ? ` — ${info.description.trim()}` : '';
    lines.push(`- \`${name}\`${tag}${desc}`);
  }
  return lines;
}

export function buildAgentMd(cwd: string): string {
  const pkg = getRepoPackageJson(cwd);
  const llm = getLlmPackageJson(cwd);

  const name = llm?.name ?? pkg?.name ?? 'this project';
  const version = llm?.version ?? pkg?.version;
  const description =
    llm?.summary ??
    (typeof pkg?.description === 'string' ? pkg.description : undefined) ??
    (llm?.description ? llm.description : undefined) ??
    '';

  const generatedBy = `hayagriva-llm@${getVersion()}`;

  const out: string[] = [];
  out.push('# AGENT.md', '');

  out.push('## Purpose', '');
  out.push(`This file gives coding agents a reliable, repo-specific operating manual for **${name}**.`, '');
  if (description) out.push(description, '');

  out.push('## Quickstart', '');
  out.push(...codeBlock(['npm install', 'npm test', 'npm run lint', 'npm run build']), '');

  out.push('## Common commands', '');
  out.push('- **Generate LLM metadata**:', '');
  out.push(...codeBlock(['npx hayagriva-llm generate', '# or', 'hayagriva-llm generate']), '');
  out.push('- **Start local dashboard**:', '');
  out.push(...codeBlock(['npx hayagriva-llm dashboard', '# or', 'hayagriva-llm dashboard --port 4177']), '');
  out.push('- **Generate this file**:', '');
  out.push(...codeBlock(['npx hayagriva-llm agent', '# or', 'hayagriva-llm agent']), '');

  out.push('## Project snapshot', '');
  out.push(`- **name**: ${name}`);
  if (version) out.push(`- **version**: ${version}`);
  if (pkg?.type) out.push(`- **module type**: ${String(pkg.type)}`);
  if (pkg?.main) out.push(`- **main**: ${String(pkg.main)}`);
  if (pkg?.module) out.push(`- **module**: ${String(pkg.module)}`);
  if (pkg?.source) out.push(`- **source**: ${String(pkg.source)}`);
  out.push('');

  out.push('## Package behavior (from llm.package.json)', '');
  out.push('- **mode used to generate llm metadata**:', `  - ${llm?.mode ?? '(unknown)'}`);
  out.push('- **frameworks**:', ...bullets(llm?.frameworks), '');
  out.push('- **hooks**:', ...bullets(llm?.hooks), '');
  out.push('- **side effects**:', ...bullets(llm?.sideEffects), '');
  out.push('- **keywords**:', ...bullets(llm?.keywords), '');

  out.push('## API surface (exports)', '');
  out.push(...formatExports(llm), '');

  out.push('## Repo map (expected)', '');
  out.push('- **`src/`**: CLI + generation logic');
  out.push('- **`test/`**: Vitest tests');
  out.push('- **`website/`**: Docusaurus docs');
  out.push('- **`dist/`**: build output (published)');
  out.push('');

  out.push('## Agent workflow', '');
  out.push('- **Understand intent**: read `README.md`, then relevant source under `src/`.');
  out.push('- **Prefer small, safe changes**: keep public CLI behavior stable.');
  out.push(
    '- **Follow existing patterns**: ESM, `commander`, `ts-morph` for static mode, OpenRouter only in AI mode; optional `--freellmrouter` + `FREE_LLM_ROUTER_API_KEY` for ranked free models.'
  );
  out.push('- **After edits**: run lint/tests/build locally if you are allowed in your environment.');
  out.push('');

  out.push('## Conventions', '');
  out.push('- **Node**: 18+');
  out.push('- **Module system**: ESM (`"type": "module"`)');
  out.push('- **CLI**: `src/cli.ts` with `commander`');
  out.push('- **Generated artifacts**: `llm.package.json`, `llm.package.txt`, optional `.cursor/rules/*.mdc`');
  out.push('');

  out.push('## Release & publishing notes', '');
  out.push('- `npm publish` runs lint/tests/build via `prepublishOnly`.');
  out.push('- Only `dist/` is published (see `files` in `package.json`).');
  out.push('');

  out.push('## Troubleshooting', '');
  out.push('- **AI mode auth errors**: set `OPEN_ROUTER_API_KEY` (or pass `--api-key`).');
  out.push('- **No exports found**: ensure your `package.json` entry/exports points to the right file.');
  out.push('- **Rule generation**: pass `--rule` to `generate` to write `.cursor/rules/<pkg>.mdc`.');
  out.push('');

  out.push('---', '');
  out.push(`*Generated by ${generatedBy} on ${new Date().toISOString()}.*`, '');

  return out.join('\n');
}


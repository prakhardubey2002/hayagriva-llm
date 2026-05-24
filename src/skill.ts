/**
 * Generate Cursor / Claude Agent Skills (SKILL.md) with static template or single AI call.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  buildSkillMdContent,
  slugifySkillName,
  validateSkillName,
  type SkillTemplateInput,
} from './buildSkillMd.js';
import { runSkillAiMode } from './skillAiMode.js';
import {
  checkOpenRouterAuth,
  checkOpenRouterAuthTryModels,
} from './openrouter.js';
import { getModelIds } from './freeLlmRouter.js';
import type { LLMPackageJson, PackageJsonLike } from './types.js';
import {
  printAiModeHeader,
  printAuthChecking,
  printAuthFailure,
  printAuthSuccess,
  printRateLimited,
  printStep,
} from './ui.js';
import { DEFAULT_MODEL } from './types.js';

export type SkillScope = 'project' | 'personal';
export type SkillMode = 'static' | 'ai';

/**
 * Default brief for --generateskill / generateskill when --brief is omitted.
 */
export function defaultSkillBrief(pkg: PackageJsonLike, meta: LLMPackageJson | null): string {
  const fromMeta = meta?.summary?.trim() || meta?.description?.trim();
  if (fromMeta) return fromMeta;
  const fromPkg = typeof pkg.description === 'string' ? pkg.description.trim() : '';
  if (fromPkg) return fromPkg;
  const name = pkg.name ?? 'this project';
  return `Help agents work effectively with ${name}.`;
}

export interface GenerateSkillOptions {
  name?: string;
  brief?: string;
  mode: SkillMode;
  scope: SkillScope;
  force?: boolean;
  apiKey?: string;
  model: string;
  verbose?: boolean;
  freeLlmRouter?: boolean;
}

function loadPackageJson(cwd: string): PackageJsonLike {
  const path = resolve(cwd, 'package.json');
  if (!existsSync(path)) {
    throw new Error(`No package.json found at ${path}. Run from your package root.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJsonLike;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to load package.json: ${err}`);
  }
}

function loadLlmPackageJson(cwd: string): LLMPackageJson | null {
  const path = resolve(cwd, 'llm.package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as LLMPackageJson;
  } catch {
    return null;
  }
}

function readmeExcerpt(cwd: string, maxChars = 4000): string | undefined {
  const path = resolve(cwd, 'README.md');
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf-8');
    return raw.length > maxChars ? raw.slice(0, maxChars) + '\n…' : raw;
  } catch {
    return undefined;
  }
}

function resolveSkillDir(cwd: string, scope: SkillScope, name: string): string {
  if (scope === 'personal') {
    return resolve(homedir(), '.cursor', 'skills', name);
  }
  return resolve(cwd, '.cursor', 'skills', name);
}

/**
 * Build skill content locally from package metadata (no API).
 */
export function buildStaticSkillTemplate(
  pkg: PackageJsonLike,
  meta: LLMPackageJson | null,
  opts?: { name?: string; brief?: string; cwd?: string }
): SkillTemplateInput {
  const root = opts?.cwd ?? process.cwd();
  const pkgName = pkg.name ?? 'project';
  const name = slugifySkillName(opts?.name?.trim() || pkgName);
  const desc = meta?.summary ?? meta?.description ?? pkg.description ?? `Workflows for ${pkgName}.`;
  const title = opts?.brief?.trim()
    ? opts.brief.trim().replace(/\.$/, '')
    : `${pkgName} workflow`;

  const useCases = meta?.useCases ?? [];
  const reasons = meta?.reasonToUse ?? [];
  const keywords = meta?.keywords ?? [];

  const instructions: string[] = [
    `Follow project conventions for ${pkgName}.`,
    ...(useCases.slice(0, 3).map((u) => `Apply when: ${u}`)),
    ...(reasons.slice(0, 2).map((r) => `Prefer: ${r}`)),
    'Edit this SKILL.md to match your team standards.',
  ];

  const workflowSteps: string[] = [
    'Read package.json and llm.package.json (if present) for context.',
    'Identify the user goal and constraints from their message.',
    'Make the smallest change that solves the task.',
    'Verify behavior (tests or manual check) before finishing.',
  ];

  const exportNames = meta ? Object.keys(meta.exports).slice(0, 5) : [];
  const examples: string[] = [
    ...(exportNames.length
      ? [`Use exports like ${exportNames.map((n) => `\`${n}\``).join(', ')} when relevant.`]
      : []),
    opts?.brief?.trim()
      ? `User asks: "${opts.brief.trim()}" — follow the workflow above.`
      : `User asks for help with ${pkgName} — use package metadata and source.`,
  ];

  const resources: string[] = [
    ...(existsSync(resolve(root, 'llm.package.json')) ? ['llm.package.json'] : []),
    ...(existsSync(resolve(root, 'AGENT.md')) ? ['AGENT.md'] : []),
    'README.md',
  ];

  const triggerTerms = keywords.slice(0, 8).join(', ');
  const description = [
    desc,
    triggerTerms ? `Use when working with ${triggerTerms}.` : '',
    opts?.brief?.trim() ? `Triggers: ${opts.brief.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    name,
    title,
    description,
    instructions,
    workflowSteps,
    examples,
    resources,
    userNotes: '<!-- Add team-specific rules, links, or scripts here. -->',
  };
}

export async function generateSkill(
  cwd: string,
  options: GenerateSkillOptions
): Promise<{ path: string; action: 'created' | 'updated'; mode: SkillMode }> {
  const log = options.verbose ? (msg: string) => console.error('[hayagriva-llm skill]', msg) : () => {};

  const pkg = loadPackageJson(cwd);
  const meta = loadLlmPackageJson(cwd);
  const brief = options.brief?.trim() || defaultSkillBrief(pkg, meta);
  let template: SkillTemplateInput;

  if (options.mode === 'ai') {
    const key =
      options.apiKey ?? process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!key?.trim()) {
      throw new Error(
        'OpenRouter API key required. Set OPEN_ROUTER_API_KEY in .env or pass --api-key. ' +
          'Get a key: https://openrouter.ai/keys — then run: hayagriva-llm generateskill'
      );
    }

    let freeRouterModelIds: string[] | undefined;
    if (options.freeLlmRouter) {
      log('Fetching free models from Free LLM Router');
      const { ids } = await getModelIds(['chat'], 'capable', 25);
      if (!ids.length) {
        throw new Error('Free LLM Router returned no models; check FREE_LLM_ROUTER_API_KEY');
      }
      freeRouterModelIds = ids;
    }

    printAiModeHeader();
    printAuthChecking();
    const authResult = freeRouterModelIds?.length
      ? await checkOpenRouterAuthTryModels(key.trim(), freeRouterModelIds)
      : await checkOpenRouterAuth(key.trim(), options.model);
    if (!authResult.ok) {
      if (authResult.reason === 'rate_limited') {
        printRateLimited(authResult.message);
        throw new Error('OpenRouter rate-limited (429). Retry later or use another model.');
      }
      printAuthFailure('invalid or unauthorized API key');
      throw new Error('OpenRouter API key invalid or unauthorized (401)');
    }
    printAuthSuccess();
    printStep(1, 1, 'Generating skill content (single AI call)');

    template = await runSkillAiMode(
      {
        packageJson: JSON.stringify(pkg, null, 2),
        llmPackageJson: meta ? JSON.stringify(meta, null, 2) : undefined,
        readmeExcerpt: readmeExcerpt(cwd),
        brief,
      },
      key.trim(),
      options.model,
      freeRouterModelIds?.length ? { modelIds: freeRouterModelIds } : undefined
    );

    if (options.name?.trim()) {
      template.name = slugifySkillName(options.name);
    }
  } else {
    template = buildStaticSkillTemplate(pkg, meta, {
      name: options.name,
      brief,
      cwd,
    });
    log('Built static skill template from package metadata');
  }

  validateSkillName(template.name);

  const skillDir = resolveSkillDir(cwd, options.scope, template.name);
  const skillPath = resolve(skillDir, 'SKILL.md');
  const existed = existsSync(skillPath);

  if (existed && !options.force) {
    throw new Error(
      `Refusing to overwrite ${skillPath}. Re-run with --force to overwrite.`
    );
  }

  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  const content = buildSkillMdContent(template);
  writeFileSync(skillPath, content, 'utf-8');

  return { path: skillPath, action: existed ? 'updated' : 'created', mode: options.mode };
}

export { DEFAULT_MODEL };

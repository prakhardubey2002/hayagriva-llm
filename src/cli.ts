#!/usr/bin/env node

/**
 * hayagriva-llm — Structured LLM metadata for Node.js packages.
 * Generates llm.package.json and llm.package.txt.
 */
import 'dotenv/config';

import { Command } from 'commander';
import { generate } from './generate.js';
import { generateAgentMd } from './agent.js';
import { generateSkill, DEFAULT_MODEL as SKILL_DEFAULT_MODEL } from './skill.js';
import { runAudit } from './audit.js';
import { getVersion } from './version.js';
import { DEFAULT_MODEL } from './types.js';
import { startDashboardServer } from './dashboard.js';

/** Defer exit one tick so libuv can finish closing handles after failed fetch (avoids some Windows UV_HANDLE_CLOSING assertions). */
function exitAfterCleanup(code: number): void {
  setImmediate(() => {
    process.exit(code);
  });
}

const program = new Command();

program
  .name('hayagriva-llm')
  .description('Generate llm.package.json and llm.package.txt for npm packages')
  .version(getVersion());

program
  .command('generate')
  .description('Generate LLM metadata files')
  .option(
    '--mode <type>',
    'Extraction mode: "static" (ts-morph) or "ai" (OpenRouter)',
    'static'
  )
  .option('--api-key <key>', 'OpenRouter API key (required for ai mode)')
  .option('--model <name>', 'OpenRouter model (ai mode)', DEFAULT_MODEL)
  .option('--include-src', 'Include full source in AI prompt (ai mode)')
  .option('--verbose', 'Debug logging')
  .option(
    '--freellmrouter',
    'Use Free LLM Router for ranked free OpenRouter models (needs FREE_LLM_ROUTER_API_KEY; implies AI mode)'
  )
  .option('--rule', 'Also generate a Cursor rule .mdc file in .cursor/rules/')
  .action(async (opts: {
    mode: string;
    apiKey?: string;
    model: string;
    includeSrc: boolean;
    verbose: boolean;
    rule?: boolean;
    freellmrouter?: boolean;
  }) => {
    const mode = opts.mode === 'ai' || Boolean(opts.freellmrouter) ? 'ai' : 'static';
    const model = process.env.OPEN_ROUTER_MODEL || process.env.HAYAGRIVA_LLM_MODEL || opts.model;
    try {
      await generate(process.cwd(), {
        mode,
        apiKey: opts.apiKey,
        model,
        includeSrc: Boolean(opts.includeSrc),
        verbose: Boolean(opts.verbose),
        generateRule: Boolean(opts.rule),
        freeLlmRouter: Boolean(opts.freellmrouter),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error:', message);
      exitAfterCleanup(1);
    }
  });

program
  .command('agent')
  .description('Generate AGENT.md (operating manual for coding agents)')
  .option('--out <file>', 'Output filename', 'AGENT.md')
  .option('--force', 'Overwrite existing file')
  .action(async (opts: { out: string; force?: boolean }) => {
    try {
      const result = generateAgentMd(process.cwd(), { outFile: opts.out, force: Boolean(opts.force) });
      console.log(`${result.action === 'created' ? 'Created' : 'Updated'} ${result.path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error:', message);
      exitAfterCleanup(1);
    }
  });

program
  .command('dashboard')
  .description('Start local observability dashboard (reads .hayagriva-llm/)')
  .option('--port <port>', 'Port to bind (localhost)', '4177')
  .action(async (opts: { port: string }) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      console.error('Error: --port must be a valid number');
      exitAfterCleanup(1);
      return;
    }
    try {
      const { url } = await startDashboardServer(process.cwd(), port);
      console.log('Dashboard running at:', url);
      console.log('Press Ctrl+C to stop.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error:', message);
      exitAfterCleanup(1);
    }
  });

program
  .command('audit')
  .description('Scan the current project and generate an AI Readiness Score report')
  .option('--dir <path>', 'Directory to audit (defaults to cwd)')
  .action((opts: { dir?: string }) => {
    const target = opts.dir ?? process.cwd();
    runAudit(target);
  });

type SkillCliOpts = {
  name?: string;
  brief?: string;
  mode?: string;
  scope: string;
  force?: boolean;
  generateskill?: boolean;
  apiKey?: string;
  model: string;
  verbose: boolean;
  freellmrouter?: boolean;
};

function addSkillSharedOptions(cmd: Command): Command {
  return cmd
    .option('--name <slug>', 'Skill folder name (default: slug from package name)')
    .option('--brief <text>', 'What the skill should help with (optional; uses package description if omitted)')
    .option(
      '--scope <where>',
      'Where to write: "project" (.cursor/skills/) or "personal" (~/.cursor/skills/)',
      'project'
    )
    .option('--api-key <key>', 'OpenRouter API key (or set OPEN_ROUTER_API_KEY in .env)')
    .option('--model <name>', 'OpenRouter model', SKILL_DEFAULT_MODEL)
    .option('--verbose', 'Debug logging')
    .option(
      '--freellmrouter',
      'Use Free LLM Router for ranked free OpenRouter models (needs FREE_LLM_ROUTER_API_KEY)'
    );
}

async function runSkillCommand(opts: SkillCliOpts): Promise<void> {
  const quick = Boolean(opts.generateskill);
  const mode =
    quick || opts.mode === 'ai' || Boolean(opts.freellmrouter) ? 'ai' : 'static';
  const scope = opts.scope === 'personal' ? 'personal' : 'project';
  const model =
    process.env.OPEN_ROUTER_MODEL || process.env.HAYAGRIVA_LLM_MODEL || opts.model;
  const result = await generateSkill(process.cwd(), {
    name: opts.name,
    brief: opts.brief,
    mode,
    scope,
    force: quick || Boolean(opts.force),
    apiKey: opts.apiKey,
    model,
    verbose: Boolean(opts.verbose),
    freeLlmRouter: Boolean(opts.freellmrouter),
  });
  console.log(
    `${result.action === 'created' ? 'Created' : 'Updated'} ${result.path} (${result.mode} mode)`
  );
  if (quick) {
    console.log('Tip: customize SKILL.md under the hayagriva-llm comment.');
  } else {
    console.log('Edit SKILL.md sections under the hayagriva-llm comment to customize.');
  }
}

function skillAction(opts: SkillCliOpts): void {
  runSkillCommand(opts).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error:', message);
    exitAfterCleanup(1);
  });
}

addSkillSharedOptions(
  program
    .command('generateskill')
    .description(
      'Dead simple: AI-generate SKILL.md via OpenRouter (overwrites existing). Set OPEN_ROUTER_API_KEY in .env'
    )
).action((opts: Omit<SkillCliOpts, 'generateskill' | 'mode'>) => {
  skillAction({ ...opts, generateskill: true, mode: 'ai' });
});

addSkillSharedOptions(
  program
    .command('skill')
    .description('Generate a Cursor/Claude Agent Skill (SKILL.md) from a mutable template')
    .option(
      '--generateskill',
      'Shortcut: OpenRouter AI + overwrite existing (same as hayagriva-llm generateskill)'
    )
    .option(
      '--mode <type>',
      'Generation mode: "static" (local template) or "ai" (single OpenRouter call)',
      'static'
    )
    .option('--force', 'Overwrite existing SKILL.md')
).action((opts: SkillCliOpts) => {
  skillAction(opts);
});

program.parse();

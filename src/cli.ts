#!/usr/bin/env node

/**
 * hayagriva-llm — Structured LLM metadata for Node.js packages.
 * Generates llm.package.json and llm.package.txt.
 */
import 'dotenv/config';

import { Command } from 'commander';
import { generate } from './generate.js';
import { getVersion } from './version.js';
import { DEFAULT_MODEL } from './types.js';

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
  .action(async (opts: {
    mode: string;
    apiKey?: string;
    model: string;
    includeSrc: boolean;
    verbose: boolean;
  }) => {
    const mode = opts.mode === 'ai' ? 'ai' : 'static';
    const model = process.env.OPEN_ROUTER_MODEL || process.env.HAYAGRIVA_LLM_MODEL || opts.model;
    try {
      await generate(process.cwd(), {
        mode,
        apiKey: opts.apiKey,
        model,
        includeSrc: Boolean(opts.includeSrc),
        verbose: Boolean(opts.verbose),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error:', message);
      process.exit(1);
    }
  });

program.parse();

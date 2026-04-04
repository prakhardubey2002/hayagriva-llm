import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const OBS_DIRNAME = '.hayagriva-llm';
export const RUNS_JSONL = 'runs.jsonl';
export const LAST_RUN_JSON = 'last-run.json';

export interface AiCallAnalytics {
  step: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  model: string;
  systemPromptChars: number;
  userContentChars: number;
  responseChars: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GenerateRunAnalytics {
  id: string;
  command: 'generate';
  cwd: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  ok?: boolean;
  error?: { message: string };

  node: { version: string; platform: string; arch: string };

  package: {
    name: string;
    version: string;
    description?: string;
    entryPath: string | null;
  };

  flags: {
    mode: 'static' | 'ai';
    includeSrc: boolean;
    verbose: boolean;
    apiKeyProvided: boolean;
    model: string;
    freeLlmRouter?: boolean;
  };

  outputs?: {
    jsonPath: string;
    txtPath: string;
    action: 'created' | 'updated';
  };

  ai?: {
    calls: AiCallAnalytics[];
    totals?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    inputChars?: number;
    batches?: { size: number; batchCount: number };
  };
}

export function ensureObsDir(cwd: string): string {
  const dir = resolve(cwd, OBS_DIRNAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function newRunId(): string {
  return randomUUID();
}

export function writeLastRun(cwd: string, run: GenerateRunAnalytics): void {
  const dir = ensureObsDir(cwd);
  writeFileSync(resolve(dir, LAST_RUN_JSON), JSON.stringify(run, null, 2) + '\n', 'utf-8');
}

export function appendRunJsonl(cwd: string, run: GenerateRunAnalytics): void {
  const dir = ensureObsDir(cwd);
  appendFileSync(resolve(dir, RUNS_JSONL), JSON.stringify(run) + '\n', 'utf-8');
}

export function readRuns(cwd: string, max = 500): GenerateRunAnalytics[] {
  const dir = ensureObsDir(cwd);
  const p = resolve(dir, RUNS_JSONL);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const slice = lines.length > max ? lines.slice(lines.length - max) : lines;
  const out: GenerateRunAnalytics[] = [];
  for (const line of slice) {
    try {
      const v = JSON.parse(line) as GenerateRunAnalytics;
      if (v && typeof v === 'object' && v.command === 'generate') out.push(v);
    } catch {
      // skip corrupted lines
    }
  }
  return out;
}


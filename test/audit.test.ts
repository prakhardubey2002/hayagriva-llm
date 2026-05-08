import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { computeAudit, runAudit } from '../src/audit.js';

const TMP = join(process.cwd(), '.tmp-audit-test');

function scaffold(files: Record<string, string>, dirs: string[] = []): void {
  mkdirSync(TMP, { recursive: true });
  for (const d of dirs) mkdirSync(join(TMP, d), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = join(TMP, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('computeAudit', () => {
  it('returns score 0 for an empty directory', () => {
    const result = computeAudit(TMP);
    expect(result.normalizedScore).toBe(0);
    expect(result.passed).toHaveLength(0);
    expect(result.failed.length).toBeGreaterThan(0);
  });

  it('detects README.md', () => {
    scaffold({ 'README.md': '# Hello' });
    const result = computeAudit(TMP);
    const readme = result.passed.find(c => c.label === 'README exists');
    expect(readme).toBeDefined();
    expect(readme!.weight).toBe(10);
  });

  it('detects tsconfig.json as TypeScript support', () => {
    scaffold({ 'tsconfig.json': '{}' });
    const result = computeAudit(TMP);
    const ts = result.passed.find(c => c.label === 'TypeScript declarations found');
    expect(ts).toBeDefined();
  });

  it('detects types field in package.json as TypeScript support', () => {
    scaffold({ 'package.json': JSON.stringify({ types: './dist/index.d.ts' }) });
    const result = computeAudit(TMP);
    const ts = result.passed.find(c => c.label === 'TypeScript declarations found');
    expect(ts).toBeDefined();
  });

  it('detects JSDoc comments in src/', () => {
    scaffold({ 'src/index.ts': '/** Adds two numbers. */\nexport function add(a: number, b: number) { return a + b; }' });
    const result = computeAudit(TMP);
    const jsdoc = result.passed.find(c => c.label === 'JSDoc comments present');
    expect(jsdoc).toBeDefined();
  });

  it('fails JSDoc check when no comments exist', () => {
    scaffold({ 'src/index.ts': 'export const x = 1;' });
    const result = computeAudit(TMP);
    const jsdoc = result.failed.find(c => c.label === 'JSDoc comments present');
    expect(jsdoc).toBeDefined();
  });

  it('detects examples/ directory', () => {
    scaffold({}, ['examples']);
    const result = computeAudit(TMP);
    const ex = result.passed.find(c => c.label === 'Structured examples detected');
    expect(ex).toBeDefined();
  });

  it('detects example/ directory (singular)', () => {
    scaffold({}, ['example']);
    const result = computeAudit(TMP);
    const ex = result.passed.find(c => c.label === 'Structured examples detected');
    expect(ex).toBeDefined();
  });

  it('detects exports field in package.json', () => {
    scaffold({ 'package.json': JSON.stringify({ exports: { '.': './dist/index.js' } }) });
    const result = computeAudit(TMP);
    const exp = result.passed.find(c => c.label === 'Package exports defined');
    expect(exp).toBeDefined();
  });

  it('fails exports check when package.json has no exports', () => {
    scaffold({ 'package.json': JSON.stringify({ name: 'test' }) });
    const result = computeAudit(TMP);
    const exp = result.failed.find(c => c.label === 'Package exports defined');
    expect(exp).toBeDefined();
  });

  it('detects llm.package.json with weight 25', () => {
    scaffold({ 'llm.package.json': JSON.stringify({ name: 'test' }) });
    const result = computeAudit(TMP);
    const llm = result.passed.find(c => c.label === 'llm.package.json found');
    expect(llm).toBeDefined();
    expect(llm!.weight).toBe(25);
  });

  it('detects prompts/ directory as prompt templates', () => {
    scaffold({}, ['prompts']);
    const result = computeAudit(TMP);
    const pt = result.passed.find(c => c.label === 'Prompt templates found');
    expect(pt).toBeDefined();
  });

  it('detects llm.instructions.txt as prompt templates', () => {
    scaffold({ 'llm.instructions.txt': 'Use this package for...' });
    const result = computeAudit(TMP);
    const pt = result.passed.find(c => c.label === 'Prompt templates found');
    expect(pt).toBeDefined();
  });

  it('detects SECURITY.md as safety metadata', () => {
    scaffold({ 'SECURITY.md': '# Security Policy' });
    const result = computeAudit(TMP);
    const sec = result.passed.find(c => c.label === 'AI safety / security metadata present');
    expect(sec).toBeDefined();
    expect(sec!.weight).toBe(15);
  });

  it('detects sideEffects in llm.package.json as safety metadata', () => {
    scaffold({ 'llm.package.json': JSON.stringify({ sideEffects: ['reads env'] }) });
    const result = computeAudit(TMP);
    const sec = result.passed.find(c => c.label === 'AI safety / security metadata present');
    expect(sec).toBeDefined();
  });

  it('computes correct normalized score for a full project', () => {
    scaffold({
      'README.md': '# Pkg',
      'tsconfig.json': '{}',
      'src/index.ts': '/** Doc */\nexport function f() {}',
      'package.json': JSON.stringify({ exports: { '.': './dist/index.js' } }),
      'llm.package.json': JSON.stringify({ sideEffects: [] }),
      'llm.instructions.txt': 'instructions',
      'SECURITY.md': '# Security',
    }, ['examples']);
    const result = computeAudit(TMP);
    expect(result.normalizedScore).toBe(100);
    expect(result.failed).toHaveLength(0);
    expect(result.passed).toHaveLength(8);
  });

  it('weights sum to 100', () => {
    scaffold({});
    const result = computeAudit(TMP);
    expect(result.maxScore).toBe(100);
  });

  it('missing items show negative weight semantics', () => {
    scaffold({});
    const result = computeAudit(TMP);
    for (const f of result.failed) {
      expect(f.weight).toBeGreaterThan(0);
    }
  });
});

describe('computeAudit extras', () => {
  it('detects package.json in extras', () => {
    scaffold({ 'package.json': JSON.stringify({ name: 'test' }) });
    const result = computeAudit(TMP);
    const pkgExtra = result.extras.find(e => e.label === 'package.json found');
    expect(pkgExtra).toBeDefined();
  });

  it('detects docs folder in extras', () => {
    scaffold({}, ['docs']);
    const result = computeAudit(TMP);
    const docsExtra = result.extras.find(e => e.label === 'docs folder exists');
    expect(docsExtra).toBeDefined();
  });

  it('detects MCP config in extras', () => {
    scaffold({ 'mcp.json': '{}' });
    const result = computeAudit(TMP);
    const mcp = result.extras.find(e => e.label === 'MCP config detected');
    expect(mcp).toBeDefined();
  });

  it('returns no extras for empty directory', () => {
    const result = computeAudit(TMP);
    expect(result.extras).toHaveLength(0);
  });
});

describe('runAudit output', () => {
  it('prints audit header and score to console', () => {
    scaffold({ 'README.md': '# Hi' });
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      runAudit(TMP);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    expect(output).toContain('Hayagriva AI Audit');
    expect(output).toContain('AI Readiness Score');
    expect(output).toContain('/100');
  });

  it('shows passed checks with +weight and failed checks with -weight', () => {
    scaffold({ 'README.md': '# Hi' });
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      runAudit(TMP);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    expect(output).toContain('(+10)');
    expect(output).toMatch(/\(-\d+\)/);
  });

  it('shows recommendations when checks fail', () => {
    scaffold({});
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      runAudit(TMP);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    expect(output).toContain('Recommendations');
    expect(output).toContain('Add a README.md');
  });

  it('does not show streaming-related output', () => {
    scaffold({});
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      runAudit(TMP);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    expect(output).not.toContain('tream');
  });
});

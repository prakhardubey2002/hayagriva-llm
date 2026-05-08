/**
 * AI Readiness Audit — scans a JS/TS package directory and produces a
 * weighted score (0-100) with colourful CLI output.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/* ── ANSI helpers ─────────────────────────────────────────────────────── */

const R   = '\u001b[0m';
const B   = '\u001b[1m';
const DIM = '\u001b[2m';
const UL  = '\u001b[4m';
const RED    = '\u001b[31m';
const GRN    = '\u001b[32m';
const YEL    = '\u001b[33m';
const BLU    = '\u001b[34m';
const MAG    = '\u001b[35m';
const CYN    = '\u001b[36m';
const WHT    = '\u001b[37m';
const BG_GRN = '\u001b[42m';
const BG_YEL = '\u001b[43m';
const BG_RED = '\u001b[41m';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface CheckResult {
  label: string;
  passed: boolean;
  weight: number;
}

export interface AuditResult {
  score: number;
  maxScore: number;
  normalizedScore: number;
  passed: CheckResult[];
  failed: CheckResult[];
  extras: ExtraDetection[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function fileExists(cwd: string, ...segments: string[]): boolean {
  return existsSync(join(cwd, ...segments));
}

function dirExists(cwd: string, ...segments: string[]): boolean {
  const p = join(cwd, ...segments);
  return existsSync(p) && statSync(p).isDirectory();
}

function readJson(cwd: string, file: string): Record<string, unknown> | null {
  const p = join(cwd, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Recursively collect source files (js/ts/jsx/tsx) up to a depth limit. */
function collectSourceFiles(dir: string, depth = 3): string[] {
  if (depth <= 0 || !existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full, depth - 1));
    } else if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function sourceContains(cwd: string, pattern: RegExp, maxFiles = 200): boolean {
  const files = collectSourceFiles(join(cwd, 'src')).slice(0, maxFiles);
  for (const f of files) {
    try {
      if (pattern.test(readFileSync(f, 'utf-8'))) return true;
    } catch { /* skip unreadable */ }
  }
  return false;
}

/* ── Individual checks ───────────────────────────────────────────────── */

function checkReadme(cwd: string): CheckResult {
  const passed = fileExists(cwd, 'README.md') || fileExists(cwd, 'readme.md') || fileExists(cwd, 'Readme.md');
  return { label: 'README exists', passed, weight: 10 };
}

function checkTypeScript(cwd: string): CheckResult {
  const pkg = readJson(cwd, 'package.json');
  const hasTypesField = pkg !== null && ('types' in pkg || 'typings' in pkg);
  const hasTsConfig = fileExists(cwd, 'tsconfig.json');
  const hasDtsFiles = collectSourceFiles(cwd, 2).some(f => f.endsWith('.d.ts'));
  const passed = hasTypesField || hasTsConfig || hasDtsFiles;
  return { label: 'TypeScript declarations found', passed, weight: 10 };
}

function checkJsDoc(cwd: string): CheckResult {
  const passed = sourceContains(cwd, /\/\*\*[\s\S]*?\*\//);
  return { label: 'JSDoc comments present', passed, weight: 10 };
}

function checkExamples(cwd: string): CheckResult {
  const passed = dirExists(cwd, 'examples') || dirExists(cwd, 'example');
  return { label: 'Structured examples detected', passed, weight: 10 };
}

function checkExportsField(cwd: string): CheckResult {
  const pkg = readJson(cwd, 'package.json');
  const passed = pkg !== null && 'exports' in pkg;
  return { label: 'Package exports defined', passed, weight: 10 };
}

function checkLlmPackageJson(cwd: string): CheckResult {
  const passed = fileExists(cwd, 'llm.package.json');
  return { label: 'llm.package.json found', passed, weight: 25 };
}

function checkPromptTemplates(cwd: string): CheckResult {
  const hasDir = dirExists(cwd, 'prompts') || dirExists(cwd, 'prompt-templates');
  const hasInstructions = fileExists(cwd, 'llm.instructions.txt');
  const hasPromptFiles = collectSourceFiles(cwd, 2).some(f => /prompt/i.test(f));
  const passed = hasDir || hasInstructions || hasPromptFiles;
  return { label: 'Prompt templates found', passed, weight: 10 };
}

function checkSecurityMeta(cwd: string): CheckResult {
  const llmPkg = readJson(cwd, 'llm.package.json');
  const hasSafetyInMeta = llmPkg !== null && ('safety' in llmPkg || 'security' in llmPkg || 'sideEffects' in llmPkg);
  const hasSecurityMd = fileExists(cwd, 'SECURITY.md') || fileExists(cwd, 'security.md');
  const passed = hasSafetyInMeta || hasSecurityMd;
  return { label: 'AI safety / security metadata present', passed, weight: 15 };
}

/* ── Extra informational detections (not scored, enriches report) ───── */

export interface ExtraDetection { label: string; found: boolean }

function detectExtras(cwd: string): ExtraDetection[] {
  const pkg = readJson(cwd, 'package.json');
  return [
    { label: 'package.json found',       found: pkg !== null },
    { label: 'types field in package.json', found: pkg !== null && ('types' in pkg || 'typings' in pkg) },
    { label: 'docs folder exists',        found: dirExists(cwd, 'docs') },
    { label: 'llm.instructions.txt exists', found: fileExists(cwd, 'llm.instructions.txt') },
    { label: 'MCP config detected',       found: fileExists(cwd, 'mcp.json') || fileExists(cwd, '.mcp.json') || (pkg !== null && 'mcp' in pkg) },
    { label: 'AI usage examples',         found: dirExists(cwd, 'examples') && collectSourceFiles(join(cwd, 'examples'), 1).some(f => /ai|llm|agent|chat/i.test(f)) },
  ];
}

/* ── Score bar rendering ─────────────────────────────────────────────── */

function scoreBar(score: number): string {
  const width = 30;
  const filled = Math.round((score / 100) * width);
  const unfilled = width - filled;

  let barColor: string;
  if (score >= 70) barColor = GRN;
  else if (score >= 40) barColor = YEL;
  else barColor = RED;

  const bar = barColor + '█'.repeat(filled) + DIM + '░'.repeat(unfilled) + R;
  return `  ${bar}  ${B}${barColor}${score}${R}${DIM}/100${R}`;
}

function scoreBadge(score: number): string {
  let bg: string, label: string;
  if (score >= 80) { bg = BG_GRN; label = ' EXCELLENT '; }
  else if (score >= 60) { bg = BG_YEL; label = '   GOOD    '; }
  else if (score >= 40) { bg = BG_YEL; label = '   FAIR    '; }
  else { bg = BG_RED; label = '   POOR    '; }
  return `${bg}${B}${WHT}${label}${R}`;
}

/* ── Main audit ──────────────────────────────────────────────────────── */

export function computeAudit(cwd: string): AuditResult {
  const checks: CheckResult[] = [
    checkReadme(cwd),
    checkTypeScript(cwd),
    checkJsDoc(cwd),
    checkExamples(cwd),
    checkExportsField(cwd),
    checkLlmPackageJson(cwd),
    checkPromptTemplates(cwd),
    checkSecurityMeta(cwd),
  ];

  const extras = detectExtras(cwd).filter(e => e.found);

  const maxScore = checks.reduce((sum, c) => sum + c.weight, 0);
  const rawScore = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  const normalizedScore = Math.round((rawScore / maxScore) * 100);

  return {
    score: rawScore,
    maxScore,
    normalizedScore,
    passed: checks.filter(c => c.passed),
    failed: checks.filter(c => !c.passed),
    extras,
  };
}

export function runAudit(cwd: string): void {
  const divider  = `${DIM}${'━'.repeat(52)}${R}`;
  const thinLine = `${DIM}${'─'.repeat(52)}${R}`;

  const { normalizedScore: score, passed, failed, extras } = computeAudit(cwd);

  /* Header */
  console.log('');
  console.log(divider);
  console.log(`${B}${MAG}  ⚡  Hayagriva AI Audit${R}`);
  console.log(divider);
  console.log('');

  /* Score */
  console.log(`  ${B}${CYN}AI Readiness Score${R}    ${scoreBadge(score)}`);
  console.log('');
  console.log(scoreBar(score));
  console.log('');

  /* Passed checks */
  if (passed.length > 0) {
    console.log(thinLine);
    console.log(`  ${B}${GRN}Passed${R}`);
    console.log(thinLine);
    for (const c of passed) {
      const weightTag = `${DIM}(+${c.weight})${R}`;
      console.log(`  ${GRN}${B}✓${R} ${GRN}${c.label}${R}  ${weightTag}`);
    }
    console.log('');
  }

  /* Failed checks */
  if (failed.length > 0) {
    console.log(thinLine);
    console.log(`  ${B}${RED}Missing${R}`);
    console.log(thinLine);
    for (const c of failed) {
      const weightTag = `${DIM}${RED}(-${c.weight})${R}`;
      console.log(`  ${RED}${B}✗${R} ${RED}${c.label}${R}  ${weightTag}`);
    }
    console.log('');
  }

  /* Extra detections */
  if (extras.length > 0) {
    console.log(thinLine);
    console.log(`  ${B}${BLU}Additional Detections${R}`);
    console.log(thinLine);
    for (const e of extras) {
      console.log(`  ${CYN}●${R} ${DIM}${e.label}${R}`);
    }
    console.log('');
  }

  /* Recommendations */
  if (failed.length > 0) {
    console.log(thinLine);
    console.log(`  ${B}${YEL}Recommendations${R}`);
    console.log(thinLine);
    const recs = buildRecommendations(failed);
    for (const rec of recs) {
      console.log(`  ${YEL}→${R} ${rec}`);
    }
    console.log('');
  }

  /* Footer */
  console.log(divider);
  console.log(`  ${DIM}Scanned: ${UL}${cwd}${R}`);
  console.log(`  ${DIM}Powered by ${MAG}hayagriva-llm${R}`);
  console.log(divider);
  console.log('');
}

/* ── Recommendation builder ──────────────────────────────────────────── */

function buildRecommendations(failed: CheckResult[]): string[] {
  const map: Record<string, string> = {
    'README exists':                          'Add a README.md with package overview and usage instructions',
    'TypeScript declarations found':          'Add TypeScript declarations or a tsconfig.json',
    'JSDoc comments present':                 'Add JSDoc comments to your exported functions and classes',
    'Structured examples detected':           'Create an examples/ folder with usage snippets',
    'Package exports defined':                'Add an "exports" field to package.json',
    'llm.package.json found':                 'Run `hayagriva-llm generate` to create llm.package.json',
    'Prompt templates found':                 'Add prompt templates or an llm.instructions.txt file',
    'AI safety / security metadata present':  'Add safety/security metadata (SECURITY.md or sideEffects in llm.package.json)',
  };

  return failed.map(c => map[c.label] ?? `Address: ${c.label}`);
}

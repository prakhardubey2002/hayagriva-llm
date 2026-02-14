/**
 * Colored CLI output and step feedback.
 * Uses ANSI escape codes (no external dependency).
 */

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const;

const PREFIX = `${c.cyan}hayagriva-llm${c.reset}`;

export function step(label: string, detail?: string): void {
  const line = detail ? `${label} ${c.dim}${detail}${c.reset}` : label;
  console.log(`${PREFIX} ${c.blue}›${c.reset} ${line}`);
}

export function success(label: string): void {
  console.log(`${PREFIX} ${c.green}✓${c.reset} ${label}`);
}

export function fileWritten(path: string, existed: boolean): void {
  const action = existed ? `${c.yellow}Updated${c.reset}` : `${c.green}Created${c.reset}`;
  console.log(`  ${action} ${c.dim}${path}${c.reset}`);
}

export function summary(jsonPath: string, txtPath: string, jsonExisted: boolean, txtExisted: boolean): void {
  console.log('');
  console.log(`${PREFIX} ${c.green}Done${c.reset} ${c.dim}— files written:${c.reset}`);
  fileWritten(jsonPath, jsonExisted);
  fileWritten(txtPath, txtExisted);
  console.log('');
}

export function banner(mode: 'static' | 'ai'): void {
  const modeLabel = mode === 'ai' ? `${c.magenta}AI${c.reset}` : `${c.blue}static${c.reset}`;
  console.log('');
  console.log(`${PREFIX} ${c.dim}Generating LLM metadata${c.reset} ${c.dim}(${modeLabel} mode)${c.reset}`);
  console.log('');
}

export function error(message: string): void {
  console.error(`${PREFIX} ${c.bright}\x1b[31m✗${c.reset} ${message}`);
}

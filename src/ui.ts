/**
 * Colorful CLI UI: ANSI colors, circle progress graph, auth and step feedback.
 */

const reset = '\u001b[0m';
const bold = '\u001b[1m';
const dim = '\u001b[2m';
const green = '\u001b[32m';
const red = '\u001b[31m';
const yellow = '\u001b[33m';
const blue = '\u001b[34m';
const magenta = '\u001b[35m';
const cyan = '\u001b[36m';

const filled = '●';
const empty = '○';

/**
 * Build a circle-style progress bar: done filled, (total - done) empty.
 * Color: filled = cyan, empty = dim.
 */
export function circleProgress(done: number, total: number): string {
  if (total <= 0) return `${dim}[${empty}]${reset}`;
  const n = Math.min(12, Math.max(1, total)); // cap segments for display
  const filledCount = total <= n ? done : Math.round((done / total) * n);
  const filledSegments = filledCount;
  const emptySegments = n - filledSegments;
  const a = cyan + filled.repeat(Math.max(0, filledSegments)) + reset;
  const b = dim + empty.repeat(Math.max(0, emptySegments)) + reset;
  return `${dim}[${reset}${a}${b}${dim}]${reset}`;
}

/**
 * Print "Auth: checking..." in yellow.
 */
export function printAuthChecking(): void {
  console.error(`${yellow}${bold}🔐 Auth:${reset} ${yellow}checking...${reset}`);
}

/**
 * Print "Auth: ✓ successful" in green.
 */
export function printAuthSuccess(): void {
  console.error(`${green}${bold}🔐 Auth:${reset} ${green}✓ successful${reset}`);
}

/**
 * Print "Auth: ✗ failed" in red with optional message.
 */
export function printAuthFailure(message?: string): void {
  console.error(`${red}${bold}🔐 Auth:${reset} ${red}✗ failed${reset}` + (message ? ` ${dim}(${message})${reset}` : ''));
}

/**
 * Print "Rate limited (429)" in yellow with hint to retry or use another model.
 */
export function printRateLimited(message?: string): void {
  console.error(`${yellow}${bold}⚠ Rate limited:${reset} ${yellow}model temporarily rate-limited (429)${reset}` + (message ? `\n  ${dim}${message.slice(0, 300)}${reset}` : ''));
  console.error(`${dim}  Tip: Retry later, or set OPEN_ROUTER_MODEL to another model (e.g. openai/gpt-3.5-turbo), or add your provider key at https://openrouter.ai/settings/integrations${reset}`);
}

/**
 * Print one step with circle graph: "  Step X/Y: message    [●●●○○] X/Y"
 */
export function printStep(current: number, total: number, message: string): void {
  const circle = circleProgress(current, total);
  const stepLabel = `${blue}Step ${current}/${total}${reset}`;
  const msg = `${cyan}${message}${reset}`;
  const countLabel = `${dim}${current}/${total} done${reset}`;
  console.error(`  ${stepLabel}  ${msg}  ${circle}  ${countLabel}`);
}

/**
 * Print AI mode header (colorful).
 */
export function printAiModeHeader(): void {
  console.error(`${magenta}${bold}AI mode:${reset} ${dim}multiple small calls (overview → names → batched details)${reset}`);
}

/**
 * Print "AI steps done." in green.
 */
export function printAiStepsDone(): void {
  console.error(`  ${green}✓ AI steps done.${reset}`);
}

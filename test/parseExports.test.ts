import { describe, it, expect } from 'vitest';
import { detectEntryFile } from '../src/parseExports.js';

describe('detectEntryFile', () => {
  it('prefers source over module and main', () => {
    const pkg = { source: 'src/cli.ts', module: 'dist/cli.mjs', main: 'dist/cli.cjs' };
    const entry = detectEntryFile(pkg as never, process.cwd());
    expect(entry).toContain('src');
    expect(entry).toContain('cli.ts');
  });

  it('returns null when no entry exists', () => {
    const pkg = { source: 'nonexistent.ts', module: 'nope.js', main: 'missing.js' };
    const entry = detectEntryFile(pkg as never, process.cwd());
    expect(entry).toBeNull();
  });
});

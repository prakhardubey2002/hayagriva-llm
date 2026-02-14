import { describe, it, expect } from 'vitest';
import { buildTxtMetadata } from '../src/buildTxtMetadata.js';
import type { LLMPackageJson } from '../src/types.js';

describe('buildTxtMetadata', () => {
  it('includes package name and version', () => {
    const meta: LLMPackageJson = {
      name: 'test-pkg',
      version: '1.0.0',
      description: 'Test',
      exports: {},
      hooks: [],
      frameworks: [],
      generatedBy: 'hayagriva-llm@1.0.0',
      mode: 'static',
    };
    const txt = buildTxtMetadata(meta);
    expect(txt).toContain('Package: test-pkg');
    expect(txt).toContain('Version: 1.0.0');
  });

  it('formats exports with hook label', () => {
    const meta: LLMPackageJson = {
      name: 'x',
      version: '1.0.0',
      description: '',
      exports: {
        foo: { type: 'function', description: 'Does foo', hook: false },
        useBar: { type: 'function', description: 'Bar hook', hook: true },
      },
      hooks: ['useBar'],
      frameworks: [],
      generatedBy: 'hayagriva-llm@1.0.0',
      mode: 'static',
    };
    const txt = buildTxtMetadata(meta);
    expect(txt).toContain('foo');
    expect(txt).toContain('useBar');
    expect(txt).toContain('(Hook)');
  });
});

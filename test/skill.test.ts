import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSkillMdContent,
  slugifySkillName,
  validateSkillName,
} from '../src/buildSkillMd.js';
import { buildStaticSkillTemplate, defaultSkillBrief, generateSkill } from '../src/skill.js';
import { validateSkillAiResponse } from '../src/skillAiMode.js';

describe('buildSkillMd', () => {
  it('renders frontmatter and editable sections', () => {
    const md = buildSkillMdContent({
      name: 'my-skill',
      title: 'My Skill',
      description: 'Helps with tests. Use when testing.',
      instructions: ['Do A', 'Do B'],
      workflowSteps: ['Step one', 'Step two'],
      examples: ['Example scenario'],
      resources: ['README.md'],
    });
    expect(md).toContain('name: my-skill');
    expect(md).toContain('Helps with tests');
    expect(md).toContain('hayagriva-llm: edit the sections below');
    expect(md).toContain('## Instructions');
    expect(md).toContain('- Do A');
    expect(md).toContain('1. Step one');
    expect(md).toContain('## Your notes');
  });

  it('slugifies package names', () => {
    expect(slugifySkillName('@scope/My_Package')).toBe('scope-my-package');
  });

  it('validates skill names', () => {
    expect(() => validateSkillName('Bad_Name')).toThrow();
    expect(() => validateSkillName('good-name')).not.toThrow();
  });
});

describe('validateSkillAiResponse', () => {
  it('accepts a complete skill payload', () => {
    const result = validateSkillAiResponse({
      name: 'api-helper',
      title: 'API Helper',
      description: 'Guides REST changes. Use when editing API routes.',
      instructions: ['Check routes first'],
      workflowSteps: ['Read handlers'],
      examples: ['Add GET /health'],
      resources: [],
    });
    expect(result.name).toBe('api-helper');
    expect(result.instructions).toHaveLength(1);
  });
});

describe('generateSkill (static)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hayagriva-skill-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo-pkg',
        version: '1.0.0',
        description: 'Demo package for skill tests',
      }),
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('buildStaticSkillTemplate uses package metadata', () => {
    const template = buildStaticSkillTemplate(
      { name: 'demo-pkg', description: 'Demo' },
      null,
      { brief: 'Run releases' }
    );
    expect(template.name).toBe('demo-pkg');
    expect(template.description).toContain('Demo');
    expect(template.examples.some((e) => e.includes('Run releases'))).toBe(true);
  });

  it('writes SKILL.md under .cursor/skills locally', async () => {
    const result = await generateSkill(dir, {
      mode: 'static',
      scope: 'project',
      model: 'test',
      name: 'release-helper',
      brief: 'Ship npm releases safely',
    });
    expect(result.mode).toBe('static');
    expect(result.action).toBe('created');
    expect(existsSync(result.path)).toBe(true);
    const content = readFileSync(result.path, 'utf-8');
    expect(content).toContain('name: release-helper');
    expect(content).toContain('Ship npm releases');
  });

  it('defaultSkillBrief uses package description', () => {
    expect(
      defaultSkillBrief({ name: 'x', description: 'My app does things' }, null)
    ).toBe('My app does things');
  });

  it('overwrites existing skill when force is set', async () => {
    const skillDir = join(dir, '.cursor', 'skills', 'existing');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# old\n', 'utf-8');

    const result = await generateSkill(dir, {
      mode: 'static',
      scope: 'project',
      model: 'test',
      name: 'existing',
      force: true,
      brief: 'Updated brief',
    });
    expect(result.action).toBe('updated');
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')).toContain('Updated brief');
  });

  it('refuses overwrite without force', async () => {
    const skillDir = join(dir, '.cursor', 'skills', 'existing');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# old\n', 'utf-8');

    await expect(
      generateSkill(dir, { mode: 'static', scope: 'project', model: 'test', name: 'existing' })
    ).rejects.toThrow(/overwrite/i);
  });
});

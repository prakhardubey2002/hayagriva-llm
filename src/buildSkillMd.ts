/**
 * Build Cursor / Claude Agent Skill files (SKILL.md) from a simple, user-editable template.
 */

export interface SkillTemplateInput {
  /** YAML frontmatter name (lowercase, hyphens). */
  name: string;
  /** Markdown H1 title. */
  title: string;
  /** Frontmatter description (third person, trigger terms). */
  description: string;
  instructions: string[];
  workflowSteps: string[];
  examples: string[];
  resources: string[];
  /** Optional freeform block the user can extend. */
  userNotes?: string;
}

const EDIT_HINT =
  '<!-- hayagriva-llm: edit the sections below. Safe to change headings, bullets, and add files in this skill folder. -->';

function bulletLines(items: string[]): string[] {
  if (items.length === 0) return ['- (add your own)'];
  return items.map((item) => `- ${item}`);
}

function numberedLines(items: string[]): string[] {
  if (items.length === 0) return ['1. (add your own)'];
  return items.map((item, i) => `${i + 1}. ${item}`);
}

/**
 * Render SKILL.md body from structured sections (mutable template for the user).
 */
export function buildSkillMdContent(input: SkillTemplateInput): string {
  const lines: string[] = [
    '---',
    `name: ${input.name}`,
    `description: ${JSON.stringify(input.description.trim())}`,
    '---',
    '',
    `# ${input.title}`,
    '',
    EDIT_HINT,
    '',
    '## Instructions',
    '',
    ...bulletLines(input.instructions),
    '',
    '## Workflow',
    '',
    ...numberedLines(input.workflowSteps),
    '',
    '## Examples',
    '',
    ...bulletLines(input.examples),
    '',
    '## Additional resources',
    '',
    ...bulletLines(input.resources),
    '',
    '## Your notes',
    '',
    input.userNotes?.trim()
      ? input.userNotes.trim()
      : '<!-- Add project-specific conventions, links, or constraints here. -->',
    '',
  ];
  return lines.join('\n');
}

export function slugifySkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/@/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || 'project-skill').slice(0, 64);
}

export function validateSkillName(name: string): void {
  if (!name || name.length > 64) {
    throw new Error('Skill name must be 1–64 characters.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      'Skill name must use lowercase letters, numbers, and hyphens only (e.g. my-package-workflow).'
    );
  }
}

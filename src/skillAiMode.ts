/**
 * AI mode for skill generation: single OpenRouter call with strict JSON validation.
 */

import {
  callOpenRouterWithValidator,
  callOpenRouterWithValidatorTryModels,
  type FreeRouterCallFeedback,
} from './openrouter.js';
import type { SkillTemplateInput } from './buildSkillMd.js';

export interface SkillAiContext {
  packageJson: string;
  llmPackageJson?: string;
  readmeExcerpt?: string;
  brief?: string;
}

export interface SkillAiResult extends SkillTemplateInput {}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

export function validateSkillAiResponse(parsed: unknown): SkillAiResult {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.name !== 'string') throw new Error('Missing or invalid "name" (must be a string)');
  if (typeof o.title !== 'string') throw new Error('Missing or invalid "title" (must be a string)');
  if (typeof o.description !== 'string') {
    throw new Error('Missing or invalid "description" (must be a string)');
  }
  if (!isStringArray(o.instructions)) throw new Error('"instructions" must be an array of strings');
  if (!isStringArray(o.workflowSteps)) throw new Error('"workflowSteps" must be an array of strings');
  if (!isStringArray(o.examples)) throw new Error('"examples" must be an array of strings');
  if (!isStringArray(o.resources)) throw new Error('"resources" must be an array of strings');

  const out: SkillAiResult = {
    name: (o.name as string).trim(),
    title: (o.title as string).trim(),
    description: (o.description as string).trim(),
    instructions: o.instructions.map((s) => s.trim()).filter(Boolean),
    workflowSteps: o.workflowSteps.map((s) => s.trim()).filter(Boolean),
    examples: o.examples.map((s) => s.trim()).filter(Boolean),
    resources: o.resources.map((s) => s.trim()).filter(Boolean),
  };
  if (typeof o.userNotes === 'string' && o.userNotes.trim()) {
    out.userNotes = o.userNotes.trim();
  }
  return out;
}

const SKILL_AI_SYSTEM = `You are a strict generator for Cursor Agent Skills (SKILL.md). Output ONLY valid JSON, no markdown fences, no explanation.

Task: Produce one skill definition for the given project context and user brief.

Output schema:
{
  "name": "lowercase-hyphen-slug-max-64-chars",
  "title": "Human-readable skill title",
  "description": "Third-person description: what the skill does AND when to use it (trigger terms). Max ~500 chars.",
  "instructions": ["3-8 concise imperative bullets for the agent"],
  "workflowSteps": ["3-6 numbered workflow steps as plain strings (no numbers in text)"],
  "examples": ["1-3 concrete example scenarios"],
  "resources": ["0-4 optional links or filenames like reference.md"],
  "userNotes": "Optional short paragraph for project-specific notes"
}

Rules:
- "name" must match ^[a-z0-9]+(-[a-z0-9]+)*$
- Description must be third person (not "I" or "you can")
- Be specific to the project; avoid generic filler
- Keep arrays non-empty except resources may be []`;

export async function runSkillAiMode(
  context: SkillAiContext,
  apiKey: string,
  model: string,
  freeRouter?: { modelIds: string[]; feedback?: FreeRouterCallFeedback }
): Promise<SkillAiResult> {
  const parts = [
    '## package.json',
    context.packageJson,
  ];
  if (context.llmPackageJson) {
    parts.push('', '## llm.package.json', context.llmPackageJson);
  }
  if (context.readmeExcerpt) {
    parts.push('', '## README (excerpt)', context.readmeExcerpt);
  }
  if (context.brief?.trim()) {
    parts.push('', '## User brief', context.brief.trim());
  }

  const base = {
    apiKey,
    systemPrompt: SKILL_AI_SYSTEM,
    userContent: parts.join('\n'),
  };

  if (freeRouter?.modelIds.length) {
    const { result } = await callOpenRouterWithValidatorTryModels(
      base,
      freeRouter.modelIds,
      validateSkillAiResponse,
      'skill',
      freeRouter.feedback
    );
    return result;
  }

  return callOpenRouterWithValidator({ ...base, model }, validateSkillAiResponse, 'skill');
}

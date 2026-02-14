/**
 * Build llm.package.txt — LLM-optimized text summary. Includes extended fields for search/IDE.
 */

import type { LLMPackageJson, ExportMeta } from './types.js';

function formatExportLine(name: string, info: ExportMeta): string {
  const parts: string[] = [name];
  if (info.hook) parts.push('(Hook)');
  if (info.description) parts.push(':', info.description);
  if (info.params) parts.push('— params:', info.params);
  if (info.returns) parts.push('— returns:', info.returns);
  if (info.sideEffect) parts.push('— side effect');
  if (info.example) parts.push('— e.g.', info.example);
  return '- ' + parts.join(' ');
}

/** Consistent section order for crawler-friendly llm.package.txt. */
export function buildTxtMetadata(meta: LLMPackageJson): string {
  const lines: string[] = [
    `Package: ${meta.name}`,
    `Version: ${meta.version}`,
    '',
    'Description:',
    meta.description || '(none)',
    '',
  ];

  if (meta.summary) {
    lines.push('Summary:', meta.summary, '');
  }

  if (meta.whenToUse) {
    lines.push('When to use:', meta.whenToUse, '');
  }

  if (meta.reasonToUse && meta.reasonToUse.length > 0) {
    lines.push('Reason to use:');
    for (const r of meta.reasonToUse) lines.push('- ' + r);
    lines.push('');
  }

  if (meta.useCases && meta.useCases.length > 0) {
    lines.push('Use cases:');
    for (const u of meta.useCases) lines.push('- ' + u);
    lines.push('');
  }

  if (meta.sideEffects && meta.sideEffects.length > 0) {
    lines.push('Side effects:');
    for (const s of meta.sideEffects) lines.push('- ' + s);
    lines.push('');
  }

  if (meta.keywords && meta.keywords.length > 0) {
    lines.push('Keywords:', meta.keywords.join(', '), '');
  }

  if (meta.documentation) {
    lines.push('', 'Documentation:', meta.documentation, '');
  }

  if (meta.relatedPackages && meta.relatedPackages.length > 0) {
    lines.push('Related packages:', meta.relatedPackages.join(', '), '');
  }

  lines.push('Exports:');
  for (const [name, info] of Object.entries(meta.exports).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(formatExportLine(name, info));
  }

  if (meta.hooks.length > 0) {
    lines.push('', 'Hooks:');
    for (const h of meta.hooks) lines.push('- ' + h);
  }

  if (meta.frameworks && meta.frameworks.length > 0) {
    lines.push('', 'Frameworks:', meta.frameworks.join(', '));
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Build llm.package.txt — LLM-optimized text summary. Includes extended fields for search/IDE.
 */

import type { LLMPackageJson, ExportMeta } from './types.js';

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function stringifyWithLimit(value: unknown, limitChars = 20000): string {
  const s = JSON.stringify(value, null, 2) ?? '';
  if (s.length <= limitChars) return s;
  return s.slice(0, limitChars) + '\n…(truncated)…';
}

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

  if (meta.extensions && typeof meta.extensions === 'object') {
    const ext = meta.extensions as Record<string, unknown>;
    const capabilities = ext.capabilities;
    const configuration = ext.configuration;
    const limitations = ext.limitations;
    const security = ext.security;
    const observability = ext.observability;
    const integration = ext.integration;
    const examples = ext.examples;

    if (isStringArray(capabilities) && capabilities.length > 0) {
      lines.push('Capabilities:');
      for (const c of capabilities) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(configuration) && configuration.length > 0) {
      lines.push('Configuration:');
      for (const c of configuration) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(integration) && integration.length > 0) {
      lines.push('Integration:');
      for (const c of integration) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(observability) && observability.length > 0) {
      lines.push('Observability:');
      for (const c of observability) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(security) && security.length > 0) {
      lines.push('Security notes:');
      for (const c of security) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(limitations) && limitations.length > 0) {
      lines.push('Limitations / non-goals:');
      for (const c of limitations) lines.push('- ' + c);
      lines.push('');
    }
    if (isStringArray(examples) && examples.length > 0) {
      lines.push('Examples:');
      for (const c of examples) lines.push('- ' + c);
      lines.push('');
    }

    // Always include raw extensions JSON for crawlers/LLMs (bounded).
    lines.push('Extensions (JSON):');
    lines.push(stringifyWithLimit(ext));
    lines.push('');
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

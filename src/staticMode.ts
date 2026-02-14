/**
 * Static mode: extract exports using ts-morph (AST) — no API calls.
 */

import { Project } from 'ts-morph';
import type { ExportsMap } from './types.js';

const HOOK_PREFIX = 'use';

function isHookName(name: string): boolean {
  return name.length > HOOK_PREFIX.length && name.startsWith(HOOK_PREFIX);
}

function getJSDocDescription(node: { getJsDocs?(): unknown[] }): string {
  const docs = node.getJsDocs?.() ?? [];
  if (docs.length === 0) return '';
  const first = docs[0] as { getDescription?(): string };
  const desc = first?.getDescription?.();
  return typeof desc === 'string' ? desc.trim() : '';
}

/**
 * Extract structured exports (functions, classes, types) and detect hooks from entry file.
 */
export function extractStaticExports(entryPath: string): ExportsMap {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(entryPath);
  const exports: ExportsMap = {};

  for (const decl of sourceFile.getExportedDeclarations()) {
    const name = decl[0];
    const nodes = decl[1];
    for (const node of nodes) {
      const kindName = node.getKindName();

      let type: ExportsMap[string]['type'] = 'type';
      if (kindName.includes('Function') || kindName === 'FunctionDeclaration') {
        type = 'function';
      } else if (kindName.includes('Class') || kindName === 'ClassDeclaration') {
        type = 'class';
      } else if (kindName.includes('Interface') || kindName.includes('TypeAlias')) {
        type = 'type';
      }

      const description = getJSDocDescription(node as Parameters<typeof getJSDocDescription>[0]);
      const hook = type === 'function' && isHookName(name);

      if (!exports[name]) {
        exports[name] = { type, description: description || '', hook };
      }
    }
  }

  return exports;
}

/**
 * Get list of hook names (functions starting with "use") from exports map.
 */
export function getHooksFromExports(exports: ExportsMap): string[] {
  return Object.entries(exports)
    .filter(([, meta]) => meta.hook)
    .map(([name]) => name)
    .sort();
}

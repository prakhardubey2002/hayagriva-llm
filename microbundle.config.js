/** @type {import('microbundle').Options} */
export default {
  input: 'src/cli.ts',
  output: [
    { format: 'cjs', file: 'dist/cli.cjs' },
    { format: 'es', file: 'dist/cli.mjs' },
  ],
  target: 'node',
  sourcemap: true,
  generateTypes: false,
  externals: ['node:fs', 'node:path', 'node:url', 'fs', 'path', 'url'],
};

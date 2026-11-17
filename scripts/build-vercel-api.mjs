// scripts/build-vercel-api.mjs
// Bundles server.ts into a standalone CommonJS entrypoint (api/_server.cjs) for Vercel Node serverless functions.
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();

await build({
  entryPoints: [path.resolve(rootDir, 'server.ts')],
  outfile: path.resolve(rootDir, 'api/_server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  external: ['vite'],
  define: {
    'import.meta.url': 'undefined',
  },
  sourcemap: false,
  logLevel: 'info',
});

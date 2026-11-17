// api/index.js - Vercel Serverless Function Entrypoint (ESM wrapper for CJS server bundle)
// Must use the `.js` extension so Vercel's builder registers it as a Node.js Serverless Function.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let cachedApp = null;
let bootError = null;

function resolveApp() {
  if (cachedApp) return cachedApp;
  if (bootError) throw bootError;
  try {
    const serverModule = require('./_server.cjs');
    cachedApp = serverModule.app || serverModule.default || serverModule;
    if (typeof cachedApp !== 'function') {
      throw new Error('Compiled server bundle did not export an Express application.');
    }
    return cachedApp;
  } catch (err) {
    bootError = err;
    throw err;
  }
}

export default function handler(req, res) {
  try {
    const app = resolveApp();
    return app(req, res);
  } catch (err) {
    console.error('[Ekklesphere Vercel API] Fatal handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'serverless_boot_failed',
          message:
            err && typeof err.message === 'string'
              ? err.message
              : 'API server failed to initialize.',
        })
      );
    }
  }
}

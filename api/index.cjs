// api/index.cjs - Vercel Serverless Function Entrypoint (CommonJS)
// Uses pre-bundled CommonJS server (api/_server.cjs) generated during `npm run build`
// so Vercel never encounters ESM `.ts` extension errors or CJS dynamic-require failures.

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

module.exports = (req, res) => {
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
};

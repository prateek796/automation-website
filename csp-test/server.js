/**
 * CSP Test Server
 *
 * Serves a realistic marketing site with configurable Content-Security-Policy
 * response headers. Page CSP variants differ (VWO-style, report-only, strict),
 * but worker-src is ALWAYS 'none' site-wide.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

/** Site-wide: Web Workers are blocked on every HTML page. */
const WORKER_SRC_NONE = "worker-src 'none'";

/**
 * Build a VWO-compatible CSP (SmartCode can load) with Workers always blocked.
 *
 * Intentionally mirrors production-style directives that cause console errors like:
 * - inline style blocked (no 'unsafe-inline' in style-src; nonce required)
 * - wingified.com campaign CSS / fonts / images blocked (host not allowlisted)
 *
 * @param {string} nonce
 */
function buildVwoCsp(nonce) {
  const n = `'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' ${n} 'unsafe-inline' 'unsafe-eval' *.vwo.com *.visualwebsiteoptimizer.com *.wingify.com *.wingify.net https://dev.visualwebsiteoptimizer.com https://edge.wingify.net`,
    `connect-src 'self' *.vwo.com *.visualwebsiteoptimizer.com *.wingify.com *.wingify.net *.vwo.io https://dev.visualwebsiteoptimizer.com`,
    `style-src 'self' ${n} *.vwo.com *.visualwebsiteoptimizer.com *.wingify.net`,
    `img-src 'self' data: *.vwo.com *.visualwebsiteoptimizer.com *.vwo.io *.wingify.net`,
    `font-src 'self' data: *.vwo.io *.wingify.net`,
    `frame-src 'self' *.vwo.com *.visualwebsiteoptimizer.com`,
    WORKER_SRC_NONE,
  ].join('; ');
}

/**
 * Alternate VWO CSP variant (slightly different host lists) — still blocks workers.
 * Useful so different URLs have different CSP shapes while worker policy stays consistent.
 *
 * @param {string} nonce
 */
function buildVwoCspVariant(nonce) {
  const n = `'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' ${n} 'unsafe-inline' 'unsafe-eval' *.vwo.com *.visualwebsiteoptimizer.com https://dev.visualwebsiteoptimizer.com`,
    `connect-src 'self' *.vwo.com *.visualwebsiteoptimizer.com *.vwo.io https://dev.visualwebsiteoptimizer.com`,
    `style-src 'self' ${n} *.vwo.com *.visualwebsiteoptimizer.com *.wingify.net`,
    `img-src 'self' data: *.vwo.com *.visualwebsiteoptimizer.com *.vwo.io`,
    `font-src 'self' data: *.vwo.io`,
    `frame-src 'self' *.visualwebsiteoptimizer.com`,
    WORKER_SRC_NONE,
  ].join('; ');
}

/**
 * @typedef {{
 *   header: string | null,
 *   description: string,
 *   build?: (nonce: string) => string,
 *   value?: string,
 * }} CspRoute
 * @type {Record<string, CspRoute>}
 */
const CSP_ROUTES = {
  '/block-worker': {
    header: 'Content-Security-Policy',
    build: buildVwoCsp,
    description: "VWO CSP + worker-src 'none' (SmartCode allowed, Workers blocked)",
  },
  // Kept for bookmarks / existing links — same worker block, alternate CSP shape
  '/allow-worker': {
    header: 'Content-Security-Policy',
    build: buildVwoCspVariant,
    description: "Alternate VWO CSP shape — still worker-src 'none' site-wide",
  },
  '/report-only': {
    header: 'Content-Security-Policy-Report-Only',
    build: buildVwoCsp,
    description: "Report-only VWO CSP — still declares worker-src 'none'",
  },
  '/no-csp': {
    // Minimal CSP: only block workers (everything else unrestricted)
    header: 'Content-Security-Policy',
    value: WORKER_SRC_NONE,
    description: "Minimal CSP: only worker-src 'none' (Workers blocked everywhere)",
  },
  '/strict/block-worker': {
    header: 'Content-Security-Policy',
    value: `default-src 'self'; ${WORKER_SRC_NONE}`,
    description: "Strict default-src 'self' + worker-src 'none' (blocks VWO)",
  },
  '/strict/allow-worker': {
    header: 'Content-Security-Policy',
    value: `default-src 'self'; ${WORKER_SRC_NONE}`,
    description: "Strict default-src 'self' + worker-src 'none' (alias; workers always blocked)",
  },
};

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/data', (_req, res) => {
  res.json({
    ok: true,
    message: 'Sample API payload for CSP / page-analyzer tests',
    timestamp: new Date().toISOString(),
    features: ['workers', 'csp', 'observers', 'storage', 'vwo'],
    workerPolicy: "worker-src 'none' (site-wide)",
  });
});

app.get('/api/products', (_req, res) => {
  res.json({
    products: [
      { id: 1, name: 'Orbit Analytics', price: 49, tag: 'Popular' },
      { id: 2, name: 'Nova Automate', price: 99, tag: 'New' },
      { id: 3, name: 'Pulse Insights', price: 79, tag: 'Pro' },
      { id: 4, name: 'Aether CDN', price: 129, tag: 'Scale' },
      { id: 5, name: 'Forge Pipeline', price: 149, tag: 'Teams' },
      { id: 6, name: 'Lumen Monitor', price: 59, tag: 'Starter' },
    ],
  });
});

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body ?? {};
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'name and email are required' });
  }
  console.log('[contact]', { name, email, message: message ?? '' });
  return res.json({ ok: true, received: { name, email } });
});

app.get('/api/csp-routes', (_req, res) => {
  res.json(
    Object.entries(CSP_ROUTES).map(([route, cfg]) => ({
      route,
      header: cfg.header,
      workerSrc: "'none'",
      description: cfg.description,
    })),
  );
});

/** Inject per-request nonce into link/script tags that need it under style-src/script-src. */
function renderIndex(nonce) {
  return INDEX_HTML
    .replace(
      '<link rel="stylesheet" href="/style.css">',
      `<link rel="stylesheet" href="/style.css" nonce="${nonce}">`,
    )
    .replace(
      '<script type="text/javascript" id="vwoCode">',
      `<script type="text/javascript" id="vwoCode" nonce="${nonce}">`,
    )
    .replace(
      '<script src="/main.js" defer></script>',
      `<script src="/main.js" defer nonce="${nonce}"></script>`,
    );
}

/**
 * Apply CSP headers for a matched test route, then serve index.html (with nonce).
 * Every route includes worker-src 'none'.
 */
function serveCspPage(routePath, cfg) {
  app.get(routePath, (_req, res) => {
    const nonce = crypto.randomBytes(16).toString('hex');
    res.set('X-CSP-Test-Route', routePath);
    res.set('X-CSP-Nonce', nonce);
    res.set('X-Worker-Src', "'none'");

    if (cfg.header) {
      const value = cfg.build
        ? cfg.build(nonce)
        : (cfg.value ?? WORKER_SRC_NONE);
      res.set(cfg.header, value);
    }

    res.type('html').send(renderIndex(nonce));
  });
}

for (const [routePath, cfg] of Object.entries(CSP_ROUTES)) {
  serveCspPage(routePath, cfg);
}

app.get('/', (_req, res) => {
  res.redirect(302, '/block-worker');
});

app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('worker.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
}));

app.listen(PORT, () => {
  console.log(`CSP test server listening on http://localhost:${PORT}`);
  console.log(`Site-wide worker policy: ${WORKER_SRC_NONE}`);
  console.log('Routes:');
  for (const [routePath, cfg] of Object.entries(CSP_ROUTES)) {
    console.log(`  ${routePath.padEnd(24)} → ${cfg.description}`);
  }
});

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import html from '../index.html';

const frontendDir = path.resolve(import.meta.dir, '..');
const publicDir = path.join(frontendDir, 'public');

const port = Number(process.env.PORT || 5173);
const backend = process.env.API_TARGET || 'http://127.0.0.1:3000';
const apiOrigin = process.env.API_ORIGIN || 'http://localhost:8080';
const media = process.env.MEDIA_TARGET || 'http://127.0.0.1:8888';

async function proxy(req, targetBase, overrideHeaders = {}) {
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, targetBase);

  const headers = new Headers(req.headers);
  headers.set('host', targetUrl.host);
  for (const [k, v] of Object.entries(overrideHeaders)) {
    headers.set(k, v);
  }

  const init = {
    method: req.method,
    headers,
    redirect: 'manual'
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
  }

  return await fetch(targetUrl.toString(), init);
}

const routes = {
  '/api/*': async (req) => proxy(req, backend, { Origin: apiOrigin }),
  '/img/*': async (req) => proxy(req, media),
  '/gif/*': async (req) => proxy(req, media)
};

// Map public static files explicitly to preserve root URLs
if (existsSync(publicDir)) {
  for (const file of readdirSync(publicDir)) {
    routes[`/${file}`] = Bun.file(path.join(publicDir, file));
  }
}

// Fallback all SPA routes to the native HTML bundle
routes['/*'] = html;

const server = Bun.serve({
  port,
  development: true,
  routes
});

console.log(`🚀 openGym native Bun dev server running at http://localhost:${server.port}`);
console.log(`   • Proxying /api -> ${backend} (Origin: ${apiOrigin})`);
console.log(`   • Proxying /img, /gif -> ${media}`);

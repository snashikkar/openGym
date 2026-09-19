import { existsSync } from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve(import.meta.dir, '..');
const distDir = path.join(frontendDir, 'dist');
const port = Number(process.env.PORT || 4173);

if (!existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Run "bun run build" first.');
  process.exit(1);
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(distDir, pathname.slice(1));
    if (existsSync(filePath)) {
      return new Response(Bun.file(filePath));
    }
    // SPA fallback
    return new Response(Bun.file(path.join(distDir, 'index.html')));
  }
});

console.log(`🚀 openGym preview server running at http://localhost:${server.port}`);

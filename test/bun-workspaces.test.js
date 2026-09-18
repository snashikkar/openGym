import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

describe('Bun Workspaces & Monorepo Unification (Slice 4 Done-When)', () => {
  it('root package.json declares workspaces ["frontend", "api", "mcp"]', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.workspaces).toBeDefined();
    expect(Array.isArray(pkg.workspaces)).toBe(true);
    expect(pkg.workspaces).toContain('frontend');
    expect(pkg.workspaces).toContain('api');
    expect(pkg.workspaces).toContain('mcp');
  });

  it('all dependencies resolve into a single root bun.lock with zero subpackage lockfiles', () => {
    expect(existsSync('bun.lock')).toBe(true);
    expect(existsSync('frontend/bun.lock')).toBe(false);
    expect(existsSync('api/bun.lock')).toBe(false);
    expect(existsSync('mcp/bun.lock')).toBe(false);

    // Verify root bun.lock contains entries for all workspace packages
    const lockContent = readFileSync('bun.lock', 'utf8');
    expect(lockContent).toContain('opengym-frontend');
    expect(lockContent).toContain('gym-api');
    expect(lockContent).toContain('opengym-mcp');
  });

  it('frontend builds cleanly producing production assets in frontend/dist', () => {
    expect(existsSync('frontend/dist')).toBe(true);
    expect(existsSync('frontend/dist/index.html')).toBe(true);
    expect(existsSync('frontend/dist/assets')).toBe(true);

    const assets = readdirSync('frontend/dist/assets');
    expect(assets.length).toBeGreaterThan(0);

    // Verify index.html is non-empty
    const indexHtml = readFileSync('frontend/dist/index.html', 'utf8');
    expect(indexHtml.length).toBeGreaterThan(100);
    expect(indexHtml).toContain('<html');

    // Verify JS bundle exists
    const jsBundles = assets.filter(f => f.endsWith('.js'));
    expect(jsBundles.length).toBeGreaterThan(0);
    const mainJs = jsBundles.find(f => f.startsWith('index-'));
    expect(mainJs).toBeDefined();
    const mainJsStat = statSync(path.join('frontend/dist/assets', mainJs));
    expect(mainJsStat.size).toBeGreaterThan(10000);
  });
});

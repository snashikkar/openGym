import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';

describe('CI Fitness & Toolchain Modernization (Slice 3 & 4 Done-When)', () => {
  const packagePaths = [
    'package.json',
    'frontend/package.json',
    'api/package.json',
    'mcp/package.json'
  ];

  it('verifies zero Vitest, Jest, or Mocha dependencies across all packages', () => {
    for (const pkgPath of packagePaths) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
        ...(pkg.optionalDependencies || {})
      };

      expect(allDeps['vitest']).toBeUndefined();
      expect(allDeps['@vitejs/plugin-react']).toBeUndefined();
      expect(allDeps['vite']).toBeUndefined();
      expect(allDeps['@vitest/ui']).toBeUndefined();
      expect(allDeps['@vitest/coverage-v8']).toBeUndefined();
      expect(allDeps['jest']).toBeUndefined();
      expect(allDeps['mocha']).toBeUndefined();
    }
  });

  it('verifies all test scripts use native Bun runtime', () => {
    for (const pkgPath of packagePaths) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      expect(pkg.scripts?.test).toBeDefined();
      expect(pkg.scripts.test).toMatch(/^bun test/);
    }
  });

  it('verifies permanent purge of npm lockfiles across root and all subpackages', () => {
    expect(existsSync('package-lock.json')).toBe(false);
    expect(existsSync('frontend/package-lock.json')).toBe(false);
    expect(existsSync('api/package-lock.json')).toBe(false);
    expect(existsSync('mcp/package-lock.json')).toBe(false);
  });

  it('verifies absence of lingering vitest, vite, or legacy configuration files', () => {
    expect(existsSync('vitest.config.js')).toBe(false);
    expect(existsSync('vitest.config.ts')).toBe(false);
    expect(existsSync('frontend/vitest.config.js')).toBe(false);
    expect(existsSync('mcp/vitest.config.js')).toBe(false);
    expect(existsSync('api/vitest.config.js')).toBe(false);
    expect(existsSync('jest.config.js')).toBe(false);
    expect(existsSync('vite.config.js')).toBe(false);
    expect(existsSync('vite.config.ts')).toBe(false);
    expect(existsSync('frontend/vite.config.js')).toBe(false);
    expect(existsSync('frontend/vite.config.ts')).toBe(false);
  });

  it('verifies frontend build and dev scripts execute native Bun scripts without Vite (DEC-10)', () => {
    const pkg = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
    expect(pkg.scripts?.dev).toBe('bun scripts/dev.js');
    expect(pkg.scripts?.build).toBe('bun scripts/build.js');
    expect(pkg.scripts?.preview).toBe('bun scripts/preview.js');
    expect(pkg.scripts?.['build:mobile']).toContain('bun scripts/build.js');
    expect(pkg.scripts?.['build:mobile']).not.toContain('vite');
  });


  it('verifies execution occurs on native Bun runtime with unified bun.lock', () => {
    expect(process.versions?.bun).toBeDefined();
    expect(typeof Bun).toBe('object');
    expect(existsSync('bun.lock')).toBe(true);
    expect(existsSync('bunfig.toml')).toBe(true);

    const bunfig = readFileSync('bunfig.toml', 'utf8');
    expect(bunfig).toContain('root = "./test"');
    expect(bunfig).toContain('preload = ["./test/setup.js"]');
  });

  it('legacy synchronous localStorage reads permanently decoupled from app startup', () => {
    const storeSource = readFileSync('frontend/src/store/useStore.js', 'utf8');
    expect(storeSource).not.toMatch(/S:\s*\(\(\)\s*=>\s*\{\s*const\s+s\s*=\s*loadState/);
    expect(storeSource).toContain('Decoupled from legacy synchronous localStorage reads at app startup');
  });
});

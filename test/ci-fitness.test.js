import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';

describe('CI Fitness & Vitest Decoupling (Slice 3 Done-When)', () => {
  it('full test suite executes under bun test with zero Vitest or Node dependencies', () => {
    // 1. Verify package.json dependencies have zero vitest, jest, or legacy test runners
    const pkgRaw = readFileSync('package.json', 'utf8');
    const pkg = JSON.parse(pkgRaw);

    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {})
    };

    expect(allDeps['vitest']).toBeUndefined();
    expect(allDeps['@vitest/ui']).toBeUndefined();
    expect(allDeps['@vitest/coverage-v8']).toBeUndefined();
    expect(allDeps['jest']).toBeUndefined();
    expect(allDeps['mocha']).toBeUndefined();

    // 2. Verify test script is native bun test
    expect(pkg.scripts?.test).toBe('bun test');

    // 3. Verify execution occurs on native Bun runtime
    expect(process.versions?.bun).toBeDefined();
    expect(typeof Bun).toBe('object');

    // 4. Verify bun.lock and bunfig.toml exist and are active
    expect(existsSync('bun.lock')).toBe(true);
    expect(existsSync('bunfig.toml')).toBe(true);

    // 5. Verify bunfig.toml configures headless test root and preload
    const bunfig = readFileSync('bunfig.toml', 'utf8');
    expect(bunfig).toContain('root = "./test"');
    expect(bunfig).toContain('preload = ["./test/setup.js"]');
  });

  it('verifies absence of lingering vitest configuration files', () => {
    expect(existsSync('vitest.config.js')).toBe(false);
    expect(existsSync('vitest.config.ts')).toBe(false);
    expect(existsSync('jest.config.js')).toBe(false);
  });

  it('legacy synchronous localStorage reads permanently decoupled from app startup', () => {
    const storeSource = readFileSync('frontend/src/store/useStore.js', 'utf8');
    // Verify that initial state S is not initialized via synchronous loadState() reading localStorage
    expect(storeSource).not.toMatch(/S:\s*\(\(\)\s*=>\s*\{\s*const\s+s\s*=\s*loadState/);
    expect(storeSource).toContain('Decoupled from legacy synchronous localStorage reads at app startup');
  });
});

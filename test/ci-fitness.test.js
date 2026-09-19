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

  it('verifies web/Dockerfile uses native Bun and contains zero Vite remnants', () => {
    const dockerfile = readFileSync('web/Dockerfile', 'utf8');
    expect(dockerfile).toContain('oven/bun:1-alpine');
    expect(dockerfile).not.toMatch(/\bvite\b/i);
  });

  it('verifies absence of @vitest-environment directives across test files', () => {
    const { execSync } = require('node:child_process');
    const result = execSync('git grep "@vitest-environment" frontend/src || true', { encoding: 'utf8' }).trim();
    expect(result).toBe('');
  });

  it('verifies api/Dockerfile uses native oven/bun:1-alpine runtime', () => {
    const dockerfile = readFileSync('api/Dockerfile', 'utf8');
    expect(dockerfile).toContain('oven/bun:1-alpine');
    expect(dockerfile).toContain('bun install --production');
    expect(dockerfile).toContain('CMD ["bun", "server.js"]');
    expect(dockerfile).not.toMatch(/\bnpm ci\b/);
  });

  it('verifies mcp/src/index.js uses native bun shebang and bun start script', () => {
    const mcpIndex = readFileSync('mcp/src/index.js', 'utf8');
    expect(mcpIndex.startsWith('#!/usr/bin/env bun')).toBe(true);

    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf8'));
    expect(mcpPkg.scripts?.start).toBe('bun src/index.js');
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

  it('verifies zero import statements from vitest across all codebase files', () => {
    const { execSync } = require('node:child_process');
    const result = execSync('git grep -E "from [\'\\"]vitest[\'\\"]" frontend/ mcp/ test/ || true', { encoding: 'utf8' }).trim();
    expect(result).toBe('');
  });

  it('verifies absence of vitest and npm ci invocations in canonical GitLab CI pipeline', () => {
    const gitlabCi = readFileSync('.gitlab-ci.yml', 'utf8');
    expect(gitlabCi).not.toContain('vitest');
    expect(gitlabCi).not.toContain('npm ci');
  });
});

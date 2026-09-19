---
name: bun-perf-analyzer
description: >-
  Profile bundle sizes, benchmark runtime performance, and optimize builds for openGym
  using Bun MCP tools (analyze-bun-performance, benchmark-bun-script, run-bun-build, run-bun-script).
  Use when analyzing frontend bundle bloat, benchmarking scripts (such as fatigue monotonic probes),
  evaluating --smol memory optimization for mobile/Capacitor targets, or optimizing production builds.
---

# Bun Performance & Optimization Skill for openGym

Use this skill to analyze dependency size, benchmark runtime routines, and measure build optimizations for openGym using the Bun MCP server.

## Available Bun MCP Tools

Invoke these via `call_mcp_tool` with `ServerName: "bun"`:
- **`analyze-bun-performance`**: Analyze bundle size, dependencies, or runtime overhead.
- **`benchmark-bun-script`**: Run multi-iteration benchmarks comparing Bun flags.
- **`run-bun-build`**: Run custom Bun bundler builds with minification, sourcemaps, and code splitting.
- **`run-bun-script`**: Execute package build scripts (e.g. `build`, `build:mobile`).

---

## Key Performance Workflows

### 1. Analyzing Frontend Bundle & Dependencies

Analyze the openGym frontend entry point to evaluate chunk sizes and third-party dependency impact (React 19, Zustand, Dexie, Capacitor):

Call `analyze-bun-performance`:
```json
{
  "projectDir": "frontend",
  "entryPoint": "src/main.jsx",
  "options": {
    "bundle": true,
    "dependencies": true
  }
}
```

### 2. Benchmarking Calculation Scripts

openGym includes performance-sensitive scripts like the fatigue monotonic calculation probe (`frontend/scripts/fatigue-monotonic-probe.mjs`) and the build pipeline (`frontend/scripts/build.js`).

Benchmark script execution speed and stability across multiple runs:
Call `benchmark-bun-script`:
```json
{
  "scriptPath": "frontend/scripts/fatigue-monotonic-probe.mjs",
  "iterations": 5,
  "warmup": 1
}
```

### 3. Evaluating `--smol` Memory Optimization for Mobile (Capacitor)

openGym targets iOS and Android via Capacitor (`build:mobile`). On lower-memory mobile runtimes, evaluate memory optimization by executing scripts with `--smol`:

Call `run-bun-eval`:
```json
{
  "code": "console.log('Heap stats:', process.memoryUsage());",
  "bunArgs": ["--smol"],
  "evalDirectory": "frontend"
}
```

### 4. Running Production Builds & Verifying Output

To run the full production build pipeline:
Call `run-bun-script`:
```json
{
  "packageDir": "frontend",
  "scriptName": "build"
}
```

Or for mobile/Capacitor build:
Call `run-bun-script`:
```json
{
  "packageDir": "frontend",
  "scriptName": "build:mobile"
}
```

---

## Optimization Checklist

- [ ] Check if `dist/` contains single monolithic chunks vs split chunks.
- [ ] Ensure Service Worker build stamp in `dist/sw.js` is correctly calculated.
- [ ] Measure total bundle size: ensure total assets remain lightweight (< 2MB target).
- [ ] Profile dependency tree for accidental inclusion of test mocks (e.g. `happy-dom`, `fake-indexeddb` should only be in `devDependencies`).

---
name: bun-test-runner
description: >-
  Run, debug, and isolate tests across the openGym monorepo (frontend, api, mcp, root)
  and evaluate ad-hoc JS/TS expressions using Bun MCP tools (run-bun-test, run-bun-eval,
  run-bun-script). Use whenever running unit or integration tests, checking code coverage,
  diagnosing test regressions, or evaluating scratch assertions in the Bun runtime.
---

# Bun Test Runner Skill for openGym

Use this skill to execute and debug tests across openGym workspaces (`frontend`, `api`, `mcp`, and repository root) via the Bun MCP server.

## Available Bun MCP Tools

Invoke these via `call_mcp_tool` with `ServerName: "bun"`:
- **`run-bun-test`**: Run specific test files or directories with test runner flags.
- **`run-bun-eval`**: Evaluate arbitrary JavaScript/TypeScript snippets directly in Bun.
- **`run-bun-script`**: Run test scripts defined in `package.json`.

---

## Workspace Test Procedures

### 1. Root Monorepo Tests

- **Run all unit tests across the whole project:**
  ```json
  {
    "packageDir": ".",
    "scriptName": "test:all"
  }
  ```
  *(Tool: `run-bun-script`)*

- **Run root tests only:**
  ```json
  {
    "testPath": "test"
  }
  ```
  *(Tool: `run-bun-test`)*

### 2. Frontend Workspace Tests

The frontend uses React 19, Zustand, and Dexie (IndexedDB), with DOM emulation via Happy-DOM / LinkeDOM.

- **Run all frontend tests:**
  ```json
  {
    "packageDir": "frontend",
    "scriptName": "test"
  }
  ```
  *(Tool: `run-bun-script` — executes `bun test --isolate`)*

- **Run a specific frontend test file with bail on first failure:**
  ```json
  {
    "testPath": "frontend/test/<target-test-file>.test.js",
    "bail": 1
  }
  ```
  *(Tool: `run-bun-test`)*

- **Run frontend tests with code coverage:**
  ```json
  {
    "testPath": "frontend/test",
    "coverage": true
  }
  ```
  *(Tool: `run-bun-test`)*

### 3. API Workspace Tests

The API (`gym-api`) tests handle WebAuthn challenge/credential lifecycles, push notifications, and session verification.

- **Run all API tests:**
  ```json
  {
    "packageDir": "api",
    "scriptName": "test"
  }
  ```
  *(Tool: `run-bun-script` — executes `bun test --parallel=1`)*

- **Run a specific API test file:**
  ```json
  {
    "testPath": "api/test/<target-test-file>.test.js"
  }
  ```
  *(Tool: `run-bun-test`)*

### 4. MCP Workspace Tests

openGym has its own embedded MCP server in `mcp/`:
- **Run openGym MCP server tests:**
  ```json
  {
    "packageDir": "mcp",
    "scriptName": "test"
  }
  ```
  *(Tool: `run-bun-script`)*

---

## Ad-Hoc Runtime Evaluation with `run-bun-eval`

Use `run-bun-eval` to quickly verify database structures, hashing algorithms, or module logic without creating temporary test files:

### Example: Testing WebAuthn / Crypto Helper in API Context
```json
{
  "code": "import crypto from 'node:crypto'; console.log(crypto.randomBytes(12).toString('base64url'));",
  "evalDirectory": "api"
}
```

### Example: Testing Frontend Dexie / IndexedDB Mock
```json
{
  "code": "import 'fake-indexeddb/auto'; import Dexie from 'dexie'; const db = new Dexie('test'); db.version(1).stores({ workouts: '++id, date' }); await db.workouts.add({ date: '2026-09-19' }); const count = await db.workouts.count(); console.log({ count });",
  "evalDirectory": "frontend"
}
```

---

## Debugging and Verification Protocol

1. **Isolate Failures**: When a test fails, run the failing test file individually using `run-bun-test` with `bail: 1`.
2. **Examine Stderr & Stack Trace**: Note the assertion mismatch or unhandled promise rejection.
3. **Verify Fix**: Re-run the specific test file with `run-bun-test`, then run the workspace suite (`run-bun-script` with `scriptName: "test"`) to ensure no regressions.

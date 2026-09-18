# Domain Glossary (Saṃjñā) — Gahana Profile

Governing terminology for openGym's Dexie.js IndexedDB persistence, bitemporal audit engine, and Bun toolchain.

---

## 1. Persistence & Database

- **`dexie-database`**: Client-side IndexedDB wrapper providing typed object stores, compound secondary indexing, schema migrations (`db.version()`), and reactive subscriptions.
- **`local-storage-snapshot`**: Legacy monolithic JSON string (`gym_state_v1`) stored in browser `localStorage`. Subject to 5MB browser storage quotas, synchronous serialization stalls, and total corruption vulnerability.
- **`object-store`**: A distinct IndexedDB collection corresponding to a normalized entity domain (e.g., `workouts`, `sets`, `routines`, `bodyweight`, `auditLog`).
- **`reactive-live-query`**: An observable database query hook (`useLiveQuery`) that automatically re-evaluates and triggers React component re-renders when underlying IndexedDB records mutate.
- **`lossless-migration-runner`**: One-time startup process that parses `gym_state_v1`, verifies schema integrity, writes normalized rows across IndexedDB stores within an atomic transaction, and retains a fallback backup.

---

## 2. Temporal & Audit Concepts

- **`valid-time`**: The real-world timestamp (`start`, `end`, `d`) when an athletic activity physically occurred. User-editable for backfilled or corrected sessions.
- **`transaction-time`**: The monotonic system timestamp (`txTime`, `createdAt`, `updatedAt`) when a record was inserted, updated, or soft-deleted in IndexedDB. Immutable.
- **`bitemporal-record`**: A data row carrying both `valid-time` (when it happened) and `transaction-time` (when the system recorded it).
- **`audit-log-entry`**: An append-only event row in `auditLog` recording `{ id, entity, entityId, op, validTime, txTime, snapshot }`. Required by Gahana profile to ensure non-destructive history.
- **`as-of-query`**: A projection retrieving entity state as it existed at a specified historical date, taking into account retroactive revisions recorded in the `auditLog`.
- **`soft-deletion`**: Marking a record with `_deleted: true` and appending an audit record, rather than issuing a destructive physical purge (`DELETE`), preserving sync and audit recoverability.

---

## 3. Athletic & Workout Domain

- **`workout-session`**: A completed or in-progress training event holding metadata (name, date, start/end timestamps, bodyweight, volume) and a collection of exercise entries.
- **`exercise-entry`**: A container within a workout session grouping all sets performed for a single movement (e.g., Barbell Bench Press).
- **`set-record`**: Atomic unit of physical effort. Characterized by:
  - `phase`: `'work'` (target session effort) vs `'warmup'` (preparatory ramp).
  - `type`: `'straight'` (standard set) vs `'dropset'` (immediate reduced-load drop rows) vs `'restpause'` (intra-set cluster bursts).
  - `load`: Weight in profile units (`w`) or bodyweight-relative added load.
  - `volume`: Load multiplied by completed repetitions ($w \times r$).
  - `effort`: Proximity to muscular failure measured in RIR (Reps in Reserve, 0–6) or RPE (Rating of Perceived Exertion, 6–10).
- **`routine-template`**: Blueprint for a workout session specifying target exercise slots, prescribed set/rep ranges, and default progression policies.
- **`progression-policy`**: Deterministic rule (Linear, Greyskull LP, Double Progression, Time) prescribing next-session weight/rep targets based on historical set completion.

---

## 4. Toolchain & Runtime (Bun)

- **`bun-runtime`**: High-performance JavaScript runtime executing the API server (`api/server.js`) and auxiliary backend scripts.
- **`bun-package-manager`**: Dependency resolver and installer producing `bun.lock` (replaces `npm` and `package-lock.json`).
- **`bun-test-runner`**: Built-in test execution engine (`bun test`) running unit and integration suites using `bun:test` primitives (replaces `vitest` and `node --test`).
- **`bun-bundler`**: Fast frontend asset compiler and bundler powering the client build.

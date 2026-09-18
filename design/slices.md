# Vertical Slices Build Order (Phase 4 — Prayoga)

Executable build order structured into end-to-end vertical slices. Each slice integrates real persistence, domain invariants, and BDD verification tests—never horizontal layers.

---

## Slice 1: `1-bun-toolchain-and-lossless-migration`

```
slice:        1-bun-toolchain-and-lossless-migration
karma:        Bun toolchain initialization + Dexie database setup + atomic legacy migration
karaṇa:       Bun v1.4.2 CLI, Dexie.js v4, fake-indexeddb, happy-dom
adhikaraṇa:   package.json, bunfig.toml, frontend/src/db/, frontend/src/store/migration.js
sampradāna:   Slice 2 inherits verified Bun test runner and initialized Dexie database stores
slice-branch: slice/1-bun-toolchain-and-lossless-migration
traceability:
  journeys: [jrn-lossless-storage-migration, jrn-bun-unified-development-pipeline]
  screens:  [scr-migration-gate, scr-developer-test-dashboard]
```

### Done-When Acceptance Criteria
1. `bun install` resolves dependencies into `bun.lock`, and `bun test` executes the test suite in $<200\text{ ms}$ with `fake-indexeddb` and `happy-dom` preloaded — proven by `test/bun-toolchain.test.js`.
2. App boot detects schema version 0 and losslessly migrates all workouts, routines, weigh-ins, and settings from `localStorage.gym_state_v1` into Dexie IndexedDB in an atomic transaction, writes migration receipt, and mirrors backup to Capacitor storage via `nativeSave` (DEC-07) — proven by `test/migration-lossless.test.js`.
3. Malformed or corrupted `gym_state_v1` JSON payloads are safely copied to `gym_state_v1_corrupt_backup` without data loss, recovering valid records and alerting user — proven by `test/migration-corrupt-fallback.test.js`.
4. Blocked IndexedDB environment (strict private mode or quota exhaustion) falls back gracefully to in-memory mode and offers direct JSON backup export — proven by `test/migration-blocked-idb.test.js`.

---

## Slice 2: `2-bitemporal-workout-logging-and-audit`

```
slice:        2-bitemporal-workout-logging-and-audit
karma:        Active workout execution + bitemporal audit trail + remote sync export projection
karaṇa:       Dexie transactions, Dexie table hooks (`db.table.hook`), useLiveQuery, syncExportProjection
adhikaraṇa:   frontend/src/views/Workout.jsx, frontend/src/views/History.jsx, frontend/src/lib/sync.js
sampradāna:   Slice 3 inherits working bitemporal workout execution, reactive UI hooks, and sync adapter
slice-branch: slice/2-bitemporal-workout-logging-and-audit
traceability:
  journeys: [jrn-bitemporal-workout-logging]
  screens:  [scr-active-workout-runner, scr-history-detail-editor]
```

### Done-When Acceptance Criteria
1. Tapping check on a set executes in $<10\text{ ms}$ within a Dexie transaction scoped to `[workouts, sets, auditLog]`, immediately updating `useLiveQuery` active workout view — proven by `test/workout-logging.test.js`.
2. Completing a workout session atomically computes `vol`, stamps `end` timestamp, updates the `lastPerformance` table for all session exercises, and appends completion audit entry — proven by `test/workout-finish.test.js`.
3. Retroactive edit of past workout date or load creates an immutable revision record in `auditLog` capturing actor `who`, valid-time, and transaction-time without destroying historical state (Gahana temporal cycle) — proven by `test/audit-bitemporal-cycle.test.js`.
4. Active workout queries execute in $\le 3$ read-ops via compound index `[workoutId+order]` and `lastPerformance.where('exerciseId').anyOf()` with zero N+1 queries — proven by `test/bench/active-read.test.js`.
5. Debounced remote sync invokes `syncExportProjection`, serializing Dexie tables into monolithic `body.state` JSON matching backend `PUT /api/data` contract (DEC-05) and handling HTTP 409 conflict detection — proven by `test/sync-projection.test.js`.

---

## Slice 3: `3-routines-bodyweight-and-state-cleanup`

```
slice:        3-routines-bodyweight-and-state-cleanup
karma:        Routines, bodyweight weigh-ins, custom exercises, scalability stress testing & legacy purge
karaṇa:       Dexie live queries, React 19 hooks, bun test performance harness
adhikaraṇa:   frontend/src/views/Routines.jsx, frontend/src/views/Stats.jsx, frontend/src/store/useStore.js
sampradāna:   Final operational release; project dissolution sweep
slice-branch: slice/3-routines-bodyweight-and-state-cleanup
traceability:
  journeys: [jrn-lossless-storage-migration, jrn-bitemporal-workout-logging]
  screens:  [scr-active-workout-runner, scr-history-detail-editor]
```

### Done-When Acceptance Criteria
1. Routine templates create, edit, and soft-delete (`_deleted: true`) via Dexie transactions, preserving foreign key integrity in historical workouts — proven by `test/routine-management.test.js`.
2. Daily weigh-ins enforce unique date index `&d`, upserting same-day records and capturing audit entries — proven by `test/bodyweight-logging.test.js`.
3. Scalability benchmark querying 25,000 sets and 1,000 workouts completes in $<50\text{ ms}$ without UI thread freezing — proven by `test/bench/scale-25k-sets.test.js`.
4. Full test suite executes cleanly under `bun test` in CI in $<500\text{ ms}$ with zero Vitest or Node dependencies — proven by `test/ci-fitness.test.js`.
5. Legacy synchronous `localStorage` reads permanently decoupled from app startup; dissolution sweep dissolves ledger into passing tests.

---

## Slice Execution Order & Branch Progression

```text
trunk (tip)
  └── slice/1-bun-toolchain-and-lossless-migration
        └── build → tests green → slice-review → slice-release → sweep
              └── trunk fast-forwards
                    └── slice/2-bitemporal-workout-logging-and-audit
                          └── build → tests green → slice-review → slice-release → sweep
                                └── trunk fast-forwards
                                      └── slice/3-routines-bodyweight-and-state-cleanup
                                            └── build → tests green → slice-review → slice-release → sweep → trunk
```

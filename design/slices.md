# Vertical Slices Build Order (Phase 4 — Prayoga)

Executable build order structured into end-to-end vertical slices. Each slice integrates real persistence, domain invariants, and BDD verification tests—never horizontal layers.

---

## Slice 1: `1-bun-toolchain-and-lossless-migration` [SHIPPED]

```
slice:        1-bun-toolchain-and-lossless-migration
status:       shipped & swept
branch:       slice/1-bun-toolchain-and-lossless-migration
commit:       49439c6
review:       ANUBIS PASS
traceability:
  journeys: [jrn-lossless-storage-migration, jrn-bun-unified-development-pipeline]
  screens:  [scr-migration-gate, scr-developer-test-dashboard]
done-when:
  1. bun install & test <200ms — proven by test/bun-toolchain.test.js
  2. atomic lossless migration & Capacitor mirror — proven by test/migration-lossless.test.js
  3. corrupt JSON fallback & recovery — proven by test/migration-corrupt-fallback.test.js
  4. blocked IDB in-memory fallback — proven by test/migration-blocked-idb.test.js
```

---

## Slice 2: `2-bitemporal-workout-logging-and-audit` [SHIPPED]

```
slice:        2-bitemporal-workout-logging-and-audit
status:       shipped & swept
slice-branch: slice/2-bitemporal-workout-logging-and-audit
commit:       bfd8183
review:       ANUBIS PASS
traceability:
  journeys: [jrn-bitemporal-workout-logging]
  screens:  [scr-active-workout-runner, scr-history-detail-editor]
done-when:
  1. tapping check on a set executes in <10ms within scoped transaction and updates live query — proven by test/workout-logging.test.js
  2. completing workout session atomically computes vol, stamps end timestamp, updates lastPerformance, and appends completion audit — proven by test/workout-finish.test.js
  3. retroactive edit of past workout date or load creates immutable revision in auditLog capturing who, valid-time, and tx-time — proven by test/audit-bitemporal-cycle.test.js
  4. active workout queries execute in <= 3 read-ops via compound index and batch projection with zero N+1 queries — proven by test/bench/active-read.test.js
  5. debounced remote sync invokes syncExportProjection, serializing Dexie tables into monolithic body.state JSON and handling HTTP 409 conflict detection — proven by test/sync-projection.test.js
```

---

## Slice 3: `3-routines-bodyweight-and-state-cleanup` [SHIPPED]

```
slice:        3-routines-bodyweight-and-state-cleanup
status:       shipped & swept
slice-branch: slice/3-routines-bodyweight-and-state-cleanup
commit:       5e59ce5
review:       ANUBIS PASS
traceability:
  journeys: [jrn-lossless-storage-migration, jrn-bitemporal-workout-logging]
  screens:  [scr-active-workout-runner, scr-history-detail-editor]
done-when:
  1. routine templates create, edit, and soft-delete via Dexie transactions, preserving foreign key integrity in historical workouts — proven by test/routine-management.test.js
  2. daily weigh-ins enforce unique date index &d, upserting same-day records and capturing audit entries — proven by test/bodyweight-logging.test.js
  3. scalability benchmark querying 25,000 sets and 1,000 workouts completes in <50ms without UI thread freezing — proven by test/bench/scale-25k-sets.test.js
  4. full test suite executes cleanly under bun test in CI with zero Vitest or Node dependencies — proven by test/ci-fitness.test.js
  5. legacy synchronous localStorage reads permanently decoupled from app startup; dissolution sweep dissolves ledger into passing tests — proven by frontend/src/store/useStore.js
```

---

## Slice 4: `4-complete-bun-toolchain-and-old-stack-retirement`

```
slice:        4-complete-bun-toolchain-and-old-stack-retirement
status:       shipped & swept
slice-branch: slice/4-complete-bun-toolchain-and-old-stack-retirement
commit:       0811212
review:       ANUBIS PASS
traceability:
  journeys: [jrn-bun-unified-development-pipeline]
  screens:  [scr-developer-test-dashboard]
done-when:
  1. root package.json declares workspaces ["frontend", "api", "mcp"] resolving all dependencies into a single root bun.lock — proven by test/bun-workspaces.test.js
  2. all remaining Vitest dependencies, Vitest config files, and npm lockfiles permanently purged across the repository (frontend, api, mcp) — proven by test/ci-fitness.test.js
  3. frontend builds cleanly via bun run build producing production assets in frontend/dist without Vite CLI failures — proven by test/bun-workspaces.test.js
  4. API server test suite executes cleanly under native Bun runtime (bun test) — proven by test/api-bun.test.js
  5. full workspace test suite across all packages executes cleanly under native Bun — proven by test/ci-fitness.test.js
```

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
                                            └── build → tests green → slice-review → slice-release → sweep
                                                  └── trunk fast-forwards
                                                        └── slice/4-complete-bun-toolchain-and-old-stack-retirement
                                                              └── build → tests green → slice-review → slice-release → sweep → trunk
```

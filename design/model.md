# Data Model & Invariants (Phase 3 — Dhātu)

Normalized Dexie.js (IndexedDB) schema, write-side invariants, sandhi joining tier (commands and derived mechanisms), four-question threat pass, guṇa attachment matrix, and bidirectional veto walk results under the Gahana profile.

---

## 1. Write Side: Domain Invariants

Domain rules enforced at the database transaction boundary:

1. **INV-01 (Atomic Set Enclosure)**: A set cannot exist without an enclosing workout session. All mutations to an exercise entry's sets must execute within a Dexie transaction scoped to `[workouts, sets, lastPerformance, auditLog]`.
2. **INV-02 (Monotonic Audit Logging — Gahana Mandate)**: Every modification or soft-deletion of `workouts`, `sets`, `routines`, and `bodyweight` must append an immutable record to `auditLog` containing `{ entity, entityId, op, who, validTime, txTime, snapshot }`. Architectural enforcement point: Dexie middleware table hooks (`db.table.hook('creating')`, `db.table.hook('updating')`, `db.table.hook('deleting')`) ensure no write can bypass audit capture. No destructive physical deletion is permitted on historical records.
3. **INV-03 (Idempotent Lossless Migration)**: Parsing and transforming `localStorage.gym_state_v1` into Dexie stores must occur inside a single atomic transaction. If any entity insert fails, the transaction aborts completely, leaving `localStorage` untouched and preserving raw string backup under `gym_state_v1_backup`.
4. **INV-04 (Optimistic Sync Concurrency)**: The client state maintains a monotonic revision counter (`_rev`). When `syncExportProjection` triggers `PUT /api/data`, the client supplies `baseRev = currentRev`. If the server responds with HTTP 409, client aborts overwrite and triggers three-way merge.
5. **INV-05 (Soft-Deletion & Reference Preservation)**: Deleting a routine or custom exercise marks `_deleted: true` and appends an audit entry. Existing historical workouts retain their original foreign key references.
6. **INV-06 (Numeric & Rep Range Integrity)**: Enforced via a Dexie write-boundary validation hook (`db.sets.hook('creating')` and `'updating'`). Weights must be non-negative finite numbers ($w \ge 0$). Reps must be integers ($r \ge 0$). RIR values are clamped to $0 \le \text{RIR} \le 6$; RPE values are clamped to $6 \le \text{RPE} \le 10$.
7. **INV-07 (Session Lifecycle Completion)**: Completing a workout session must atomically compute `vol` ($\sum w \times r$), stamp `end` timestamp, update the `lastPerformance` table for all exercises in the session, and evaluate new PR milestones.

---

## 2. Read Side: Dexie.js Schema & Projections

### A. Dexie Schema Definition (`v1`)

```javascript
import Dexie from 'dexie';

export const db = new Dexie('openGym');

db.version(1).stores({
  // Workouts session store
  workouts: 'id, d, routineId, name, start, end, vol, _rev, _deleted, createdAt, updatedAt',
  
  // Exercise entries within a session (ordering and per-exercise notes)
  workoutEntries: '++id, workoutId, exerciseId, order',
  
  // Sets: compound index [workoutId+order] enables single-op retrieval in sequence.
  // exerciseId is denormalized directly onto sets to allow 3-read-op history assembly.
  sets: '++id, workoutId, entryId, exerciseId, [workoutId+order], order, w, r, done, phase, type, rir, rpe',
  
  // Routine templates and their prescribed exercises
  routines: 'id, name, _deleted, updatedAt',
  routineExercises: '++id, routineId, exerciseId, order',
  
  // Bodyweight records (unique date index &d prevents duplicate daily weigh-ins)
  bodyweight: 'id, &d, w, t, createdAt, _deleted',
  
  // Custom exercises registered into EXIDX
  customExercises: 'id, name, category, equipment, muscles, _deleted, updatedAt',
  
  // Last performance cache: enables 1-op retrieval of previous weights/reps during active workout
  lastPerformance: 'exerciseId, w, r, d, workoutId',
  
  // Scalar settings and standing notes
  settings: 'key, value, updatedAt',
  
  // Gahana bitemporal audit trail (captures actor 'who', valid-time, and transaction-time)
  auditLog: '++id, entity, entityId, op, who, validTime, txTime',
  
  // Local-first offline mutation queue
  syncQueue: '++id, op, entity, entityId, status, createdAt'
});
```

### B. Projections (Phase 2 Read Models & Read-Ops Walk)

1. **`MigrationStatusReadModel`**:
   - Query: `db.settings.get('migration_receipt')`
   - Read-ops: **1**
   - Consumed by: `migration-gate`

2. **`ActiveWorkoutReadModel`**:
   - Query:
     1. `db.workouts.get(activeId)` (Workout header)
     2. `db.sets.where('[workoutId+order]').between([activeId, Dexie.minKey], [activeId, Dexie.maxKey])` (All active sets in order)
     3. `db.lastPerformance.where('exerciseId').anyOf(activeExerciseIds)` (Previous performance marks across all exercises)
   - Read-ops: **3** (Satisfies $\le 3$ read-ops gate constraint; zero N+1 queries)
   - Consumed by: `active-workout-runner`

3. **`WorkoutHistoryDetailReadModel`**:
   - Query:
     1. `db.workouts.get(id)` (Workout metadata)
     2. `db.sets.where('workoutId').equals(id)` (All sets; grouped by denormalized `exerciseId` in-memory without querying `workoutEntries`)
     3. `db.auditLog.where('entityId').equals(id).reverse().limit(10)` (Audit trail revisions)
   - Read-ops: **3** (Satisfies $\le 3$ read-ops gate constraint)
   - Consumed by: `history-detail-editor`

4. **`BunTestReportReadModel`**:
   - Query: Static test runner memory / CLI stdout
   - Read-ops: **0**
   - Consumed by: `developer-test-dashboard`

---

## 3. Sandhi Joining Tier (Commands & Mechanisms)

### A. Command List

#### Command 1: `MigrateLocalStorage`
- **kartā-surface**: returning-user on cold boot.
- **negative-surface**: unauthenticated remote clients, background worker threads.
- **karma**: `localStorage.gym_state_v1` $\rightarrow$ normalized Dexie tables.
- **invariants**: INV-03 (atomic transaction, backup retained).
- **idempotency**: Idempotent. Guarded by `localStorage.getItem('gym_migrated_v1')`.
- **mechanism**: sync (user awaits boot confirmation before dashboard renders).
- **emits**: `database-migrated` $\rightarrow$ updates `MigrationStatusReadModel`.

#### Command 2: `StartWorkout`
- **kartā-surface**: athlete initiating session.
- **negative-surface**: background sync loop.
- **karma**: `workouts` table (creates row with `end = null`), `sets` table (seeds planned sets from routine).
- **invariants**: INV-01 (atomic enclosure), INV-04 (device-local active session excluded from remote sync).
- **idempotency**: Idempotent with client-generated workout UUID.
- **mechanism**: sync (local Dexie write $<10\text{ ms}$).
- **emits**: `workout-started` $\rightarrow$ renders `active-workout-runner`.

#### Command 3: `CheckSet`
- **kartā-surface**: athlete during active workout.
- **negative-surface**: background sync daemon, guest without storage.
- **karma**: set record in `sets` table (`done: true`, `w`, `r`, `rir`, `rpe`).
- **invariants**: INV-01 (atomic set enclosure), INV-02 (audit log hook append), INV-06 (bounds validation).
- **idempotency**: Idempotent. Re-checking updates timestamps but preserves values.
- **mechanism**: sync (local transaction commit $<10\text{ ms}$).
- **emits**: `set-logged` $\rightarrow$ triggers reactive `ActiveWorkoutReadModel` re-render via `useLiveQuery`; enqueues `syncQueue` item.

#### Command 4: `FinishWorkout`
- **kartā-surface**: athlete completing session.
- **negative-surface**: background daemons.
- **karma**: `workout` record (`end` timestamp, `vol` calculation), `lastPerformance` table (upserts latest marks per exercise), `auditLog` (completion entry).
- **invariants**: INV-01, INV-02, INV-07 (atomic volume calculation and last performance update).
- **idempotency**: Idempotent. Re-finishing completed workout updates `vol` if sets were modified.
- **mechanism**: sync (local transaction commit $<20\text{ ms}$) + async (background PR and progression re-evaluation).
- **emits**: `workout-finished` $\rightarrow$ marks workout ready for `syncExportProjection`.

#### Command 5: `EditPastWorkout`
- **kartā-surface**: athlete reviewing history.
- **negative-surface**: read-only shared viewers.
- **karma**: historical workout and set records.
- **invariants**: INV-02 (bitemporal audit append with valid-time, transaction-time, and actor `who`).
- **idempotency**: Non-idempotent without revision tag. Each call creates an immutable revision record in `auditLog`.
- **mechanism**: sync (local write) + async (background PR re-evaluation).
- **emits**: `workout-amended` $\rightarrow$ updates `WorkoutHistoryDetailReadModel`; enqueues `syncQueue` item.

#### Command 6: `CreateRoutine`
- **kartā-surface**: athlete designing workout plan.
- **negative-surface**: background workers.
- **karma**: `routines` table and `routineExercises` table.
- **invariants**: INV-05 (routine integrity).
- **idempotency**: Idempotent with routine UUID.
- **mechanism**: sync (local write).
- **emits**: `routine-created` $\rightarrow$ updates routine picker read model.

#### Command 7: `LogBodyweight`
- **kartā-surface**: athlete entering morning weigh-in.
- **negative-surface**: automated daemons.
- **karma**: `bodyweight` table.
- **invariants**: INV-02 (audit logging), unique date index `&d` (upsert on duplicate date).
- **idempotency**: Idempotent for same date and weight.
- **mechanism**: sync (local write).
- **emits**: `bodyweight-logged` $\rightarrow$ updates weight trend charts; enqueues `syncQueue` item.

#### Command 8: `PushRemoteSync`
- **kartā-surface**: client background sync loop.
- **negative-surface**: offline client, unauthenticated user.
- **karma**: Dexie stores $\rightarrow$ monolithic `body.state` JSON $\rightarrow$ `api/server.js:867`.
- **invariants**: INV-04 (monotonic revision check, conflict detection).
- **idempotency**: Conditional write. Enforces `baseRev === curRev`.
- **mechanism**: async (debounced network push).
- **emits**: `remote-synced` $\rightarrow$ updates `_rev` and empties `syncQueue`.

### B. Mechanisms Derivation Lines

1. `flow: local-storage-migration` $\cdot$ **sync** $\cdot$ producer: `migration-runner` $\cdot$ completion updates `MigrationStatusReadModel`.
2. `flow: active-session-management` $\cdot$ **sync** $\cdot$ producer: user start/finish $\cdot$ updates `ActiveWorkoutReadModel` and `lastPerformance`.
3. `flow: set-checkoff` $\cdot$ **sync** $\cdot$ producer: user tap $\cdot$ commits Dexie transaction $<10\text{ ms}$ $\cdot$ updates `ActiveWorkoutReadModel`.
4. `flow: remote-sync-push` $\cdot$ **async** (implied-state: `offline-sync-pending`) $\cdot$ producer: `syncExportProjection` daemon $\cdot$ updates sync banner.
5. `flow: retroactive-history-recalculation` $\cdot$ **async** (implied-state: `recalculating-prs`) $\cdot$ producer: `progression-recalculator` worker $\cdot$ updates PR badges.

---

## 4. Four-Question Threat Pass (Guṇa Security)

1. **What are we building?**
   - A local-first client database in IndexedDB with bitemporal audit logging and an adapter syncing to a Node/Bun backend.
2. **What can go wrong?**
   - *Spoofing*: Attacker tampers with `localStorage` before migration.
   - *Tampering*: Concurrent writes corrupting workout set indices or revision counters.
   - *Replay*: Old sync push overwriting newer offline edits.
   - *Exfiltration*: Malicious scripts reading IndexedDB data in shared browser contexts.
3. **What will we do about it?**
   - *Mitigation 1*: Schema validation validates all records before Dexie commit (INV-03, INV-06).
   - *Mitigation 2*: Compound index `[workoutId+order]` enforces strict set ordering.
   - *Mitigation 3*: Optimistic concurrency via `_rev` comparison rejects stale pushes with HTTP 409 (INV-04).
   - *Mitigation 4*: Same-Origin Policy protects IndexedDB sandbox; passkey WebAuthn secures API endpoints.
4. **Did we do a good job?**
   - Continuous verification through BDD scenarios in `bun test` verifying validation rejects, audit trail captures, and conflict resolution.

---

## 5. Guṇa Attachment Matrix

| Guṇa | Attachment Point | Gate Check | Code Destination (CI Fitness Function) |
|---|---|---|---|
| **Performance (Latency)** | `set-checkoff` flow | Dhātu Veto Walk | Benchmark test: 100 sequential set checkoffs in $<100\text{ ms}$ (`test/bench/set-write.test.js`) |
| **Performance (Query)** | `ActiveWorkoutReadModel` | Dhātu Veto Walk | Benchmark test: `useLiveQuery` active workout fetch in $<16\text{ ms}$ (`test/bench/active-read.test.js`) |
| **Scalability (Volume)** | `sets` & `workouts` stores | Dhātu Veto Walk | Large-volume stress test: 25,000 sets and 1,000 workouts query in $<50\text{ ms}$ (`test/bench/scale-25k-sets.test.js`) |
| **Reliability (Idempotency)** | `MigrateLocalStorage` | Phase 1 BDD | `test/store/migration.test.js` (multiple migration runs yield identical store state) |
| **Integrity (Bitemporal)** | `EditPastWorkout` | Phase 1 BDD | `test/store/audit-trail.test.js` (verifies `auditLog` captures `who`, valid-time, and tx-time) |
| **Security (Bounds)** | `CheckSet` command | Phase 3 Threat Pass | `test/store/bounds-validation.test.js` (negative tests for negative weights, out-of-range RPE) |
| **Observability (Alerts)** | `syncQueue` flow | Phase 3 Sandhi | Telemetry alert test: `syncQueue` dead-letter drop surfaces UI warning (`test/sync/queue-alert.test.js`) |

---

## 6. Bidirectional Veto Walk

### Forward Veto: Read-Ops Counting ($\le 3$ Read-Ops Gate)

| Screen | Read Model | Query Strategy | Read-Ops | Veto Status |
|---|---|---|:---:|:---:|
| `migration-gate` | `MigrationStatusReadModel` | `db.settings.get('migration_receipt')` | **1** | **PASS** |
| `active-workout-runner` | `ActiveWorkoutReadModel` | `db.workouts.get(id)` + `db.sets.where('[workoutId+order]').between(...)` + `db.lastPerformance.where('exerciseId').anyOf(...)` | **3** | **PASS** |
| `history-detail-editor` | `WorkoutHistoryDetailReadModel` | `db.workouts.get(id)` + `db.sets.where('workoutId').equals(id)` + `db.auditLog.where('entityId').equals(id)` | **3** | **PASS** |
| `developer-test-dashboard` | `BunTestReportReadModel` | In-memory runner stdout | **0** | **PASS** |

*All screens satisfy the $\le 3$ read-ops constraint. Adding `exerciseId` to `sets` and `lastPerformance` eliminates all N+1 queries.*

### Reverse Veto: Implied-States Representability

| Screen Implied-State | Schema Representation | Producing Mechanism | Veto Status |
|---|---|---|:---:|
| `migrating` | `settings.key = 'migration_status'` value `'migrating'` | `migration-runner` (sync) | **PASS** |
| `corrupt-fallback-toast` | `localStorage.gym_state_v1_corrupt_backup` key existence | `migration-runner` (sync) | **PASS** |
| `idb-blocked-alert` | Caught exception from `Dexie.open()` | Client boot handler | **PASS** |
| `migration-complete` | `settings.key = 'migration_status'` value `'complete'` | `migration-runner` (sync) | **PASS** |
| `logging-active` | `workouts.end = null` | `StartWorkout` command | **PASS** |
| `set-saving` | Optimistic in-memory flag pending Dexie transaction commit | `CheckSet` command | **PASS** |
| `offline-sync-pending` | `syncQueue.count() > 0` | `syncQueue` table | **PASS** |
| `tx-failed-retry` | Caught exception in Dexie transaction callback | `CheckSet` command | **PASS** |
| `viewing-as-of` | `workouts.d` (valid date) | Read projection | **PASS** |
| `editing-retroactive` | Active UI edit mode | `history-detail-editor` | **PASS** |
| `recalculating-prs` | Transient worker computation state | `progression-recalculator` (async) | **PASS** |
| `audit-saved` | Confirmed append to `auditLog` store | `EditPastWorkout` command | **PASS** |
| `running` | Process execution tick | `bun test` runner | **PASS** |
| `all-green` | Clean process exit code 0 | `bun test` runner | **PASS** |
| `test-failure-reported` | Process exit code > 0 with failure report | `bun test` runner | **PASS** |

*All 15 implied-states have direct representation in the schema, transaction hooks, or process lifecycle. Zero unrepresented states.*

---

## 7. Business-Domain Evidence Recheck

| Claim / Invariant | Modal Class | Source & Citation | Evidence Status | Impact on Gate |
|---|---|---|---|---|
| Compound indexes in IndexedDB support bounded multi-key range queries | `must-be` | W3C IndexedDB Spec 3.0 (§4.2) | Established | Enables 1-op ordered set retrieval. |
| Dexie.js v4 transactions provide full ACID guarantees over specified stores | `must-be` | Dexie.js Transaction Docs | Established | Guarantees INV-01 and INV-02. |
| Gahana profile mandates immutable audit trail on retroactive edits | `must-be` | Sutradhāra Gahana Overlay (`references/gahana.md:79`) | Established | Complies via `auditLog` schema with `who` field. |
| In-memory SQLite shims (`fake-indexeddb`) replicate W3C IndexedDB in Node/Bun | `could-be` | `fake-indexeddb` npm repository | Established | Enables headless `bun test` suite. |
| Exercise catalog and progression rules do not vary per regulatory jurisdiction | `must-be` (apavāda) | DEC-08 (`design/decisions.md`) | Established | Justifies static bundling over dynamic DB versioning. |

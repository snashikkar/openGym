# Model Archaeology (Phase 0 — Retrofit + Gahana)

Archaeological survey of openGym's existing data structures prior to Dexie.js (IndexedDB) and Bun ecosystem migration.

---

## Entity Archaeology Maps

### 1. `workouts` (Session History)
- **entity**: `workouts`
- **storage**: Single JSON array inside `gym_state_v1` (localStorage) and per-user state file (`DATA_DIR/<uid>.json`).
- **rows**: ~30–500 sessions per active user profile (demo seed: 36 sessions across 12 weeks).
- **invariants-held**:
  - `w.id`: Unique string UUID per workout.
  - `w.entries`: Array of exercise entries; each contains `sets[]`.
  - `set.done`: Boolean checkoff flag indicating completed performance.
  - Optimistic locking: Server validates `_rev` vs `baseRev` on whole document `PUT /api/data`.
- **invariants-violated**:
  - `w.vol`: Denormalized total volume sum ($w \times r$); drifts if sets are edited without full workout recalculation.
  - `w.prs`: Static array of exercise IDs achieving a PR during that session; retroactively editing an earlier session invalidates downstream `prs` lists without automatic recomputation.
  - `w.bw`: Snapshot of bodyweight at session start; orphaned if bodyweight log for that date is revised.
  - No foreign key integrity: `routineId` references can point to deleted routines.
- **dead-columns**:
  - `entry.topW`: Stored on some entries, but stats and views compute top weight dynamically from `sets`.
  - `w.prs`: Persisted on the workout object, but historical PR views re-evaluate raw set history rather than trusting this snapshot.
- **implicit-states**:
  - `set.phase`: Absent/undefined implies `'work'`; legacy `warmup: true` boolean is checked as fallback.
  - `set.type`: Absent/undefined implies `'straight'`; `'dropset'` requires `drops[]`, `'restpause'` requires `clusters[]`.
  - `effort`: Stored as `null` when unconfigured to fall back to legacy `showRir` boolean; otherwise `'none'` | `'rir'` | `'rpe'`.
  - `w.end`: Null during active in-progress workout; populated on completion.
  - `active`: In Zustand, `s.active !== null` denotes in-progress workout; stripped by server (`delete body.state.active`) before persistence.

---

### 2. `routines` (Workout Templates)
- **entity**: `routines`
- **storage**: Array inside `gym_state_v1` and `<uid>.json`.
- **rows**: 3–20 templates per user.
- **invariants-held**:
  - `routine.id`: Unique identifier.
  - `routine.ex[]`: Array of exercise configuration objects.
- **invariants-violated**:
  - Dangling pointers: Deleting a routine leaves references in `week` (`{ 1: routineId }`), `dayPlan` (`{ [iso]: routineId }`), and past `workouts`.
  - Missing constraints: No validation on exercise configurations (e.g. negative sets/reps or invalid progression names).
- **dead-columns**:
  - `routine.desc`: Present in starter routines, rarely rendered in workout execution views.
- **implicit-states**:
  - `cfg.progressionPolicy`: Undefined implies `'off'` (no automatic progression).
  - `cfg.targetRpe`: Undefined implies no effort target.

---

### 3. `bodyweight` (Weigh-in Records)
- **entity**: `bodyweight`
- **storage**: Array of `{ d, w, t }` in `gym_state_v1`.
- **rows**: 10–500 entries per user.
- **invariants-held**: None enforced.
- **invariants-violated**:
  - Non-unique dates: Multiple entries with identical `d` (`YYYY-MM-DD`) can be inserted.
  - Non-numeric values: Manual input bypasses validation on import.
- **dead-columns**:
  - `t` (timestamp ms): Logged by weigh-in modal, but timeline charts bucket strictly by `d`.
- **implicit-states**: None.

---

### 4. `customEx` (Custom Exercises)
- **entity**: `customEx`
- **storage**: Array in `gym_state_v1`.
- **rows**: 0–50 per profile.
- **invariants-held**:
  - Registered into runtime `EXIDX` lookup table on app initialization (`registerCustom()`).
- **invariants-violated**:
  - Orphaned exercise IDs: Deleting a custom exercise leaves orphaned `id`s in `workouts`, `routines`, `exNotes`, and `barWeights`.
- **dead-columns**:
  - `tips` and `instructions`: Rarely populated for user-created movements.
- **implicit-states**:
  - `bw: true`: Movement is bodyweight-based (added load starts from 0 kg).
  - `perSide: true`: Weights represent single-limb loads.

---

### 5. `settings` & Auxiliary Dictionaries
- **entity**: `settings`, `exNotes`, `barWeights`, `progressionConfigs`, `gymCards`, `equipProfiles`
- **storage**: Key-value fields within the monolithic state tree.
- **invariants-held**: None; arbitrary key-value mappings.
- **invariants-violated**: Unpruned orphaned keys when exercises or equipment profiles are deleted.
- **dead-columns**: Unused legacy settings flags retained across migrations.
- **implicit-states**: Missing keys trigger implicit fallback defaults from `DEF` in `useStore.js`.

---

### 6. Backend Auth & Sync State
- **entity**: `db.json` (`users[]`, `subs[]`, `invites[]`) and `<uid>.json`
- **storage**: Filesystem JSON files under `DATA_DIR`.
- **invariants-held**:
  - `_rev` comparison: Prevents concurrent client write overwrites (HTTP 409 conflict).
- **invariants-violated**:
  - Whole-document serialization: One write corrupts entire user state; lack of row-level transactions.
- **dead-columns**: None.
- **implicit-states**: None.

---

## Temporal Forensics (Gahana Profile Mandate)

Under the Gahana profile, history preservation vs destruction must be explicitly catalogued:

| Record Class | History Status | Past Mutation Behavior | As-Of Query Viability |
|---|---|---|---|
| `workouts` | **Destroyed** | In-place array update (`map`/`filter`) when edited or deleted. Prior set values and timestamps are wiped. | **Unrecoverable** for past edits. As-of screens cannot show pre-edit states. |
| `routines` | **Destroyed** | In-place template overwrite. Historical versions of routines matching past workouts do not exist. | **Unrecoverable**. Past workouts show what was executed, but the routine definition as it existed then is lost. |
| `bodyweight` | **Destroyed** | Rewrites or deletions remove previous records. | **Unrecoverable**. |
| `customEx` | **Destroyed** | Editing an exercise modifies categorization for all past workouts simultaneously. | **Unrecoverable**. |
| `settings` / `exNotes` | **Destroyed** | Direct key-value overwrite. | **Unrecoverable**. |
| Sync Revisions (`_rev`) | **Preserved (Partial)**| Incremental revision number exists, but past revision snapshots are discarded on each write. | Revisions indicate sequence, not historical state. |

> [!WARNING]
> **Permanent Constraint on As-Of Views**:
> Historical state changes made prior to Dexie.js migration were permanently destroyed by in-place mutations. The Dexie.js IndexedDB schema cannot backfill missing snapshots. As-of temporal screens can only query history recorded after the introduction of the append-only audit trail (`auditLog`).

---

## Target Architecture

### A. Dexie.js + IndexedDB Schema (Client)
- **`workouts`**: `id, d, routineId, name, start, end, vol, _rev, _deleted, createdAt, updatedAt`
- **`workoutEntries`**: `++id, workoutId, exerciseId, order, topW`
- **`sets`**: `++id, entryId, workoutId, order, w, r, done, type, phase, rir, rpe, drops, clusters`
- **`routines`**: `id, name, desc, color, icon, _deleted, updatedAt`
- **`routineExercises`**: `++id, routineId, exerciseId, order, sets, reps, weight, progressionPolicy`
- **`bodyweight`**: `id, d, w, t, createdAt, _deleted`
- **`customExercises`**: `id, name, category, equipment, muscles, perSide, bw, _deleted, updatedAt`
- **`settings`**: `key, value, updatedAt`
- **`auditLog`** *(Gahana bitemporal ledger)*: `++id, entity, entityId, op, validTime, txTime, snapshot`
- **`syncQueue`** *(Offline-first sync ledger)*: `++id, op, entity, entityId, payload, status, createdAt`

### B. Bun Ecosystem Toolchain Migration
- **Runtime**: `bun run` replaces `node` for `api/server.js` and automation scripts.
- **Package Management**: `bun install` replaces `npm install`; `bun.lock` replaces `package-lock.json`.
- **Bundling / Dev**: Vite powered by Bun (`bun run dev`, `bun run build`).
- **Testing**: `bun test` replaces Vitest (`vitest run`) and `node --test`.

# Low-Fidelity Screens & Read Models (Phase 2 — Rūpa)

Low-fidelity screen specifications, temporal anchors, and derived read models covering all Phase 1 journeys and failure paths.

---

## Screen 1: `migration-gate`

```text
+-------------------------------------------------------+
| openGym                                               |
| Upgrading local database to Dexie.js (IndexedDB)...   |
|                                                       |
| [=====================>-------------] 120/350 records |
|                                                       |
| (Error state if storage quota or IDB blocked):        |
| [!] Browser Storage Unavailable / Quota Exceeded      |
|     Your existing data is safe in localStorage.       |
|     [Export JSON Backup]    [Continue Read-Only]      |
+-------------------------------------------------------+
```

- **screen**: `migration-gate`
- **temporal-anchor**: `as-written`
- **shows-together**: `migrationStatus` (`'pending'` | `'migrating'` | `'complete'` | `'corrupt_detected'` | `'idb_blocked'`), `totalCount`, `migratedCount`, `errorDetails`, `backupReceiptKey`
- **edits-inline**: none
- **navigates-to**: `home-dashboard` (on success), `emergency-export-sheet` (on failure)
- **implied-states**:
  - `migrating` (determinate progress bar)
  - `corrupt-fallback-toast` (notifies user that partial legacy payload was recovered and raw backup saved)
  - `idb-blocked-alert` (Journey 1 failure-path: modal displaying export button and in-memory options)
  - `migration-complete` (brief transition checkmark)

---

## Screen 2: `active-workout-runner`

```text
+-------------------------------------------------------+
| < Exit        Active: Upper Body A       [Finish 42m] |
|                                                       |
| Barbell Bench Press                               ... |
| Prev: 80kg x 6 | Target: 82.5kg x 6                   |
| [#]   [Weight]   [Reps]   [RIR/RPE]   [Status]        |
|  1     82.5kg      6        2 [RIR]     [v] Saved     |
|  2     82.5kg      5        1 [RIR]     [v] Saved     |
|  3     82.5kg      4        0 [RIR]     [ ]           |
|                                                       |
| [+ Set]   [+ Drop-Set]   [+ Rest-Pause]               |
|                                                       |
| ----------------------------------------------------- |
| [~] Offline: 2 local mutations queued for sync        |
| [!] DB Write Error: [Retry] [Keep in Memory]          |
+-------------------------------------------------------+
```

- **screen**: `active-workout-runner`
- **temporal-anchor**: `current`
- **shows-together**: `activeWorkout.{id, name, startTime, elapsedSec}`, `exerciseEntries[].{id, name, note}`, `sets[].{id, order, w, r, done, phase, type, rir, rpe, drops[], clusters[]}`, `previousPerformance.{w, r, d}`, `pendingSyncCount`, `txErrorStatus`
- **edits-inline**: `set.w`, `set.r`, `set.done`, `set.rir`, `set.rpe`, `set.drops`, `set.clusters`
- **navigates-to**: `exercise-picker`, `rest-timer-modal`, `finish-workout-confirm`
- **implied-states**:
  - `logging-active` (normal interactive state)
  - `set-saving` (instant optimistic IndexedDB commit)
  - `offline-sync-pending` (subtle badge indicating local changes queued for `syncExportProjection`)
  - `tx-failed-retry` (Journey 2 failure-path: non-blocking retry banner keeping inputs in-memory)

---

## Screen 3: `history-detail-editor`

```text
+-------------------------------------------------------+
| < History      Workout: Pull Day B             [Done] |
| Valid Date: [2026-08-15]  |  Logged At: 2026-08-15    |
| Duration: 52 mins         |  Volume: 12,450 kg        |
|                                                       |
| Incline Dumbbell Row                                  |
| Set 1: [ 32.5 ] kg x [ 8 ] reps  (RIR 2)              |
| Set 2: [ 32.5 ] kg x [ 8 ] reps  (RIR 1)              |
|                                                       |
| ----------------------------------------------------- |
| [Audit Trail: 2 revisions recorded]                   |
| - Rev 2 (2026-09-18 01:15): Edited Set 1 load (30->32)|
| - Rev 1 (2026-08-15 18:45): Initial session logged    |
+-------------------------------------------------------+
```

- **screen**: `history-detail-editor`
- **temporal-anchor**: `as-of <workout.d>` (valid date) with `as-written` audit trail comparison
- **shows-together**: `workout.{id, name, d, start, end, vol, bw}`, `workoutEntries[].{exerciseId, name, sets[]}`, `auditTrail[].{rev, txTime, validTime, op, deltaSummary}`
- **edits-inline**: `workout.d`, `set.w`, `set.r`, `set.rir`, `set.rpe`
- **navigates-to**: `history-list`, `audit-diff-viewer`
- **implied-states**:
  - `viewing-as-of` (default read-only historical inspection)
  - `editing-retroactive` (inline inputs enabled)
  - `recalculating-prs` (subtle spinner while historical PRs/progression re-evaluates)
  - `audit-saved` (confirmation banner displaying new revision number)

---

## Screen 4: `developer-test-dashboard`

```text
+-------------------------------------------------------+
| $ bun test                                            |
|                                                       |
| bun test v1.4.2 (linux x64)                           |
|                                                       |
| frontend/src/lib/progression.test.js:                 |
|   ✓ Linear progression advances on completed targets  |
|   ✓ Greyskull deloads 10% on stall                    |
| frontend/src/store/dexie-migration.test.js:           |
|   ✓ Migrates gym_state_v1 losslessly to IndexedDB     |
|   ✓ Preserves corrupted backup on malformed JSON      |
|                                                       |
| 48 pass, 0 fail, 126 expect() calls                   |
| Ran 48 tests across 6 files in 114.28ms               |
|                                                       |
| (On Test Failure):                                    |
| ✗ test/dexie-sync.test.js:32: expected 200, got 409   |
+-------------------------------------------------------+
```

- **screen**: `developer-test-dashboard` (CLI stdout / CI terminal interface)
- **temporal-anchor**: `current`
- **shows-together**: `testSummary.{totalSuites, totalTests, passCount, failCount, durationMs}`, `testFailures[].{file, line, testName, expected, received, diff}`
- **edits-inline**: none
- **navigates-to**: none
- **implied-states**:
  - `running` (terminal progress tick)
  - `all-green` (sub-200ms clean exit 0)
  - `test-failure-reported` (Journey 3 failure-path: file-and-line error attribution with non-zero exit)

---

## Derived Read-Model List

Derived from the `shows-together` payloads. Data co-located on one screen defines one read model.

### 1. `MigrationStatusReadModel`
- **Payload**:
  ```typescript
  interface MigrationStatusReadModel {
    status: 'pending' | 'migrating' | 'complete' | 'corrupt_detected' | 'idb_blocked';
    totalRecords: number;
    migratedRecords: number;
    backupKey: string | null;
    errorMessage: string | null;
  }
  ```
- **Consuming Screens**: `migration-gate`

### 2. `ActiveWorkoutReadModel`
- **Payload**:
  ```typescript
  interface ActiveWorkoutReadModel {
    id: string;
    name: string;
    startTime: number;
    elapsedSec: number;
    entries: Array<{
      exerciseId: string;
      name: string;
      note: string | null;
      sets: Array<{
        id: number;
        order: number;
        w: number;
        r: number;
        done: boolean;
        phase: 'work' | 'warmup';
        type: 'straight' | 'dropset' | 'restpause';
        rir: number | null;
        rpe: number | null;
        drops?: Array<{ w: number; r: number }>;
        clusters?: Array<{ r: number; restSec: number }>;
      }>;
      previousPerformance: { w: number; r: number; d: string } | null;
    }>;
    pendingSyncCount: number;
    txError: string | null;
  }
  ```
- **Consuming Screens**: `active-workout-runner`

### 3. `WorkoutHistoryDetailReadModel`
- **Payload**:
  ```typescript
  interface WorkoutHistoryDetailReadModel {
    id: string;
    name: string;
    validDate: string;        // 'YYYY-MM-DD'
    startTime: number;
    endTime: number;
    totalVolume: number;
    bodyweight: number | null;
    entries: Array<{
      exerciseId: string;
      name: string;
      sets: Array<{
        w: number;
        r: number;
        done: boolean;
        rir: number | null;
        rpe: number | null;
      }>;
    }>;
    auditTrail: Array<{
      rev: number;
      txTime: string;
      validTime: string;
      op: 'INSERT' | 'UPDATE' | 'SOFT_DELETE';
      deltaSummary: string;
    }>;
  }
  ```
- **Consuming Screens**: `history-detail-editor`

### 4. `BunTestReportReadModel`
- **Payload**:
  ```typescript
  interface BunTestReportReadModel {
    totalSuites: number;
    totalTests: number;
    passed: number;
    failed: number;
    durationMs: number;
    failures: Array<{
      file: string;
      line: number;
      testName: string;
      message: string;
    }>;
  }
  ```
- **Consuming Screens**: `developer-test-dashboard`

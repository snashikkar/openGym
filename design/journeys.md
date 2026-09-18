# Core User Journeys (Phase 1 — Bīja)

Sequenced user journeys for the Dexie.js (IndexedDB) persistence migration, bitemporal audit logging, and Bun toolchain adoption.

---

## Journey 1: `lossless-storage-migration`

```
journey:      lossless-storage-migration
kartā:        returning-user (launching updated app on web or mobile shell)
karma:        legacy localStorage `gym_state_v1` → normalized Dexie IndexedDB stores
karaṇa:       Dexie schema versioning + migration runner transaction
adhikaraṇa:   client-boot-lifecycle, browser storage sandbox
```

### Scenarios (BDD Acceptance Criteria)

#### happy-path
- **Given** a returning user with existing workouts, routines, and settings in `localStorage` (`gym_state_v1`)
- **When** the updated application boots and detects IndexedDB schema version 0
- **Then** all workouts, routines, weigh-ins, and settings are extracted, transformed, and written into normalized Dexie object stores within a single atomic transaction, a migration receipt is logged, `localStorage` is marked as migrated, Capacitor mobile builds mirror the snapshot to device storage via `nativeSave` (DEC-07), and the home screen renders with full historical data.

#### alternate-paths
- **Given** a new user launching openGym for the very first time with no `localStorage` data
- **When** the application boots and initializes the Dexie database
- **Then** default settings, starter routines, and empty object stores are created immediately with zero migration prompts or delays.

#### edge-cases
- **Given** a user with a corrupted or partially truncated `gym_state_v1` JSON payload in `localStorage`
- **When** the migration runner attempts JSON deserialization
- **Then** the raw string is copied to `gym_state_v1_corrupt_backup`, the valid portions are recovered into IndexedDB, an error boundary toast notifies the user, and no existing data is deleted.

#### failure-paths
- **Given** a browser environment where IndexedDB is blocked, disabled by strict privacy settings, or has exceeded storage quota
- **When** Dexie attempts to open or write to the database
- **Then** the application falls back gracefully to in-memory/localStorage emergency read-only mode, displays an explicit storage diagnostic modal, and provides a direct JSON export button so no training history is trapped.

---

## Journey 2: `bitemporal-workout-logging`

```
journey:      bitemporal-workout-logging
kartā:        athlete (logging sets during training or retroactively editing past workouts)
karma:        workout session, exercise entries, set records, and audit log
karaṇa:       Dexie transactional write + useLiveQuery reactive subscription
adhikaraṇa:   active-workout-screen, history-detail-screen
```

### Scenarios (BDD Acceptance Criteria)

#### happy-path
- **Given** an athlete performing an active workout session
- **When** the athlete marks a work set as complete with weight, reps, and RIR
- **Then** the set record is written to IndexedDB with valid-time (`start` timestamp) and transaction-time (`now`), an entry is appended to `auditLog`, the reactive `useLiveQuery` hook updates the active view within 16 ms, and debounced remote sync invokes `syncExportProjection` to package the state for `PUT /api/data` preserving server compatibility (DEC-05).

#### alternate-paths
- **Given** an athlete reviewing a workout finished three weeks ago in the History tab
- **When** the athlete retroactively modifies the weight of a bench press set and changes the recorded date
- **Then** the set record updates in IndexedDB, a new revision entry is appended to `auditLog` capturing the prior state, the new valid date, and the current transaction timestamp, and downstream PR and 1RM metrics re-evaluate chronologically.

#### edge-cases
- **Given** an athlete training in a gym basement with zero network connectivity checking off 5 rapid warm-up sets in under 30 seconds
- **When** the rapid taps occur
- **Then** each set commit runs through local Dexie transactions sequentially without concurrency errors or lost updates, queuing local changes for later sync via `syncExportProjection`.

#### failure-paths
- **Given** an unexpected browser storage exception or transaction collision during set completion
- **When** the database write fails
- **Then** the transaction rolls back cleanly, the in-memory UI preserves the entered numbers, a warning banner appears with a retry button, and no inconsistent partial set state is committed.

---

## Journey 3: `bun-unified-development-pipeline`

```
journey:      bun-unified-development-pipeline
kartā:        developer / CI automation agent
karma:        dependencies, test suites, API server runtime, client production build
karaṇa:       Bun CLI (`bun install`, `bun test`, `bun run dev`, `bun run build`)
adhikaraṇa:   developer workstation, CI runner environment
```

### Scenarios (BDD Acceptance Criteria)

#### happy-path
- **Given** a clean checkout of the openGym repository
- **When** the developer executes `bun install` followed by `bun test`
- **Then** dependencies resolve and lock into `bun.lock`, and the entire unit/integration test suite executes under `bun:test` in under 200 ms with all tests passing.

#### alternate-paths
- **Given** a developer making modifications to the progression engine in `frontend/src/lib/progression.js`
- **When** the developer runs `bun test frontend/src/lib/progression.test.js --watch`
- **Then** the specific test suite executes on file save in under 50 ms, providing instantaneous test-driven feedback.

#### edge-cases
- **Given** frontend tests that assert browser-specific globals (`window`, `localStorage`, `navigator.userAgent`, `indexedDB`)
- **When** `bun test` runs against frontend modules
- **Then** a global test preload environment imports `happy-dom` and `fake-indexeddb` shims (DEC-06), enabling full DOM and IndexedDB emulation inside the Bun runtime.

#### failure-paths
- **Given** an incompatible package dependency or syntax error in a test file
- **When** `bun test` or `bun run build` runs
- **Then** the command exits with non-zero exit code, outputs file-and-line error attribution without silent failures, and prevents invalid artifacts from building.

---

## Guṇa Budgets (Elicited Qualities)

### Volumes (Expected Scale per User Profile)
- **Workouts**: Up to 1,000 sessions (approx. 5–7 years of continuous 3–4x weekly training).
- **Sets**: Up to 25,000 individual set rows.
- **Routines**: Up to 50 routine templates.
- **Audit Log**: Up to 50,000 mutation entries.
- **Database Storage Footprint**: < 25 MB in IndexedDB (easily within browser storage limits of > 1 GB).

### SLO Budgets
- **Migration Latency**: Migration of 500 workouts and 15,000 sets from `localStorage` into Dexie IndexedDB completes in **< 300 ms** (99th percentile).
- **Query Latency**: `useLiveQuery` retrieval of workout history (paginated 50 sessions) completes in **< 16 ms** (1 frame budget).
- **Mutation Latency**: Set checkoff transaction commit in **< 10 ms**.
- **Test Pipeline Speed**: Entire test suite under `bun test` completes in **< 500 ms** in CI.
- **Correctness**: **100% byte-for-byte fidelity** on migrated weights, reps, dates, and timestamps. Zero data loss.

### Compliance & Local-First Guarantees
- **Data Sovereignty**: 100% client-side local-first persistence; no third-party telemetry, cloud dependencies, or tracking.
- **Audit Traceability**: Every retroactive edit or deletion appends an immutable record to `auditLog` with who/when/what.

---

## Business-Domain Evidence Table

Claims evaluated per the business-domain review protocol (BD-05):
- `as-is`: Established current practice
- `to-be`: Proposed design
- `must-be`: Externally imposed rule (only a contradicted `must-be` blocks a gate)
- `could-be`: Design option / observed market variant

| Claim / Obligation | Modal Class | Source & Citation | Evidence Status | Impact on Gate |
|---|---|---|---|---|
| IndexedDB 3.0 supports structured cloning, transactions, and compound indexes | `must-be` | W3C IndexedDB API v3.0 Spec (https://www.w3.org/TR/IndexedDB-3/) | Established | Complies. Underlying engine for Dexie. |
| Dexie.js v4 provides typed schemas and reactive `useLiveQuery` | `to-be` | Dexie.js Documentation (https://dexie.org/docs/) | Established | Core client persistence architecture. |
| Bun supports Node.js compatibility APIs and built-in test runner (`bun:test`) | `to-be` | Bun Official Documentation (https://bun.com/docs) | Established | Core toolchain & runtime architecture. |
| Browser `localStorage` is capped at 5 MB and executes synchronously on the main UI thread | `as-is` | WHATWG Web Storage Spec | Established | Drives requirement for IndexedDB migration. |
| Gahana profile requires append-only audit trail for retroactive mutations | `must-be` | Sutradhāra Gahana Overlay (`references/gahana.md`) | Established | Mandates `auditLog` table in Dexie schema. |
| RPE/RIR effort scales require standardized numerical mapping (Borg CR10 / RTS chart) | `as-is` | Zourdos et al. (2016) / Mike Tuchscherer RTS | Established | Retained in set schema (`rpe`, `rir`). |

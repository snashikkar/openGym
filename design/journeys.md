# Core User Journeys (Phase 1 — Bīja)

Sequenced user journeys for the Dexie.js (IndexedDB) persistence migration, bitemporal audit logging, and Bun toolchain adoption.

---

## Journey 1: `lossless-storage-migration`
→ Shipped in Slice 1 (`slice/1-bun-toolchain-and-lossless-migration` @ 49439c6)
→ Proven by `test/migration-lossless.test.js`, `test/migration-corrupt-fallback.test.js`, `test/migration-blocked-idb.test.js`

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
→ Shipped in Slice 1 (`slice/1-bun-toolchain-and-lossless-migration` @ 49439c6)
→ Proven by `test/bun-toolchain.test.js`

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

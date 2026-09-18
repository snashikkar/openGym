# Core User Journeys (Phase 1 — Bīja)

Sequenced user journeys for the Dexie.js (IndexedDB) persistence migration, bitemporal audit logging, and Bun toolchain adoption.

---

## Journey 1: `lossless-storage-migration`
→ Shipped in Slice 1 (`slice/1-bun-toolchain-and-lossless-migration` @ 49439c6)
→ Proven by `test/migration-lossless.test.js`, `test/migration-corrupt-fallback.test.js`, `test/migration-blocked-idb.test.js`

---

## Journey 2: `bitemporal-workout-logging`
→ Shipped in Slice 2 (`slice/2-bitemporal-workout-logging-and-audit` @ bfd8183)
→ Proven by `test/workout-logging.test.js`, `test/workout-finish.test.js`, `test/audit-bitemporal-cycle.test.js`, `test/bench/active-read.test.js`, `test/sync-projection.test.js`

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

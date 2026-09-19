# Architecture Decision Records

## DEC-01: Retrofit branch active
- Status: Accepted
- Context: openGym is an established application with existing clients, storage models (JSON store in `api/server.js`, Zustand/localStorage `gym_state_v1` on client), and user data.
- Decision: Route through Sutradhāra retrofit branch (`references/retrofit.md`). Phase 0 (model archaeology) precedes all screen and journey authoring. Existing data constrains screen promises.
- Alternatives considered: Greenfield sequence.
  - Rejected: Greenfield sequence ignores production data shapes and client-server sync invariants, risking schema-first or UI-first sync breakage.

## DEC-02: Dissolution ledger regime
- Status: Accepted
- Context: Single-developer repository where code and tests represent canonical behavior.
- Decision: Adopt dissolution regime. Design ledger artifacts dissolve into BDD/E2E tests, read functions, and commit pointers as vertical slices ship.
- Alternatives considered: Standing artifacts regime.
  - Rejected: No non-coding compliance or external review stakeholders requiring permanent design documents; standing artifacts invite documentation drift.

## DEC-03: Gahana complexity profile inactive
- Status: Accepted
- Context: Evaluated against 5 gahana markers (bitemporal records, audit obligations, external standards, multi-party actors, mandated computation).
- Decision: Standard profile. Gahana overlay inactive (0 of 5 markers present).
- Alternatives considered: Full or à la carte gahana activation.
  - Rejected: Fitness tracking domain carries no statutory audit or bitemporal valid-time mandates; unnecessary ceremony.

## DEC-04: Gahana complexity profile active (reverses DEC-03)
- Status: Accepted
- Context: User designated target domain complexity as warranting the gahana overlay.
- Decision: Activate gahana profile. Binds glossary (`design/glossary.md`) as Phase 1 gate requirement, temporal forensics in Phase 0 archaeology, append-only history considerations at dhātu, and temporal-cycle slice modeling.
- Alternatives considered: Standard profile (DEC-03).
  - Rejected: Standard profile under-specifies temporal integrity, auditability, and multi-actor constraints for the intended scope.

## DEC-05: Client-side Dexie sync projection adapter (preserves backend PUT /api/data)
- Status: Accepted
- Context: ANUBIS finding A1. Backend `api/server.js:867` validates and persists monolithic state documents containing `workouts` and `routines` arrays under optimistic `_rev` comparison. Rewriting backend storage concurrently expands blast radius.
- Decision: Client Dexie persistence layer maintains an export projection adapter (`syncExportProjection`) that serializes current IndexedDB stores into the expected `body.state` JSON document for debounced `PUT /api/data` calls. The existing backend contract remains intact for this slice.
- Alternatives considered: Immediate backend migration to Bun + SQLite table-level sync endpoints.
  - Rejected: High coordination blast radius across client/server; decouples client local-first migration from backend storage overhaul.

## DEC-06: Headless IndexedDB test environment via fake-indexeddb for bun test
- Status: Accepted
- Context: ANUBIS finding A2. `bun:test` runs in a native server JavaScript environment without browser globals (`window`, `indexedDB`, `IDBKeyRange`). Frontend store and model tests must run headless.
- Decision: Configure `fake-indexeddb` within the test preload configuration (`test/setup.js` / `bunfig.toml`), injecting standard IndexedDB globals into the runtime environment for `bun test`.
- Alternatives considered: Running IndexedDB tests only through browser integration tests (Playwright/Puppeteer).
  - Rejected: Slower feedback cycle; destroys the sub-200ms `bun test` developer experience and local-first BDD verification.

## DEC-07: Retention of Capacitor native filesystem mirror
- Status: Accepted
- Context: ANUBIS finding A3. Mobile operating systems can evict WebView caches and IndexedDB under memory/disk pressure. `CLAUDE.md` documents `lib/mobile.js` (`nativeSave`) mirroring.
- Decision: Retain the periodic filesystem mirror on Capacitor mobile builds. When Dexie commits a workout or import, `nativeSave` persists a serialized backup to native application storage.
- Alternatives considered: Dexie/IndexedDB-only storage on mobile.
  - Rejected: Vulnerable to iOS/Android WebView storage eviction.

## DEC-08: Gahana record-class classification and reference-data apavāda
- Status: Accepted
- Context: ANUBIS finding A4 on Phase 3 Dhātu. `references/gahana.md:74` requires an explicit Phase 3 decision classifying which record classes use append-only projections vs mutable stores, and defining the reference-data versioning policy.
- Decision:
  1. Record Classes: `workouts`, `sets`, `routines`, and `bodyweight` are classified as audited mutable stores with soft deletion (`_deleted: true`). Physical deletions are prohibited. All insertions, modifications, and soft deletions trigger automatic sidecar recording into `auditLog` capturing `{ entity, entityId, op, who, validTime, txTime, snapshot }`.
  2. Reference Data Apavāda: Reference data consists of the exercise catalog (`EXIDX` in `frontend/src/lib/exercises.js`) and mathematical progression formulas (`progression.js`). Because openGym is a self-hosted single-user fitness tracker without externally mandated statutory rating tables (unlike insurance premium tables or fee schedules), exercise catalogs are versioned statically with the client bundle release. Runtime table-level version binding is declared an apavāda exception.
- Alternatives considered: Full event-sourced append-only storage for every set row.
  - Rejected: Massive write amplification and unnecessary query complexity for a local-first mobile client; sidecar `auditLog` achieves identical bitemporal auditability without degrading UI query performance.

## DEC-09: Repository-wide Bun workspace unification and legacy stack retirement
- Status: Accepted
- Context: openGym previously migrated the root database and headless IndexedDB test runner to Bun. However, subpackages (`frontend`, `api`, `mcp`) remained unhoisted with separate package managers, legacy `package-lock.json` files, and lingering Vitest configurations.
- Decision: Configure root `package.json` with native Bun workspaces (`workspaces: ["frontend", "api", "mcp"]`). Unify all dependencies under a single root `bun.lock`. Permanently purge all `package-lock.json` files, Vitest packages, and Vitest configuration files across all packages. Standardize testing across all workspaces onto native `bun test`.
- Alternatives considered: Maintaining separate Node/npm lockfiles and Vitest runners in subdirectories.
  - Rejected: Divergent runtime environments, redundant lockfiles, slower CI runs, and fragmented developer workflows.

## DEC-10: Native Bun fullstack bundling and Vite retirement
- Status: Accepted
- Context: User directed that native Bun fullstack bundling (`bun build` and `Bun.serve`) replace Vite as top priority. Vitest was eliminated in DEC-09, leaving Vite active only in `frontend/` for client bundling, dev proxying, and service worker hashing.
- Decision: Completely eliminate `vite` and `@vitejs/plugin-react` from repository dependencies. Implement native Bun build pipeline (`frontend/scripts/build.js`) utilizing `Bun.build` with browser target, asset hashing, public directory preservation, and automated service worker cache stamping (`__BUILD__`). Implement native development and preview servers (`frontend/scripts/dev.js`, `frontend/scripts/preview.js`) using `Bun.serve` with fullstack HTML imports, SPA routing fallback, and reverse-proxying with CSRF Origin validation. Maintain 100% compatibility with Capacitor mobile builds (`dist/`).
- Alternatives considered: Retaining Vite as hybrid bundler with Bun runtime.
  - Rejected: Incurs hundreds of unnecessary npm dependencies, redundant build toolchain layers, and slower build cycles.

## DEC-11: Sourced external and regulatory must-be obligations migration (Nirvāha)
- Status: Accepted
- Context: Step 3b of Nirvāha requires migrating `must-be` source table obligations from `journeys.md` and `model.md` into `decisions.md` before transient design ledger files dissolve.
- Decision: Formally record the following non-negotiable external standards and compliance invariants as permanent architectural constraints:
  1. W3C IndexedDB API v3.0 Specification (§4.2): Requires structured cloning, ACID transactions, and bounded compound index range queries. Implemented in Dexie schema definition (`frontend/src/db/index.js`) and verified via `test/bench/active-read.test.js` and `test/workout-logging.test.js`.
  2. Sutradhāra Gahana Overlay (`references/gahana.md:79`): Requires an immutable, append-only audit trail (`auditLog`) capturing actor `who`, `validTime`, `txTime`, and entity snapshots for all retroactive mutations and soft deletions. Implemented in `frontend/src/db/index.js` and verified by `test/audit-bitemporal-cycle.test.js`.
  3. Dexie.js v4 ACID Transaction Boundaries: Requires atomic rollbacks on validation constraint errors across multiple stores (`[workouts, sets, lastPerformance, auditLog]`). Enforced in `frontend/src/db/workout-operations.js` and verified by `test/workout-finish.test.js` and `test/migration-lossless.test.js`.
- Alternatives considered: Dissolving source tables without ADR migration.
  - Rejected: Violates Sutradhāra Nirvāha Step 3b; externally imposed regulatory/spec constraints must retain verifiable evidence records post-dissolution.


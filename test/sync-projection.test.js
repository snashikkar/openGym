import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase } from '../frontend/src/db/index.js';
import { syncExportProjection, syncToServer } from '../frontend/src/lib/sync.js';

describe('Sync Export Projection & Conflict Handling (DEC-05 & Journey 2)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('serializes normalized Dexie tables into monolithic body.state JSON matching PUT /api/data contract', async () => {
    // 1. Seed workouts and sets
    const wId = 'w_export_1';
    await db.workouts.put({
      id: wId,
      d: '2026-10-12',
      routineId: 'r_push',
      name: 'Push Heavy',
      start: 1791763200000,
      end: 1791766800000,
      vol: 1500,
      _rev: 2,
      _deleted: false,
      createdAt: 1791763200000,
      updatedAt: 1791766800000
    });

    const entryId = 101;
    await db.workoutEntries.put({
      id: entryId,
      workoutId: wId,
      exerciseId: 'barbell-bench-press',
      order: 0
    });

    await db.sets.add({
      workoutId: wId,
      entryId,
      exerciseId: 'barbell-bench-press',
      order: 0,
      w: 100,
      r: 5,
      done: true,
      phase: 'work',
      type: 'straight',
      rir: 2,
      rpe: 8
    });

    // 2. Seed routines
    await db.routines.put({
      id: 'r_push',
      name: 'Push Day',
      _deleted: false,
      updatedAt: 1791763200000
    });
    await db.routineExercises.put({
      routineId: 'r_push',
      exerciseId: 'barbell-bench-press',
      order: 0
    });

    // 3. Seed bodyweight
    await db.bodyweight.put({
      id: '2026-10-12',
      d: '2026-10-12',
      w: 83.2,
      t: 1791760000000,
      _deleted: false
    });

    // 4. Seed custom exercises
    await db.customExercises.put({
      id: 'custom_incline_fly',
      name: 'Incline Cable Fly',
      category: 'chest',
      equipment: 'cable',
      muscles: ['chest'],
      _deleted: false
    });

    // 5. Seed scalar settings & internal migration receipts
    await db.settings.put({ key: 'unit', value: 'kg' });
    await db.settings.put({ key: 'restSec', value: 90 });
    await db.settings.put({ key: 'theme', value: 'dark' });
    await db.settings.put({ key: 'migration_receipt', value: { status: 'complete' } });

    // Project state
    const projected = await syncExportProjection(db);

    // Backend contract verification (api/server.js:871-876)
    expect(typeof projected).toBe('object');
    expect(Array.isArray(projected.workouts)).toBe(true);
    expect(Array.isArray(projected.routines)).toBe(true);
    expect(Array.isArray(projected.bodyweight)).toBe(true);
    expect(Array.isArray(projected.customEx)).toBe(true);

    // Verification of serialized workout structure
    expect(projected.workouts).toHaveLength(1);
    const pw = projected.workouts[0];
    expect(pw.id).toBe(wId);
    expect(pw.vol).toBe(1500);
    expect(pw.entries).toHaveLength(1);
    expect(pw.entries[0].id).toBe('barbell-bench-press');
    expect(pw.entries[0].sets).toHaveLength(1);
    expect(pw.entries[0].sets[0].w).toBe(100);
    expect(pw.entries[0].sets[0].r).toBe(5);
    expect(pw.entries[0].sets[0].done).toBe(true);

    // Verification of serialized routine structure
    expect(projected.routines).toHaveLength(1);
    expect(projected.routines[0].id).toBe('r_push');
    expect(projected.routines[0].ex).toEqual(['barbell-bench-press']);

    // Verification of bodyweight and custom exercises
    expect(projected.bodyweight).toHaveLength(1);
    expect(projected.bodyweight[0].w).toBe(83.2);

    expect(projected.customEx).toHaveLength(1);
    expect(projected.customEx[0].name).toBe('Incline Cable Fly');

    // Verification of scalar settings
    expect(projected.unit).toBe('kg');
    expect(projected.restSec).toBe(90);
    expect(projected.theme).toBe('dark');

    // Internal keys must be omitted
    expect(projected.migration_receipt).toBeUndefined();

    // Active session must be device-local (INV-04 / DEC-05)
    expect(projected.active).toBeUndefined();

    // Must be valid JSON
    const jsonString = JSON.stringify(projected);
    expect(jsonString.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonString);
    expect(parsed.workouts[0].name).toBe('Push Heavy');
  });

  it('syncToServer pushes state with baseRev and handles HTTP 409 conflict cleanly', async () => {
    await db.workouts.put({
      id: 'w_conflict_test',
      d: '2026-10-12',
      name: 'Test Workout',
      vol: 1000
    });

    let sentEndpoint = null;
    let sentPayload = null;

    // 1. Successful push path
    const mockSuccessClient = async (endpoint, options) => {
      sentEndpoint = endpoint;
      sentPayload = JSON.parse(options.body);
      return { ok: true, rev: 5, ts: 1791767000000 };
    };

    const successRes = await syncToServer({
      db,
      apiClient: mockSuccessClient,
      baseRev: 4
    });

    expect(successRes.ok).toBe(true);
    expect(successRes.rev).toBe(5);
    expect(sentEndpoint).toBe('/api/data');
    expect(sentPayload.baseRev).toBe(4);
    expect(sentPayload.state.workouts).toHaveLength(1);

    // 2. Conflict detection path (HTTP 409)
    const serverConflictedState = {
      _rev: 6,
      workouts: [{ id: 'w_remote_device', name: 'Other Device Workout' }],
      routines: []
    };

    const mockConflictClient = async () => {
      const conflictError = new Error('Conflict');
      conflictError.status = 409;
      conflictError.data = {
        error: 'conflict',
        rev: 6,
        state: serverConflictedState
      };
      throw conflictError;
    };

    const conflictRes = await syncToServer({
      db,
      apiClient: mockConflictClient,
      baseRev: 4
    });

    expect(conflictRes.conflict).toBe(true);
    expect(conflictRes.rev).toBe(6);
    expect(conflictRes.serverState.workouts[0].name).toBe('Other Device Workout');
  });
});

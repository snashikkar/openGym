import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase } from '../frontend/src/db/index.js';
import { migrateLocalStorage, MIGRATION_KEY, LEGACY_KEY, BACKUP_KEY } from '../frontend/src/store/migration.js';

describe('Lossless Storage Migration (Journey 1 Happy Path & DEC-07)', () => {
  let db;
  let testDbName;
  let nativeSavedState = null;

  const mockNativeSave = async (state) => {
    nativeSavedState = state;
  };

  beforeEach(() => {
    testDbName = `test_lossless_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    localStorage.clear();
    nativeSavedState = null;
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('losslessly migrates workouts, routines, weigh-ins, and settings in an atomic transaction', async () => {
    const legacyPayload = {
      unit: 'kg',
      restSec: 120,
      theme: 'dark',
      workouts: [
        {
          id: 'w_oct1',
          d: '2026-10-01',
          name: 'Heavy Push',
          start: 1700000000000,
          end: 1700003600000,
          vol: 3600,
          entries: [
            {
              id: 'barbell-bench-press',
              target: { mode: 'reps' },
              sets: [
                { w: 60, r: 8, done: true, phase: 'warmup', type: 'straight' },
                { w: 100, r: 5, done: true, phase: 'work', type: 'straight', rir: 2, rpe: 8 },
                { w: 100, r: 5, done: true, phase: 'work', type: 'dropset', drops: [{ w: 80, r: 5 }] }
              ]
            }
          ]
        }
      ],
      routines: [
        {
          id: 'routine_upper',
          name: 'Upper Body A',
          ex: ['barbell-bench-press', 'incline-dumbbell-press']
        }
      ],
      bodyweight: [
        { d: '2026-10-01', w: 82.5, t: 1700000000000 },
        { d: '2026-10-02', w: 82.3, t: 1700086400000 }
      ],
      customEx: [
        {
          id: 'custom_landmine_press',
          name: 'Landmine Press',
          category: 'chest',
          equipment: 'barbell',
          muscles: ['chest', 'shoulders']
        }
      ]
    };

    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyPayload));

    const result = await migrateLocalStorage({
      db,
      storage: localStorage,
      nativeSave: mockNativeSave
    });

    expect(result.status).toBe('complete');
    expect(result.count.workouts).toBe(1);
    expect(result.count.sets).toBe(3);
    expect(result.count.routines).toBe(1);
    expect(result.count.bodyweight).toBe(2);

    // Verify localStorage markers
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');
    expect(localStorage.getItem(BACKUP_KEY)).toBe(JSON.stringify(legacyPayload));

    // Verify Capacitor storage mirror (DEC-07)
    expect(nativeSavedState).not.toBeNull();
    expect(nativeSavedState.workouts.length).toBe(1);

    // Verify Dexie tables
    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(1);
    expect(workouts[0].name).toBe('Heavy Push');
    expect(workouts[0].vol).toBe(3600);

    const sets = await db.sets.where('workoutId').equals('w_oct1').toArray();
    expect(sets).toHaveLength(3);
    expect(sets[0].phase).toBe('warmup');
    expect(sets[1].w).toBe(100);
    expect(sets[1].r).toBe(5);
    expect(sets[1].rir).toBe(2);
    expect(sets[2].type).toBe('dropset');
    expect(sets[2].drops).toHaveLength(1);

    const routines = await db.routines.toArray();
    expect(routines).toHaveLength(1);
    expect(routines[0].name).toBe('Upper Body A');

    const routineEx = await db.routineExercises.where('routineId').equals('routine_upper').toArray();
    expect(routineEx).toHaveLength(2);
    expect(routineEx[0].exerciseId).toBe('barbell-bench-press');
    expect(routineEx[1].exerciseId).toBe('incline-dumbbell-press');

    const bw = await db.bodyweight.toArray();
    expect(bw).toHaveLength(2);
    expect(bw[0].w).toBe(82.5);

    const lastPerf = await db.lastPerformance.get('barbell-bench-press');
    expect(lastPerf).toBeDefined();
    expect(lastPerf.w).toBe(100);
    expect(lastPerf.r).toBe(5);

    // Verify migration receipt in settings
    const receipt = await db.settings.get('migration_receipt');
    expect(receipt).toBeDefined();
    expect(receipt.value.workoutCount).toBe(1);

    const statusSetting = await db.settings.get('migration_status');
    expect(statusSetting.value).toBe('complete');
  });

  it('is idempotent: secondary execution returns already_migrated without rewriting data', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ workouts: [], routines: [], bodyweight: [] }));
    localStorage.setItem(MIGRATION_KEY, 'true');

    await db.settings.put({
      key: 'migration_receipt',
      value: { timestamp: 12345, count: 0 },
      updatedAt: 12345
    });

    const res = await migrateLocalStorage({ db, storage: localStorage });
    expect(res.status).toBe('already_migrated');
    expect(res.migrated).toBe(false);
  });

  it('atomically rolls back if an invalid set violates INV-06 bounds', async () => {
    const invalidPayload = {
      workouts: [
        {
          id: 'w_invalid',
          d: '2026-10-01',
          entries: [
            {
              id: 'bench',
              sets: [{ w: -50, r: 5 }] // Violates INV-06: weight < 0
            }
          ]
        }
      ]
    };

    localStorage.setItem(LEGACY_KEY, JSON.stringify(invalidPayload));

    let threw = false;
    try {
      await migrateLocalStorage({ db, storage: localStorage });
    } catch (e) {
      threw = true;
      expect(e.message).toContain('INV-06');
    }

    expect(threw).toBe(true);
    // Migration flag must not be set on failure
    expect(localStorage.getItem(MIGRATION_KEY)).toBeNull();
    // Tables must be empty
    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(0);
  });
});

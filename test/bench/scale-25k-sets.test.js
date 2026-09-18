import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import Dexie from 'dexie';
import { createDatabase, queryActiveWorkout } from '../../frontend/src/db/index.js';

describe('Scalability Benchmark & Large Volume Query Optimization (Phase 4 Prayoga)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_scale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('scalability benchmark querying 25,000 sets and 1,000 workouts completes in <50 ms without UI thread freezing', async () => {
    const TOTAL_WORKOUTS = 1000;
    const SETS_PER_WORKOUT = 25;
    const TOTAL_SETS = TOTAL_WORKOUTS * SETS_PER_WORKOUT; // 25,000

    const exercises = [
      'barbell-squat',
      'barbell-bench-press',
      'deadlift',
      'overhead-press',
      'barbell-row'
    ];

    // Build fixtures in memory
    const workouts = new Array(TOTAL_WORKOUTS);
    const sets = new Array(TOTAL_SETS);

    let setIndex = 0;
    for (let w = 0; w < TOTAL_WORKOUTS; w++) {
      const workoutId = `w_${w}`;
      workouts[w] = {
        id: workoutId,
        d: `2024-01-01`,
        name: `Workout ${w}`,
        start: 1700000000000 + w * 86400000,
        end: 1700000000000 + w * 86400000 + 3600000,
        vol: 5000,
        _rev: 1,
        _deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      for (let s = 0; s < SETS_PER_WORKOUT; s++) {
        const exId = exercises[s % exercises.length];
        sets[setIndex++] = {
          workoutId,
          order: s,
          exerciseId: exId,
          w: 60 + (s % 10) * 5,
          r: 5 + (s % 5),
          done: true,
          phase: s < 5 ? 'warmup' : 'work'
        };
      }
    }

    // Seed database in bulk with audit skip for fixture setup performance
    await db.transaction('rw', [db.workouts, db.sets, db.lastPerformance], async (trans) => {
      trans._skipAudit = true;
      await db.workouts.bulkAdd(workouts);

      // Add sets in 5,000 chunks
      const CHUNK = 5000;
      for (let i = 0; i < sets.length; i += CHUNK) {
        await db.sets.bulkAdd(sets.slice(i, i + CHUNK));
      }

      // Seed lastPerformance cache for test exercises
      for (const exId of exercises) {
        await db.lastPerformance.put({
          exerciseId: exId,
          w: 120,
          r: 5,
          d: '2026-10-01',
          workoutId: 'w_999'
        });
      }
    });

    // Verify fixture volume
    const workoutCount = await db.workouts.count();
    const setCount = await db.sets.count();
    expect(workoutCount).toBe(TOTAL_WORKOUTS);
    expect(setCount).toBe(TOTAL_SETS);

    // --- BENCHMARK 1: Active Workout Query via Compound Index & Batch LastPerformance ---
    const targetWorkoutId = 'w_500';
    const t0 = performance.now();
    const activeResult = await queryActiveWorkout(db, targetWorkoutId);
    const activeDurationMs = performance.now() - t0;

    // Must execute well within the < 50ms performance budget
    expect(activeDurationMs).toBeLessThan(50);
    expect(activeResult.workout).toBeDefined();
    expect(activeResult.workout.id).toBe(targetWorkoutId);
    expect(activeResult.sets).toHaveLength(SETS_PER_WORKOUT);
    expect(activeResult.readOpCount).toBeLessThanOrEqual(3);

    // --- BENCHMARK 2: Specific Workout Sets via Compound Index [workoutId+order] ---
    const t1 = performance.now();
    const retrievedSets = await db.sets
      .where('[workoutId+order]')
      .between(['w_850', Dexie.minKey], ['w_850', Dexie.maxKey])
      .toArray();
    const compoundDurationMs = performance.now() - t1;

    expect(compoundDurationMs).toBeLessThan(50);
    expect(retrievedSets).toHaveLength(SETS_PER_WORKOUT);

    // --- BENCHMARK 3: Workout History Assembly by Workout ID ---
    const t2 = performance.now();
    const historySets = await db.sets.where('workoutId').equals('w_250').toArray();
    const historyDurationMs = performance.now() - t2;

    expect(historyDurationMs).toBeLessThan(50);
    expect(historySets).toHaveLength(SETS_PER_WORKOUT);
  });
});

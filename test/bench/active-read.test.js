import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, queryActiveWorkout } from '../../frontend/src/db/index.js';

describe('Active Workout Read-Ops Benchmark & Query Optimization (Phase 3 Veto Walk)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_bench_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('active workout queries execute in <= 3 read-ops via compound index and batch projection with zero N+1 queries', async () => {
    const workoutId = 'w_active_session_42';
    const exercises = [
      'barbell-bench-press',
      'incline-dumbbell-press',
      'weighted-dips',
      'lateral-raise',
      'cable-tricep-pushdown',
      'overhead-extension'
    ];

    // Seed workout
    await db.workouts.put({
      id: workoutId,
      d: '2026-10-10',
      name: 'Upper Hypertrophy',
      start: Date.now(),
      end: null,
      vol: 0
    });

    // Seed 4 sets per exercise (24 total sets) in strict sequential order
    let globalOrder = 0;
    for (const exId of exercises) {
      for (let s = 0; s < 4; s++) {
        await db.sets.add({
          workoutId,
          order: globalOrder++,
          exerciseId: exId,
          w: 50 + s * 10,
          r: 8 + s,
          done: s === 0,
          phase: 'work'
        });
      }
    }

    // Seed historical last performance for each exercise
    for (const exId of exercises) {
      await db.lastPerformance.put({
        exerciseId: exId,
        w: 90,
        r: 8,
        d: '2026-10-03',
        workoutId: 'w_prior_session'
      });
    }

    // Measure query execution and count operations
    const t0 = performance.now();
    const result = await queryActiveWorkout(db, workoutId);
    const queryDurationMs = performance.now() - t0;

    // 1. Gate constraint: Total read-ops <= 3
    expect(result.readOpCount).toBeLessThanOrEqual(3);
    expect(result.readOpCount).toBe(3);

    // 2. Performance SLO: Under 16ms (single frame budget)
    expect(queryDurationMs).toBeLessThan(16);

    // 3. Completeness & Ordering
    expect(result.workout).toBeDefined();
    expect(result.workout.id).toBe(workoutId);
    expect(result.sets).toHaveLength(24);

    // Sets must be in strictly increasing order
    for (let i = 1; i < result.sets.length; i++) {
      expect(result.sets[i].order).toBeGreaterThan(result.sets[i - 1].order);
    }

    // 4. Zero N+1 verification: all 6 exercise marks fetched in single batch read-op
    expect(result.lastPerformance).toHaveLength(6);
    const fetchedExIds = new Set(result.lastPerformance.map(p => p.exerciseId));
    for (const exId of exercises) {
      expect(fetchedExIds.has(exId)).toBe(true);
    }
  });
});

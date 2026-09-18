import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, finishWorkoutSession } from '../frontend/src/db/index.js';

describe('Workout Session Lifecycle Completion (Journey 2 & INV-07)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_finish_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('atomically computes volume, stamps end timestamp, updates lastPerformance, and appends completion audit', async () => {
    const workoutId = 'w_finish_session';
    const workoutDate = '2026-10-06';
    const startTimestamp = 1791244800000;
    const endTimestamp = startTimestamp + 3600000; // 1 hr session

    await db.workouts.put({
      id: workoutId,
      d: workoutDate,
      name: 'Legs & Push',
      start: startTimestamp,
      end: null,
      vol: 0
    });

    // Warmup set (excluded from work volume)
    await db.sets.add({
      workoutId,
      order: 0,
      exerciseId: 'barbell-bench-press',
      w: 60,
      r: 10,
      done: true,
      phase: 'warmup'
    });

    // Work sets for bench press: 100 x 5 = 500, 105 x 5 = 525 (best 105 x 5)
    await db.sets.add({
      workoutId,
      order: 1,
      exerciseId: 'barbell-bench-press',
      w: 100,
      r: 5,
      done: true,
      phase: 'work'
    });
    await db.sets.add({
      workoutId,
      order: 2,
      exerciseId: 'barbell-bench-press',
      w: 105,
      r: 5,
      done: true,
      phase: 'work'
    });

    // Work sets for back squat: 140 x 5 = 700, 140 x 5 = 700
    await db.sets.add({
      workoutId,
      order: 3,
      exerciseId: 'barbell-squat',
      w: 140,
      r: 5,
      done: true,
      phase: 'work'
    });
    await db.sets.add({
      workoutId,
      order: 4,
      exerciseId: 'barbell-squat',
      w: 140,
      r: 5,
      done: true,
      phase: 'work'
    });

    // Unchecked planned set (not done: must not be counted in volume)
    await db.sets.add({
      workoutId,
      order: 5,
      exerciseId: 'barbell-squat',
      w: 145,
      r: 5,
      done: false,
      phase: 'work'
    });

    // Total work volume = 500 + 525 + 700 + 700 = 2425
    const result = await finishWorkoutSession(db, {
      workoutId,
      end: endTimestamp,
      who: 'athlete_mike'
    });

    expect(result.vol).toBe(2425);
    expect(result.end).toBe(endTimestamp);
    expect(result.exerciseCount).toBe(2);

    // Verify workout document in IndexedDB
    const finishedWorkout = await db.workouts.get(workoutId);
    expect(finishedWorkout.end).toBe(endTimestamp);
    expect(finishedWorkout.vol).toBe(2425);
    expect(finishedWorkout.updatedAt).toBeGreaterThan(0);

    // Verify lastPerformance projections (INV-07)
    const benchPerf = await db.lastPerformance.get('barbell-bench-press');
    expect(benchPerf).toBeDefined();
    expect(benchPerf.w).toBe(105);
    expect(benchPerf.r).toBe(5);
    expect(benchPerf.d).toBe(workoutDate);
    expect(benchPerf.workoutId).toBe(workoutId);

    const squatPerf = await db.lastPerformance.get('barbell-squat');
    expect(squatPerf).toBeDefined();
    expect(squatPerf.w).toBe(140);
    expect(squatPerf.r).toBe(5);
    expect(squatPerf.d).toBe(workoutDate);
    expect(squatPerf.workoutId).toBe(workoutId);

    // Verify completion audit entry in auditLog
    const completionAudits = await db.auditLog
      .where('entityId')
      .equals(workoutId)
      .and(rec => rec.op === 'complete')
      .toArray();

    expect(completionAudits).toHaveLength(1);
    const audit = completionAudits[0];
    expect(audit.who).toBe('athlete_mike');
    expect(audit.validTime).toBe(workoutDate);
    expect(audit.txTime).toBeGreaterThan(0);

    const snapshot = JSON.parse(audit.snapshot);
    expect(snapshot.vol).toBe(2425);
    expect(snapshot.end).toBe(endTimestamp);
  });
});

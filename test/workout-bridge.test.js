import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createDatabase,
  liveQuery,
  checkSet,
  finishWorkoutSession,
  queryActiveWorkout,
  syncActiveWorkoutToDexie
} from '../frontend/src/db/index.js';

describe('UI to Dexie Persistence Bridge & Bitemporal Audit Integration', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_bridge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('syncActiveWorkoutToDexie populates workouts, entries, and sets with bitemporal audit trail', async () => {
    const activeWorkout = {
      id: 'w_bridge_1',
      d: '2026-10-15',
      name: 'Push & Core',
      start: 1792000000000,
      entries: [
        {
          id: 'barbell-bench-press',
          target: { mode: 'reps' },
          sets: [
            { w: 60, r: 10, done: false, phase: 'warmup', type: 'straight' },
            { w: 100, r: 5, done: false, phase: 'work', type: 'straight' },
            { w: 100, r: 5, done: false, phase: 'work', type: 'dropset' }
          ]
        },
        {
          id: 'plank',
          target: { mode: 'time', sec: 60 },
          sets: [
            { sec: 60, w: 0, done: false, phase: 'work', type: 'straight' }
          ]
        }
      ]
    };

    await syncActiveWorkoutToDexie(db, activeWorkout, { who: 'coach_john' });

    // Verify workout in db
    const workout = await db.workouts.get('w_bridge_1');
    expect(workout).not.toBeNull();
    expect(workout.name).toBe('Push & Core');
    expect(workout.end).toBeNull();

    // Verify entries
    const entries = await db.workoutEntries.where('workoutId').equals('w_bridge_1').toArray();
    expect(entries).toHaveLength(2);

    // Verify sets
    const sets = await db.sets.where('workoutId').equals('w_bridge_1').toArray();
    expect(sets).toHaveLength(4);

    // Verify queryActiveWorkout executes in <= 3 read-ops
    const queryResult = await queryActiveWorkout(db, 'w_bridge_1');
    expect(queryResult.readOpCount).toBeLessThanOrEqual(3);
    expect(queryResult.sets).toHaveLength(4);
    expect(queryResult.workout.id).toBe('w_bridge_1');

    // Verify bitemporal audit trail
    const audits = await db.auditLog.where('entity').equals('workouts').toArray();
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].who).toBe('coach_john');
  });

  it('continuous set toggles write to Dexie and stream through liveQuery without lost updates', async () => {
    const activeWorkout = {
      id: 'w_bridge_live',
      d: '2026-10-15',
      name: 'Leg Day',
      start: Date.now(),
      entries: [
        {
          id: 'barbell-squat',
          sets: [
            { w: 140, r: 5, done: false, phase: 'work', type: 'straight' },
            { w: 140, r: 5, done: false, phase: 'work', type: 'straight' }
          ]
        }
      ]
    };

    await syncActiveWorkoutToDexie(db, activeWorkout, { who: 'athlete_sarah' });

    let latestSets = [];
    const sub = liveQuery(() =>
      db.sets.where('[workoutId+order]').between(['w_bridge_live', -Infinity], ['w_bridge_live', Infinity]).toArray()
    ).subscribe({
      next: val => { latestSets = val; }
    });

    await new Promise(r => setTimeout(r, 20));
    expect(latestSets).toHaveLength(2);
    expect(latestSets[0].done).toBe(false);

    // Toggle set 1
    const set1Id = latestSets[0].id;
    await checkSet(db, {
      workoutId: 'w_bridge_live',
      setId: set1Id,
      done: true,
      w: 142.5,
      r: 5,
      rir: 1,
      who: 'athlete_sarah'
    });

    await new Promise(r => setTimeout(r, 20));
    expect(latestSets[0].done).toBe(true);
    expect(latestSets[0].w).toBe(142.5);
    expect(latestSets[0].rir).toBe(1);

    // Complete workout session
    const finishRes = await finishWorkoutSession(db, {
      workoutId: 'w_bridge_live',
      end: Date.now(),
      who: 'athlete_sarah'
    });

    expect(finishRes.vol).toBe(142.5 * 5);

    // Verify workout marked finished in db
    const finalWorkout = await db.workouts.get('w_bridge_live');
    expect(finalWorkout.end).not.toBeNull();
    expect(finalWorkout.vol).toBe(142.5 * 5);

    // Verify lastPerformance record populated
    const perf = await db.lastPerformance.get('barbell-squat');
    expect(perf).not.toBeNull();
    expect(perf.w).toBe(142.5);
    expect(perf.r).toBe(5);

    sub.unsubscribe();
  });
});

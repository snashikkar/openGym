import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, liveQuery, checkSet } from '../frontend/src/db/index.js';

describe('Workout Logging & Reactive Subscriptions (Journey 2 Happy Path & INV-01, INV-02)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_logging_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('tapping check on a set executes in <10ms within scoped transaction and updates live query', async () => {
    const workoutId = 'w_active_1';
    await db.workouts.put({
      id: workoutId,
      d: '2026-10-05',
      name: 'Push Day A',
      start: Date.now(),
      end: null,
      vol: 0
    });

    const setId = await db.sets.add({
      workoutId,
      order: 0,
      exerciseId: 'barbell-bench-press',
      w: 100,
      r: 5,
      done: false,
      phase: 'work',
      type: 'straight'
    });

    // Reactive liveQuery listener (mirroring useLiveQuery)
    let liveResults = null;
    const subscription = liveQuery(() =>
      db.sets.where('[workoutId+order]').between([workoutId, -Infinity], [workoutId, Infinity]).toArray()
    ).subscribe({
      next: (val) => { liveResults = val; }
    });

    // Allow initial query to settle
    await new Promise(r => setTimeout(r, 20));
    expect(liveResults).toHaveLength(1);
    expect(liveResults[0].done).toBe(false);

    // Measure execution latency
    const t0 = performance.now();
    const updated = await checkSet(db, {
      workoutId,
      setId,
      done: true,
      w: 102.5,
      r: 5,
      rir: 2,
      who: 'athlete_sarah'
    });
    const latencyMs = performance.now() - t0;

    // Latency SLO constraint (< 10 ms)
    expect(latencyMs).toBeLessThan(10);
    expect(updated.done).toBe(true);
    expect(updated.w).toBe(102.5);
    expect(updated.rir).toBe(2);

    // Allow live query observer to notify
    await new Promise(r => setTimeout(r, 20));
    expect(liveResults).toHaveLength(1);
    expect(liveResults[0].done).toBe(true);
    expect(liveResults[0].w).toBe(102.5);

    // Verify bitemporal audit trail capture (INV-02)
    const auditRecords = await db.auditLog.where('entity').equals('sets').toArray();
    expect(auditRecords.length).toBeGreaterThan(0);
    const lastAudit = auditRecords[auditRecords.length - 1];
    expect(lastAudit.entityId).toBe(setId);
    expect(lastAudit.op).toBe('update');
    expect(lastAudit.who).toBe('athlete_sarah');
    expect(lastAudit.validTime).toBe('2026-10-05');
    expect(lastAudit.txTime).toBeGreaterThan(0);

    const snapshot = JSON.parse(lastAudit.snapshot);
    expect(snapshot.done).toBe(true);
    expect(snapshot.w).toBe(102.5);

    subscription.unsubscribe();
  });

  it('handles rapid sequential set taps without concurrency collisions or lost updates', async () => {
    const workoutId = 'w_rapid';
    await db.workouts.put({
      id: workoutId,
      d: '2026-10-05',
      name: 'Speed Warmup'
    });

    const setIds = [];
    for (let i = 0; i < 5; i++) {
      const id = await db.sets.add({
        workoutId,
        order: i,
        exerciseId: 'barbell-bench-press',
        w: 40 + i * 10,
        r: 5,
        done: false,
        phase: 'warmup'
      });
      setIds.push(id);
    }

    // 5 rapid taps sequentially
    for (let i = 0; i < setIds.length; i++) {
      const res = await checkSet(db, {
        workoutId,
        setId: setIds[i],
        done: true,
        who: 'athlete'
      });
      expect(res.done).toBe(true);
    }

    const completed = await db.sets.where('workoutId').equals(workoutId).toArray();
    expect(completed).toHaveLength(5);
    expect(completed.every(s => s.done === true)).toBe(true);

    const auditRecords = await db.auditLog.where('entity').equals('sets').toArray();
    expect(auditRecords).toHaveLength(5);
  });

  it('atomically rolls back and rejects on INV-06 validation bounds error without corrupting state', async () => {
    const workoutId = 'w_invalid_check';
    await db.workouts.put({ id: workoutId, d: '2026-10-05', name: 'Bounds Test' });
    const setId = await db.sets.add({
      workoutId,
      order: 0,
      exerciseId: 'squat',
      w: 100,
      r: 5,
      done: false
    });

    let threw = false;
    try {
      await checkSet(db, {
        workoutId,
        setId,
        done: true,
        w: -25 // Illegal negative weight
      });
    } catch (err) {
      threw = true;
      expect(err.message).toContain('INV-06');
    }

    expect(threw).toBe(true);

    // Verify set is untouched
    const set = await db.sets.get(setId);
    expect(set.done).toBe(false);
    expect(set.w).toBe(100);

    // Verify no stray audit record committed
    const auditRecords = await db.auditLog.where('entity').equals('sets').toArray();
    expect(auditRecords).toHaveLength(0);
  });
});

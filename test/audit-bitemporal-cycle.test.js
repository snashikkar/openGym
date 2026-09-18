import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase, editPastWorkout } from '../frontend/src/db/index.js';

describe('Bitemporal Audit Trail & Retroactive Amendments (Gahana Cycle & DEC-08)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('retroactive edit of past workout date or load creates immutable revision in auditLog capturing who, valid-time, and tx-time', async () => {
    const workoutId = 'w_hist_sept1';
    const originalDate = '2026-09-01';
    const newDate = '2026-09-02';

    // Original completed workout recorded 3 weeks ago
    await db.workouts.put({
      id: workoutId,
      d: originalDate,
      name: 'Chest & Biceps',
      start: 1788220800000,
      end: 1788224400000,
      vol: 1800,
      createdAt: 1788220800000,
      _who: 'athlete_coach'
    });

    const setId = await db.sets.add({
      workoutId,
      order: 0,
      exerciseId: 'barbell-bench-press',
      w: 90,
      r: 8,
      done: true,
      phase: 'work',
      _who: 'athlete_coach'
    });

    // Clear initial creation audits for clean assertion of amendment
    await db.auditLog.clear();

    const editTimestamp = Date.now();

    // Retroactive amendment: change workout date to 2026-09-02 and correct weight to 95kg
    await editPastWorkout(db, {
      workoutId,
      date: newDate,
      setUpdates: [
        { id: setId, w: 95, r: 8 }
      ],
      who: 'athlete_john'
    });

    // Verify current state is updated in Dexie
    const updatedWorkout = await db.workouts.get(workoutId);
    expect(updatedWorkout.d).toBe(newDate);

    const updatedSet = await db.sets.get(setId);
    expect(updatedSet.w).toBe(95);

    // Verify bitemporal audit trail entries (DEC-08)
    const auditEntries = await db.auditLog.toArray();
    expect(auditEntries.length).toBeGreaterThan(0);

    // Verify set update audit
    const setAudit = auditEntries.find(e => e.entity === 'sets' && e.entityId === setId);
    expect(setAudit).toBeDefined();
    expect(setAudit.op).toBe('update');
    expect(setAudit.who).toBe('athlete_john');
    expect(setAudit.validTime).toBe(newDate);
    expect(setAudit.txTime).toBeGreaterThanOrEqual(editTimestamp);

    const setSnapshot = JSON.parse(setAudit.snapshot);
    expect(setSnapshot.w).toBe(95);

    // Verify top-level workout amendment audit
    const workoutAmend = auditEntries.find(e => e.entity === 'workouts' && e.op === 'amend');
    expect(workoutAmend).toBeDefined();
    expect(workoutAmend.who).toBe('athlete_john');
    expect(workoutAmend.validTime).toBe(newDate);
    expect(workoutAmend.txTime).toBeGreaterThanOrEqual(editTimestamp);

    const amendSnapshot = JSON.parse(workoutAmend.snapshot);
    expect(amendSnapshot.prior.d).toBe(originalDate);
    expect(amendSnapshot.amendedDate).toBe(newDate);
  });

  it('preserves historical state across sequential retroactive edits without destructive deletion', async () => {
    const workoutId = 'w_multi_amend';
    await db.workouts.put({ id: workoutId, d: '2026-09-10', name: 'Back Day' });
    const setId = await db.sets.add({
      workoutId,
      order: 0,
      exerciseId: 'pullup',
      w: 0,
      r: 8,
      done: true
    });

    // Amendment 1: Athlete corrected weight to +10kg
    await editPastWorkout(db, {
      workoutId,
      setUpdates: [{ id: setId, w: 10 }],
      who: 'athlete'
    });

    // Amendment 2: Athlete added RIR = 2
    await editPastWorkout(db, {
      workoutId,
      setUpdates: [{ id: setId, rir: 2 }],
      who: 'coach_dave'
    });

    // Verify auditLog preserves both historical revisions in append-only order
    const audits = await db.auditLog.where('entity').equals('sets').toArray();
    expect(audits).toHaveLength(2);

    expect(audits[0].who).toBe('athlete');
    const snap1 = JSON.parse(audits[0].snapshot);
    expect(snap1.w).toBe(10);

    expect(audits[1].who).toBe('coach_dave');
    const snap2 = JSON.parse(audits[1].snapshot);
    expect(snap2.rir).toBe(2);

    // Both transaction timestamps must be monotonically non-decreasing
    expect(audits[1].txTime).toBeGreaterThanOrEqual(audits[0].txTime);
  });

  it('enforces soft-deletion for workouts and preserves foreign key referents (INV-05)', async () => {
    const workoutId = 'w_soft_del';
    await db.workouts.put({ id: workoutId, d: '2026-09-15', name: 'Cardio', _deleted: false });

    await db.transaction('rw', [db.workouts, db.auditLog], async () => {
      await db.workouts.update(workoutId, { _deleted: true, _who: 'athlete' });
    });

    // Physical row must still exist in IndexedDB (never destroyed)
    const row = await db.workouts.get(workoutId);
    expect(row).toBeDefined();
    expect(row._deleted).toBe(true);

    // Audit log records delete operation with actor and timestamp
    const deleteAudit = await db.auditLog
      .where('entityId')
      .equals(workoutId)
      .and(a => a.op === 'delete')
      .first();

    expect(deleteAudit).toBeDefined();
    expect(deleteAudit.who).toBe('athlete');
    expect(deleteAudit.validTime).toBe('2026-09-15');
  });
});

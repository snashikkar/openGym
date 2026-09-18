import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createDatabase,
  logBodyweight,
  deleteBodyweight,
  queryBodyweight
} from '../frontend/src/db/index.js';

describe('Daily Weigh-Ins & Unique Date Index Enforcement (Journey 2 & INV-02)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_bw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('enforces unique date index &d, rejecting duplicate raw insertions with ConstraintError', async () => {
    const weighInDate = '2026-10-12';

    await db.bodyweight.add({
      id: 'bw_raw_1',
      d: weighInDate,
      w: 81.5,
      t: 1791763200000,
      createdAt: Date.now(),
      _deleted: false
    });

    // Attempting a second raw add with identical date index &d must fail
    let thrownError = null;
    try {
      await db.bodyweight.add({
        id: 'bw_raw_2',
        d: weighInDate,
        w: 81.2,
        t: 1791766800000,
        createdAt: Date.now(),
        _deleted: false
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    // Unique key constraint violated in IndexedDB
    expect(thrownError.name).toMatch(/ConstraintError/);
  });

  it('daily weigh-ins enforce unique date index &d, upserting same-day records and capturing audit entries', async () => {
    const weighInDate = '2026-10-12';

    // 1. First morning weigh-in
    const firstLog = await logBodyweight(db, {
      d: weighInDate,
      w: 82.0,
      t: 1791763200000,
      who: 'athlete_david'
    });

    expect(firstLog.d).toBe(weighInDate);
    expect(firstLog.w).toBe(82.0);
    expect(firstLog._deleted).toBe(false);

    // Verify record in bodyweight table
    const stored1 = await db.bodyweight.where('d').equals(weighInDate).first();
    expect(stored1).toBeDefined();
    expect(stored1.w).toBe(82.0);

    // Verify creation audit entry
    const creationAudits = await db.auditLog
      .where('entity')
      .equals('bodyweight')
      .and(a => a.op === 'create' && a.validTime === weighInDate)
      .toArray();
    expect(creationAudits).toHaveLength(1);
    expect(creationAudits[0].who).toBe('athlete_david');
    expect(creationAudits[0].txTime).toBeGreaterThan(0);

    // 2. Second evening weigh-in on the same day -> upserts cleanly without constraint collision
    const secondLog = await logBodyweight(db, {
      d: weighInDate,
      w: 81.7,
      t: 1791806400000,
      who: 'athlete_david'
    });

    expect(secondLog.id).toBe(firstLog.id);
    expect(secondLog.w).toBe(81.7);

    // Verify exactly ONE record remains in table for this date
    const allRecordsForDate = await db.bodyweight.where('d').equals(weighInDate).toArray();
    expect(allRecordsForDate).toHaveLength(1);
    expect(allRecordsForDate[0].w).toBe(81.7);

    // Verify update audit entry appended (monotonic audit trail)
    const updateAudits = await db.auditLog
      .where('entity')
      .equals('bodyweight')
      .and(a => a.op === 'update' && a.validTime === weighInDate)
      .toArray();
    expect(updateAudits).toHaveLength(1);
    expect(updateAudits[0].who).toBe('athlete_david');

    const snapshot = JSON.parse(updateAudits[0].snapshot);
    expect(snapshot.w).toBe(81.7);
  });

  it('soft-deletes bodyweight entries, preserving audit records and filtering active views', async () => {
    const d1 = '2026-10-10';
    const d2 = '2026-10-11';

    await logBodyweight(db, { d: d1, w: 80.0, who: 'athlete' });
    await logBodyweight(db, { d: d2, w: 80.5, who: 'athlete' });

    // Soft-delete d1
    const deleteResult = await deleteBodyweight(db, { d: d1, who: 'athlete' });
    expect(deleteResult._deleted).toBe(true);

    // Active query returns only d2
    const activeList = await queryBodyweight(db);
    expect(activeList).toHaveLength(1);
    expect(activeList[0].d).toBe(d2);

    // Query including deleted returns both
    const fullList = await queryBodyweight(db, { includeDeleted: true });
    expect(fullList).toHaveLength(2);

    // Audit log contains deletion record
    const delAudits = await db.auditLog
      .where('entity')
      .equals('bodyweight')
      .and(a => a.op === 'delete' && a.validTime === d1)
      .toArray();
    expect(delAudits).toHaveLength(1);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDatabase } from '../frontend/src/db/index.js';
import {
  migrateLocalStorage,
  MIGRATION_KEY,
  LEGACY_KEY,
  CORRUPT_BACKUP_KEY
} from '../frontend/src/store/migration.js';

describe('Malformed/Corrupted Payload Fallback (Journey 1 Edge-Case)', () => {
  let db;
  let testDbName;

  beforeEach(() => {
    testDbName = `test_corrupt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    localStorage.clear();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('safely copies truncated JSON to corrupt backup key and recovers valid workout records', async () => {
    // Truncated JSON containing a valid workout record followed by corrupt syntax
    const corruptedPayload = `{"workouts": [{"id": "w_recovered", "name": "Squat Focus", "d": "2026-09-15", "entries": [{"id": "squat", "sets": [{"w": 120, "r": 5, "done": true}]}]}], "routines": [{"id": "broken", "name": "Unfini`;

    localStorage.setItem(LEGACY_KEY, corruptedPayload);

    const result = await migrateLocalStorage({
      db,
      storage: localStorage
    });

    expect(result.status).toBe('corrupt_detected');
    expect(result.backupReceiptKey).toBe(CORRUPT_BACKUP_KEY);

    // 1. Raw corrupted payload must be preserved verbatim in backup
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe(corruptedPayload);

    // 2. Migration flag is set so app boot does not loop
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');

    // 3. Valid workout was successfully recovered into Dexie
    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(1);
    expect(workouts[0].id).toBe('w_recovered');
    expect(workouts[0].name).toBe('Squat Focus');

    const sets = await db.sets.where('workoutId').equals('w_recovered').toArray();
    expect(sets).toHaveLength(1);
    expect(sets[0].w).toBe(120);
    expect(sets[0].r).toBe(5);

    // 4. Migration status in settings reflects corrupt_detected
    const statusSetting = await db.settings.get('migration_status');
    expect(statusSetting.value).toBe('corrupt_detected');

    const receipt = await db.settings.get('migration_receipt');
    expect(receipt.value.corruptDetected).toBe(true);
  });

  it('handles completely unparseable garbage by preserving backup and initializing safe state', async () => {
    const garbagePayload = '<<<TOTAL_CORRUPTION_UNPARSEABLE_DATA_BLOB>>>';
    localStorage.setItem(LEGACY_KEY, garbagePayload);

    const result = await migrateLocalStorage({
      db,
      storage: localStorage
    });

    expect(result.status).toBe('corrupt_detected');
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe(garbagePayload);

    const workouts = await db.workouts.toArray();
    expect(workouts).toHaveLength(0);

    const statusSetting = await db.settings.get('migration_status');
    expect(statusSetting.value).toBe('corrupt_detected');
  });
});

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  migrateLocalStorage,
  MIGRATION_KEY,
  LEGACY_KEY,
  BACKUP_KEY
} from '../frontend/src/store/migration.js';

describe('Blocked IndexedDB Environment Fallback (Journey 1 Failure-Path)', () => {
  const samplePayload = JSON.stringify({
    workouts: [{ id: 'w1', name: 'Pull Day', d: '2026-09-17' }],
    routines: [{ id: 'r1', name: 'Pull' }],
    bodyweight: [{ d: '2026-09-17', w: 80 }]
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LEGACY_KEY, samplePayload);
  });

  it('falls back gracefully to in-memory mode and offers direct JSON export when IDB is blocked', async () => {
    const result = await migrateLocalStorage({
      storage: localStorage,
      simulateBlockedIdb: true
    });

    expect(result.status).toBe('idb_blocked');
    expect(result.inMemory).toBe(true);
    expect(result.canExportJson).toBe(true);
    expect(result.rawJson).toBe(samplePayload);

    // Migration key must not be marked completed so retry is possible
    expect(localStorage.getItem(MIGRATION_KEY)).toBeNull();
    // Raw legacy data in localStorage is intact
    expect(localStorage.getItem(LEGACY_KEY)).toBe(samplePayload);
  });

  it('catches Dexie open failure (quota exhaustion / private mode) and falls back safely', async () => {
    // Mock a db whose open() rejects with QuotaExceededError
    const mockBlockedDb = {
      isOpen: () => false,
      open: async () => {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
    };

    const result = await migrateLocalStorage({
      db: mockBlockedDb,
      storage: localStorage
    });

    expect(result.status).toBe('idb_blocked');
    expect(result.inMemory).toBe(true);
    expect(result.canExportJson).toBe(true);
    expect(result.error).toContain('quota');
    expect(result.rawJson).toBe(samplePayload);
  });
});

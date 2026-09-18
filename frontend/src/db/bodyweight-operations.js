import Dexie from 'dexie';
import { db as defaultDb } from './index.js';

/**
 * 1. Log or upsert daily weigh-in enforcing unique date index &d (INV-02, Command 7).
 * Same-day entries atomically update existing record and append audit entry.
 */
export async function logBodyweight(db = defaultDb, {
  id,
  d,
  w,
  t = Date.now(),
  who = 'athlete'
}) {
  if (!d) throw new Error('Date (d) is required for bodyweight logging');
  if (w === undefined || w === null || typeof w !== 'number' || w <= 0 || !Number.isFinite(w)) {
    throw new Error(`Weight must be positive finite number, got ${w}`);
  }

  return await db.transaction('rw', [db.bodyweight, db.auditLog], async (trans) => {
    trans._who = who;
    const existing = await db.bodyweight.where('d').equals(d).first();

    if (existing) {
      await db.bodyweight.update(existing.id, {
        w,
        t,
        _deleted: false,
        updatedAt: Date.now(),
        _who: who
      });
      return await db.bodyweight.get(existing.id);
    } else {
      const recordId = id || `bw_${d}_${Date.now()}`;
      const record = {
        id: recordId,
        d,
        w,
        t,
        createdAt: Date.now(),
        _deleted: false,
        _who: who
      };
      await db.bodyweight.add(record);
      return record;
    }
  });
}

/**
 * 2. Soft-delete daily weigh-in record.
 */
export async function deleteBodyweight(db = defaultDb, {
  id,
  d,
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.bodyweight, db.auditLog], async (trans) => {
    trans._who = who;
    let target = null;
    if (id) {
      target = await db.bodyweight.get(id);
    } else if (d) {
      target = await db.bodyweight.where('d').equals(d).first();
    }
    if (!target) throw new Error('Bodyweight record not found');

    await db.bodyweight.update(target.id, {
      _deleted: true,
      updatedAt: Date.now(),
      _who: who
    });

    return { id: target.id, d: target.d, _deleted: true };
  });
}

/**
 * 3. Query bodyweight records ordered by date.
 */
export async function queryBodyweight(db = defaultDb, { includeDeleted = false } = {}) {
  let records = await db.bodyweight.orderBy('d').toArray();
  if (!includeDeleted) {
    records = records.filter(r => !r._deleted);
  }
  return records;
}

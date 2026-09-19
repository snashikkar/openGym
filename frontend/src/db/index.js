import Dexie from 'dexie';

export function validateSet(obj) {
  if (obj.w !== undefined && obj.w !== null) {
    if (typeof obj.w !== 'number' || obj.w < 0 || !Number.isFinite(obj.w)) {
      throw new Error(`INV-06 violation: weight must be non-negative finite number, got ${obj.w}`);
    }
  }
  if (obj.r !== undefined && obj.r !== null) {
    if (typeof obj.r !== 'number' || obj.r < 0 || !Number.isInteger(obj.r)) {
      throw new Error(`INV-06 violation: reps must be non-negative integer, got ${obj.r}`);
    }
  }
  if (obj.rir !== undefined && obj.rir !== null) {
    if (typeof obj.rir !== 'number' || obj.rir < 0 || obj.rir > 6) {
      throw new Error(`INV-06 violation: RIR must be between 0 and 6, got ${obj.rir}`);
    }
  }
  if (obj.rpe !== undefined && obj.rpe !== null) {
    if (typeof obj.rpe !== 'number' || obj.rpe < 6 || obj.rpe > 10) {
      throw new Error(`INV-06 violation: RPE must be between 6 and 10, got ${obj.rpe}`);
    }
  }
}

export function setupAuditHooks(db) {
  const auditedTables = ['workouts', 'sets', 'routines', 'bodyweight'];

  for (const tableName of auditedTables) {
    const table = db.table(tableName);
    if (!table) continue;

    table.hook('creating', function (primKey, obj, trans) {
      const hasAudit = trans && (trans.tables?.auditLog || trans.storeNames?.includes('auditLog'));
      if (hasAudit && !trans._skipAudit) {
        const entityId = primKey || obj.id || (tableName === 'bodyweight' ? obj.d : null);
        const validTime = obj.d || (obj.start ? new Date(obj.start).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
        trans.table('auditLog').add({
          entity: tableName,
          entityId,
          op: 'create',
          who: obj._who || trans?._who || 'athlete',
          validTime,
          txTime: Date.now(),
          snapshot: JSON.stringify(obj)
        });
      }
    });

    table.hook('updating', function (modifications, primKey, obj, trans) {
      const hasAudit = trans && (trans.tables?.auditLog || trans.storeNames?.includes('auditLog'));
      if (hasAudit && !trans._skipAudit) {
        const entityId = primKey || obj.id;
        const validTime = modifications.d || obj.d || new Date().toISOString().slice(0, 10);
        const nextSnapshot = { ...obj, ...modifications };
        trans.table('auditLog').add({
          entity: tableName,
          entityId,
          op: modifications._deleted ? 'delete' : 'update',
          who: modifications._who || trans?._who || obj._who || 'athlete',
          validTime,
          txTime: Date.now(),
          snapshot: JSON.stringify(nextSnapshot)
        });
      }
    });
  }
}

export function configureSchema(db) {
  db.version(1).stores({
    workouts: 'id, d, routineId, name, start, end, vol, _rev, _deleted, createdAt, updatedAt',
    workoutEntries: '++id, workoutId, exerciseId, order',
    sets: '++id, workoutId, entryId, exerciseId, [workoutId+order], order, w, r, done, phase, type, rir, rpe',
    routines: 'id, name, _deleted, updatedAt',
    routineExercises: '++id, routineId, exerciseId, order',
    bodyweight: 'id, &d, w, t, createdAt, _deleted',
    customExercises: 'id, name, category, equipment, muscles, _deleted, updatedAt',
    lastPerformance: 'exerciseId, w, r, d, workoutId',
    settings: 'key, value, updatedAt',
    auditLog: '++id, entity, entityId, op, who, validTime, txTime',
    syncQueue: '++id, op, entity, entityId, status, createdAt'
  });

  db.table('sets').hook('creating', (primKey, obj, trans) => {
    validateSet(obj);
  });

  db.table('sets').hook('updating', (modifications, primKey, obj, trans) => {
    validateSet({ ...obj, ...modifications });
  });

  setupAuditHooks(db);
}

export function createDatabase(name = 'openGym') {
  const db = new Dexie(name);
  configureSchema(db);
  return db;
}

export const db = createDatabase('openGym');

export { liveQuery, useLiveQuery } from './hooks.js';
export {
  checkSet,
  finishWorkoutSession,
  editPastWorkout,
  queryActiveWorkout,
  syncActiveWorkoutToDexie
} from './workout-operations.js';
export {
  createRoutine,
  updateRoutine,
  deleteRoutine,
  queryRoutines,
  queryRoutineById
} from './routine-operations.js';
export {
  logBodyweight,
  deleteBodyweight,
  queryBodyweight
} from './bodyweight-operations.js';



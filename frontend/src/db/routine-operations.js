import Dexie from 'dexie';
import { db as defaultDb } from './index.js';

/**
 * 1. Create a routine template and its prescribed exercises within a Dexie transaction.
 * Appends auditLog record automatically via table hook.
 */
export async function createRoutine(db = defaultDb, {
  id,
  name,
  exercises = [],
  emoji,
  prog,
  who = 'athlete'
}) {
  const routineId = id || `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return await db.transaction('rw', [db.routines, db.routineExercises, db.auditLog], async (trans) => {
    trans._who = who;
    const routineRecord = {
      id: routineId,
      name: name || 'Routine',
      _deleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      _who: who,
      ...(emoji ? { emoji } : {}),
      ...(prog ? { prog } : {})
    };

    await db.routines.add(routineRecord);

    const routineExerciseRows = exercises.map((ex, order) => {
      const exerciseId = typeof ex === 'string' ? ex : (ex.exerciseId || ex.id);
      return {
        routineId,
        exerciseId,
        order,
        ...(typeof ex === 'object' ? ex : {})
      };
    });

    if (routineExerciseRows.length > 0) {
      await db.routineExercises.bulkAdd(routineExerciseRows);
    }

    return {
      ...routineRecord,
      exercises: routineExerciseRows
    };
  });
}

/**
 * 2. Update an existing routine template and its exercises within a Dexie transaction.
 * Appends update audit entry via table hook.
 */
export async function updateRoutine(db = defaultDb, {
  id,
  name,
  exercises,
  emoji,
  prog,
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.routines, db.routineExercises, db.auditLog], async (trans) => {
    trans._who = who;
    const routine = await db.routines.get(id);
    if (!routine) throw new Error(`Routine not found: ${id}`);

    const modifications = {
      updatedAt: Date.now(),
      _who: who
    };
    if (name !== undefined) modifications.name = name;
    if (emoji !== undefined) modifications.emoji = emoji;
    if (prog !== undefined) modifications.prog = prog;

    await db.routines.update(id, modifications);

    if (exercises !== undefined) {
      await db.routineExercises.where('routineId').equals(id).delete();
      const routineExerciseRows = exercises.map((ex, order) => {
        const exerciseId = typeof ex === 'string' ? ex : (ex.exerciseId || ex.id);
        return {
          routineId: id,
          exerciseId,
          order,
          ...(typeof ex === 'object' ? ex : {})
        };
      });
      if (routineExerciseRows.length > 0) {
        await db.routineExercises.bulkAdd(routineExerciseRows);
      }
    }

    return await queryRoutineById(db, id, { includeDeleted: true });
  });
}

/**
 * 3. Soft-delete a routine template (INV-05).
 * Marks _deleted: true and appends audit entry.
 * Foreign key references in historical workouts are strictly preserved.
 */
export async function deleteRoutine(db = defaultDb, {
  id,
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.routines, db.auditLog], async (trans) => {
    trans._who = who;
    const routine = await db.routines.get(id);
    if (!routine) throw new Error(`Routine not found: ${id}`);

    await db.routines.update(id, {
      _deleted: true,
      updatedAt: Date.now(),
      _who: who
    });

    return { id, _deleted: true };
  });
}

/**
 * 4. Query routines. By default excludes soft-deleted routines (_deleted: true).
 */
export async function queryRoutines(db = defaultDb, { includeDeleted = false } = {}) {
  let routines = await db.routines.toArray();
  if (!includeDeleted) {
    routines = routines.filter(r => !r._deleted);
  }

  const result = [];
  for (const r of routines) {
    const exercises = await db.routineExercises
      .where('routineId')
      .equals(r.id)
      .sortBy('order');
    result.push({
      ...r,
      exercises
    });
  }

  return result;
}

/**
 * 5. Query a single routine by ID with its prescribed exercises.
 */
export async function queryRoutineById(db = defaultDb, id, { includeDeleted = false } = {}) {
  const routine = await db.routines.get(id);
  if (!routine) return null;
  if (!includeDeleted && routine._deleted) return null;

  const exercises = await db.routineExercises
    .where('routineId')
    .equals(id)
    .sortBy('order');

  return {
    ...routine,
    exercises
  };
}

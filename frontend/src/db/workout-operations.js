import Dexie from 'dexie';
import { db as defaultDb } from './index.js';

/**
 * 1. Check/uncheck or log a set within a scoped transaction: [workouts, sets, auditLog].
 * Mutation executes in <10ms and table hook automatically writes auditLog record.
 */
export async function checkSet(db = defaultDb, {
  workoutId,
  setId,
  done = true,
  w,
  r,
  rir,
  rpe,
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.workouts, db.sets, db.auditLog], async () => {
    const workout = await db.workouts.get(workoutId);
    const set = await db.sets.get(setId);
    if (!set) throw new Error(`Set not found: ${setId}`);
    if (set.workoutId !== workoutId) {
      throw new Error(`Set ${setId} does not belong to workout ${workoutId}`);
    }

    const modifications = {
      done: Boolean(done),
      _who: who,
      ...(workout?.d ? { d: workout.d } : {})
    };
    if (w !== undefined) modifications.w = w;
    if (r !== undefined) modifications.r = r;
    if (rir !== undefined) modifications.rir = rir;
    if (rpe !== undefined) modifications.rpe = rpe;

    await db.sets.update(setId, modifications);
    return await db.sets.get(setId);
  });
}

/**
 * 2. Completes a workout session atomically: computes volume (vol), stamps end,
 * updates lastPerformance table for each distinct completed exercise, and
 * appends a completion audit entry.
 */
export async function finishWorkoutSession(db = defaultDb, {
  workoutId,
  end = Date.now(),
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.workouts, db.sets, db.lastPerformance, db.auditLog], async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) throw new Error(`Workout not found: ${workoutId}`);

    const sets = await db.sets.where('workoutId').equals(workoutId).toArray();

    // Compute volume: sum(w * r) for completed sets (excluding warmups if desired, or all done sets with weight > 0)
    const vol = sets
      .filter(s => s.done && s.w > 0 && s.r > 0 && s.phase !== 'warmup')
      .reduce((acc, s) => acc + (s.w * s.r), 0);

    // Update workout
    await db.workouts.update(workoutId, {
      end,
      vol,
      updatedAt: Date.now(),
      _who: who
    });

    // Update lastPerformance for distinct exercises in the workout
    const completedSets = sets.filter(s => s.done && s.w > 0 && s.r > 0);
    const exerciseBestMap = new Map();
    for (const s of completedSets) {
      const exId = s.exerciseId;
      if (!exId) continue;
      const currentBest = exerciseBestMap.get(exId);
      if (!currentBest || s.w > currentBest.w || (s.w === currentBest.w && s.r > currentBest.r)) {
        exerciseBestMap.set(exId, s);
      }
    }

    for (const [exerciseId, bestSet] of exerciseBestMap.entries()) {
      await db.lastPerformance.put({
        exerciseId,
        w: bestSet.w,
        r: bestSet.r,
        d: workout.d || new Date(workout.start || Date.now()).toISOString().slice(0, 10),
        workoutId
      });
    }

    // Append completion audit entry
    await db.auditLog.add({
      entity: 'workouts',
      entityId: workoutId,
      op: 'complete',
      who,
      validTime: workout.d || new Date().toISOString().slice(0, 10),
      txTime: Date.now(),
      snapshot: JSON.stringify({
        ...workout,
        end,
        vol
      })
    });

    return {
      workoutId,
      end,
      vol,
      exerciseCount: exerciseBestMap.size
    };
  });
}

/**
 * 3. Retroactive edit of past workout date or load.
 * Creates an immutable revision record in auditLog capturing actor who,
 * valid-time, and transaction-time without destroying historical state (Gahana temporal cycle).
 */
export async function editPastWorkout(db = defaultDb, {
  workoutId,
  date,
  updates = {},
  setUpdates = [],
  who = 'athlete'
}) {
  return await db.transaction('rw', [db.workouts, db.sets, db.auditLog], async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) throw new Error(`Workout not found: ${workoutId}`);

    const validTime = date || workout.d || new Date().toISOString().slice(0, 10);

    // Update workout metadata if date or updates supplied
    const workoutMods = {
      ...updates,
      _who: who,
      updatedAt: Date.now()
    };
    if (date) workoutMods.d = date;

    await db.workouts.update(workoutId, workoutMods);

    // Update sets
    for (const item of setUpdates) {
      if (!item || item.id == null) continue;
      const setMods = {
        ...item,
        _who: who,
        ...(date ? { d: date } : {})
      };
      delete setMods.id;
      await db.sets.update(item.id, setMods);
    }

    // Explicit top-level revision record in auditLog for the temporal edit
    await db.auditLog.add({
      entity: 'workouts',
      entityId: workoutId,
      op: 'amend',
      who,
      validTime,
      txTime: Date.now(),
      snapshot: JSON.stringify({
        prior: workout,
        amendedDate: date || null,
        workoutMods,
        setUpdates
      })
    });

    return await db.workouts.get(workoutId);
  });
}

/**
 * 4. Active workout queries execute in <= 3 read-ops via compound index
 * [workoutId+order] and lastPerformance.where('exerciseId').anyOf() with zero N+1 queries.
 */
export async function queryActiveWorkout(db = defaultDb, activeWorkoutId) {
  let readOpCount = 0;

  // Read-op 1: Workout header
  const workout = await db.workouts.get(activeWorkoutId);
  readOpCount++;

  if (!workout) {
    return { workout: null, sets: [], lastPerformance: [], readOpCount };
  }

  // Read-op 2: All active sets in sequence via compound index [workoutId+order]
  const sets = await db.sets
    .where('[workoutId+order]')
    .between([activeWorkoutId, Dexie.minKey], [activeWorkoutId, Dexie.maxKey])
    .toArray();
  readOpCount++;

  // Read-op 3: Batch retrieval of lastPerformance marks across all active exercises (zero N+1)
  const activeExerciseIds = Array.from(new Set(sets.map(s => s.exerciseId).filter(Boolean)));
  const lastPerformance = activeExerciseIds.length > 0
    ? await db.lastPerformance.where('exerciseId').anyOf(activeExerciseIds).toArray()
    : [];
  readOpCount++;

  return {
    workout,
    sets,
    lastPerformance,
    readOpCount
  };
}

/**
 * 5. Sync active workout session and its entries/sets into Dexie.
 * Fulfills continuous persistence and bitemporal audit trail requirements.
 */
export async function syncActiveWorkoutToDexie(db = defaultDb, active, { who = 'athlete' } = {}) {
  if (!active || !active.id) return null;
  return await db.transaction('rw', [db.workouts, db.workoutEntries, db.sets, db.auditLog], async () => {
    await db.workouts.put({
      id: active.id,
      d: active.d || new Date().toISOString().slice(0, 10),
      name: active.name || 'Workout',
      start: active.start || Date.now(),
      end: null,
      vol: 0,
      updatedAt: Date.now(),
      _who: who
    });

    let globalOrder = 0;
    for (let eIdx = 0; eIdx < (active.entries || []).length; eIdx++) {
      const entry = active.entries[eIdx];
      const entryId = entry.entryId || (eIdx + 1);
      entry.entryId = entryId;

      await db.workoutEntries.put({
        id: entryId,
        workoutId: active.id,
        exerciseId: entry.id,
        order: eIdx
      });

      for (let sIdx = 0; sIdx < (entry.sets || []).length; sIdx++) {
        const s = entry.sets[sIdx];
        const setId = s.id || (globalOrder + 1);
        s.id = setId;

        const setRecord = {
          id: setId,
          workoutId: active.id,
          entryId,
          exerciseId: entry.id,
          order: globalOrder,
          done: Boolean(s.done),
          phase: s.phase || (s.warmup ? 'warmup' : 'work'),
          type: s.type || 'straight',
          _who: who
        };
        if (typeof s.w === 'number' && Number.isFinite(s.w) && s.w >= 0) {
          setRecord.w = s.w;
        }
        if (typeof s.r === 'number' && Number.isInteger(s.r) && s.r >= 0) {
          setRecord.r = s.r;
        }
        if (s.rir !== undefined && s.rir !== null) setRecord.rir = s.rir;
        if (s.rpe !== undefined && s.rpe !== null) setRecord.rpe = s.rpe;

        await db.sets.put(setRecord);
        globalOrder++;
      }
    }

    return active;
  });
}

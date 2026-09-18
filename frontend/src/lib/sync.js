import { db as defaultDb } from '../db/index.js';
export const DEF = {
  unit: 'kg', restSec: 90, restPauseSec: 15, sound: true, soundOnSilent: false, timerFlash: false, keepAwake: true, lang: 'en',
  theme: 'dark', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  workoutView: 'cards',
  reminder: { on: false, time: '08:00', tz: null }, effort: null, autoBackup: false,
  equipProfiles: [], activeEquipId: null, equipFilterOn: false,
  exNotes: {},
  favEx: [],
  weekStart: 1,
  barWeights: {},
  gymCards: [],
  lastGymCardId: null,
  checkIn: true,
  weighIn: true
};

const clone = o => JSON.parse(JSON.stringify(o));

/**
 * Serializes normalized Dexie tables into monolithic body.state JSON matching
 * backend PUT /api/data contract (DEC-05).
 */
export async function syncExportProjection(db = defaultDb) {
  // 1. Fetch tables
  const [workouts, workoutEntries, sets, routines, routineExercises, bodyweight, customExercises, settings] = await Promise.all([
    db.workouts.toArray(),
    db.workoutEntries.toArray(),
    db.sets.toArray(),
    db.routines.toArray(),
    db.routineExercises.toArray(),
    db.bodyweight.toArray(),
    db.customExercises.toArray(),
    db.settings.toArray()
  ]);

  // Index workout entries and sets
  const entriesByWorkout = new Map();
  for (const entry of workoutEntries) {
    if (!entriesByWorkout.has(entry.workoutId)) {
      entriesByWorkout.set(entry.workoutId, []);
    }
    entriesByWorkout.get(entry.workoutId).push(entry);
  }
  for (const list of entriesByWorkout.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const setsByEntry = new Map();
  const setsByWorkout = new Map();
  for (const s of sets) {
    if (s.entryId != null) {
      if (!setsByEntry.has(s.entryId)) setsByEntry.set(s.entryId, []);
      setsByEntry.get(s.entryId).push(s);
    }
    if (s.workoutId != null) {
      if (!setsByWorkout.has(s.workoutId)) setsByWorkout.set(s.workoutId, []);
      setsByWorkout.get(s.workoutId).push(s);
    }
  }
  for (const list of setsByEntry.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  for (const list of setsByWorkout.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Reconstruct workouts
  const projectedWorkouts = workouts.map(w => {
    let entries = [];
    const wEntries = entriesByWorkout.get(w.id);

    if (wEntries && wEntries.length > 0) {
      entries = wEntries.map(e => {
        const eSets = (setsByEntry.get(e.id) || []).map(cleanSet);
        return {
          id: e.exerciseId,
          target: { mode: 'reps' },
          sets: eSets
        };
      });
    } else {
      // Fallback: group sets by exerciseId if workoutEntries wasn't populated
      const wSets = setsByWorkout.get(w.id) || [];
      const exMap = new Map();
      for (const s of wSets) {
        const exId = s.exerciseId || 'unknown_ex';
        if (!exMap.has(exId)) exMap.set(exId, []);
        exMap.get(exId).push(cleanSet(s));
      }
      for (const [exId, eSets] of exMap.entries()) {
        entries.push({
          id: exId,
          target: { mode: 'reps' },
          sets: eSets
        });
      }
    }

    return {
      id: w.id,
      d: w.d,
      routineId: w.routineId || null,
      name: w.name || '',
      start: w.start || null,
      end: w.end || null,
      vol: w.vol || 0,
      _rev: w._rev || 1,
      _deleted: Boolean(w._deleted),
      createdAt: w.createdAt || Date.now(),
      updatedAt: w.updatedAt || Date.now(),
      entries
    };
  });

  // Index routine exercises
  const exByRoutine = new Map();
  for (const re of routineExercises) {
    if (!exByRoutine.has(re.routineId)) exByRoutine.set(re.routineId, []);
    exByRoutine.get(re.routineId).push(re);
  }
  for (const list of exByRoutine.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Reconstruct routines
  const projectedRoutines = routines.map(r => {
    const rEx = exByRoutine.get(r.id) || [];
    return {
      id: r.id,
      name: r.name,
      _deleted: Boolean(r._deleted),
      updatedAt: r.updatedAt || Date.now(),
      ex: rEx.map(item => item.exerciseId)
    };
  });

  // Reconstruct bodyweight
  const projectedBodyweight = bodyweight.map(bw => ({
    id: bw.id || bw.d,
    d: bw.d,
    w: bw.w,
    t: bw.t || Date.now(),
    createdAt: bw.createdAt || Date.now(),
    _deleted: Boolean(bw._deleted)
  }));

  // Reconstruct custom exercises
  const projectedCustomEx = customExercises.map(ce => ({
    id: ce.id,
    name: ce.name,
    category: ce.category || 'other',
    equipment: ce.equipment || 'none',
    muscles: Array.isArray(ce.muscles) ? ce.muscles : [],
    _deleted: Boolean(ce._deleted),
    updatedAt: ce.updatedAt || Date.now()
  }));

  // Base defaults
  const state = clone(DEF);
  state.workouts = projectedWorkouts;
  state.routines = projectedRoutines;
  state.bodyweight = projectedBodyweight;
  state.customEx = projectedCustomEx;

  // Internal settings to omit from server sync
  const internalKeys = new Set(['migration_receipt', 'migration_status', 'gym_migrated_v1']);
  for (const row of settings) {
    if (!internalKeys.has(row.key)) {
      state[row.key] = row.value;
    }
  }

  // Active workout is device-local (INV-04, DEC-05)
  delete state.active;

  return state;
}

function cleanSet(s) {
  return {
    w: typeof s.w === 'number' ? s.w : 0,
    r: typeof s.r === 'number' ? s.r : 0,
    done: Boolean(s.done),
    phase: s.phase || 'work',
    type: s.type || 'straight',
    rir: typeof s.rir === 'number' ? s.rir : null,
    rpe: typeof s.rpe === 'number' ? s.rpe : null,
    drops: Array.isArray(s.drops) ? s.drops : [],
    clusters: Array.isArray(s.clusters) ? s.clusters : []
  };
}

/**
 * Pushes projected Dexie state to remote API with HTTP 409 conflict detection.
 */
export async function syncToServer({
  db = defaultDb,
  apiClient,
  baseRev = null,
  force = false
} = {}) {
  if (!apiClient) throw new Error('apiClient is required for syncToServer');

  const state = await syncExportProjection(db);
  const body = { state };
  if (!force && baseRev != null) {
    body.baseRev = baseRev;
  }

  try {
    const res = await apiClient('/api/data', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    return { ok: true, rev: res.rev, ts: res.ts, state };
  } catch (err) {
    if (err.status === 409 || err.error === 'conflict') {
      return {
        conflict: true,
        rev: err.data?.rev ?? err.rev,
        serverState: err.data?.state ?? err.state,
        error: 'HTTP 409 Conflict: remote revision mismatch'
      };
    }
    throw err;
  }
}

import { db as defaultDb } from '../db/index.js';

export const MIGRATION_KEY = 'gym_migrated_v1';
export const LEGACY_KEY = 'gym_state_v1';
export const BACKUP_KEY = 'gym_state_v1_backup';
export const CORRUPT_BACKUP_KEY = 'gym_state_v1_corrupt_backup';

export function attemptPartialJsonRecovery(raw) {
  const recovered = {
    workouts: [],
    routines: [],
    bodyweight: [],
    customEx: [],
    settings: {}
  };

  if (!raw || typeof raw !== 'string') return recovered;

  function extractBalancedObjects(text) {
    const objects = [];
    const stack = [];
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === '{') {
        stack.push(i);
      } else if (char === '}') {
        if (stack.length > 0) {
          const startIdx = stack.pop();
          const candidate = text.slice(startIdx, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            objects.push(parsed);
          } catch (_) {}
        }
      }
    }
    return objects;
  }

  const allObjects = extractBalancedObjects(raw);
  const seenWorkouts = new Set();
  const seenBW = new Set();
  const seenRoutines = new Set();

  for (const obj of allObjects) {
    if (obj && obj.d && (obj.entries || obj.vol !== undefined || (obj.name && obj.id?.startsWith('w')))) {
      const k = obj.id || obj.d;
      if (!seenWorkouts.has(k)) {
        seenWorkouts.add(k);
        recovered.workouts.push(obj);
      }
    } else if (obj && obj.d && obj.w !== undefined && !obj.entries) {
      if (!seenBW.has(obj.d)) {
        seenBW.add(obj.d);
        recovered.bodyweight.push(obj);
      }
    } else if (obj && obj.name && Array.isArray(obj.ex)) {
      const k = obj.id || obj.name;
      if (!seenRoutines.has(k)) {
        seenRoutines.add(k);
        recovered.routines.push(obj);
      }
    } else if (obj && obj.category && obj.equipment) {
      recovered.customEx.push(obj);
    }
  }

  return recovered;
}

export function transformLegacyData(parsed) {
  const workoutRows = [];
  const workoutEntryRows = [];
  const setRows = [];
  const routineRows = [];
  const routineExerciseRows = [];
  const bodyweightRows = [];
  const customExRows = [];
  const lastPerformanceMap = new Map();
  const settingsRows = [];

  let entryIdCounter = 1;
  let setIdCounter = 1;
  let routineExIdCounter = 1;

  // 1. Workouts, Entries & Sets
  const rawWorkouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
  for (const w of rawWorkouts) {
    if (!w) continue;
    const workoutId = String(w.id || `w_${w.d}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    workoutRows.push({
      id: workoutId,
      d: w.d || new Date().toISOString().slice(0, 10),
      routineId: w.routineId || null,
      name: w.name || '',
      start: w.start || null,
      end: w.end || null,
      vol: typeof w.vol === 'number' ? w.vol : 0,
      _rev: w._rev || 1,
      _deleted: Boolean(w._deleted),
      createdAt: w.createdAt || Date.now(),
      updatedAt: w.updatedAt || Date.now()
    });

    const entries = Array.isArray(w.entries) ? w.entries : [];
    let entryOrder = 0;
    for (const entry of entries) {
      if (!entry) continue;
      const entryId = entryIdCounter++;
      const exerciseId = entry.id || entry.exerciseId || 'unknown_ex';

      workoutEntryRows.push({
        id: entryId,
        workoutId,
        exerciseId,
        order: entryOrder++
      });

      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      let setOrder = 0;
      for (const set of sets) {
        if (!set) continue;
        const setId = setIdCounter++;
        const isDone = Boolean(set.done);
        const weight = typeof set.w === 'number' ? set.w : 0;
        const reps = typeof set.r === 'number' ? set.r : 0;

        setRows.push({
          id: setId,
          workoutId,
          entryId,
          exerciseId,
          order: setOrder++,
          w: weight,
          r: reps,
          done: isDone,
          phase: set.phase || (set.warmup ? 'warmup' : 'work'),
          type: set.type || 'straight',
          rir: typeof set.rir === 'number' ? set.rir : null,
          rpe: typeof set.rpe === 'number' ? set.rpe : null,
          drops: Array.isArray(set.drops) ? set.drops : [],
          clusters: Array.isArray(set.clusters) ? set.clusters : []
        });

        // Track last performance for completed workouts and exercises
        if (w.end && isDone && weight > 0 && reps > 0) {
          const prev = lastPerformanceMap.get(exerciseId);
          if (!prev || (w.d && prev.d && w.d >= prev.d)) {
            lastPerformanceMap.set(exerciseId, {
              exerciseId,
              w: weight,
              r: reps,
              d: w.d,
              workoutId
            });
          }
        }
      }
    }
  }

  // 2. Routines & Prescribed Exercises
  const rawRoutines = Array.isArray(parsed.routines) ? parsed.routines : [];
  for (const r of rawRoutines) {
    if (!r) continue;
    const routineId = String(r.id || `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    routineRows.push({
      id: routineId,
      name: r.name || 'Untitled Routine',
      _deleted: Boolean(r._deleted),
      updatedAt: r.updatedAt || Date.now()
    });

    const exList = Array.isArray(r.ex) ? r.ex : [];
    let rOrder = 0;
    for (const ex of exList) {
      if (!ex) continue;
      const exId = typeof ex === 'string' ? ex : (ex.id || 'unknown');
      routineExerciseRows.push({
        id: routineExIdCounter++,
        routineId,
        exerciseId: exId,
        order: rOrder++
      });
    }
  }

  // 3. Bodyweight records (enforcing date uniqueness &d)
  const rawBW = Array.isArray(parsed.bodyweight) ? parsed.bodyweight : [];
  const bwMap = new Map();
  for (const bw of rawBW) {
    if (!bw || !bw.d) continue;
    bwMap.set(bw.d, {
      id: bw.id || bw.d,
      d: bw.d,
      w: typeof bw.w === 'number' ? bw.w : (typeof bw.kg === 'number' ? bw.kg : 0),
      t: bw.t || Date.now(),
      createdAt: bw.createdAt || Date.now(),
      _deleted: Boolean(bw._deleted)
    });
  }
  for (const bw of bwMap.values()) {
    bodyweightRows.push(bw);
  }

  // 4. Custom exercises
  const rawCustom = Array.isArray(parsed.customEx) ? parsed.customEx : [];
  for (const ce of rawCustom) {
    if (!ce || !ce.id) continue;
    customExRows.push({
      id: ce.id,
      name: ce.name || '',
      category: ce.category || 'other',
      equipment: ce.equipment || 'none',
      muscles: Array.isArray(ce.muscles) ? ce.muscles : [],
      _deleted: Boolean(ce._deleted),
      updatedAt: Date.now()
    });
  }

  // 5. Scalar Settings
  const reservedKeys = new Set(['workouts', 'routines', 'bodyweight', 'customEx', 'active']);
  for (const [k, v] of Object.entries(parsed)) {
    if (!reservedKeys.has(k) && v !== undefined) {
      settingsRows.push({
        key: k,
        value: v,
        updatedAt: Date.now()
      });
    }
  }

  return {
    workoutRows,
    workoutEntryRows,
    setRows,
    routineRows,
    routineExerciseRows,
    bodyweightRows,
    customExRows,
    lastPerformanceRows: Array.from(lastPerformanceMap.values()),
    settingsRows
  };
}

export async function migrateLocalStorage({
  db = defaultDb,
  storage = globalThis.localStorage,
  nativeSave = null,
  force = false,
  simulateBlockedIdb = false
} = {}) {
  // Check for blocked IDB simulation or check if IndexedDB is available
  if (simulateBlockedIdb) {
    const raw = storage?.getItem(LEGACY_KEY);
    return {
      status: 'idb_blocked',
      error: 'IndexedDB blocked or storage quota exceeded',
      inMemory: true,
      canExportJson: true,
      rawJson: raw
    };
  }

  try {
    if (!db.isOpen()) {
      await db.open();
    }
  } catch (idbErr) {
    const raw = storage?.getItem(LEGACY_KEY);
    return {
      status: 'idb_blocked',
      error: idbErr.message,
      inMemory: true,
      canExportJson: true,
      rawJson: raw
    };
  }

  // Check idempotency
  if (!force && storage?.getItem(MIGRATION_KEY) === 'true') {
    const receipt = await db.table('settings').get('migration_receipt');
    return {
      status: 'already_migrated',
      migrated: false,
      receipt: receipt?.value
    };
  }

  const raw = storage?.getItem(LEGACY_KEY);

  // New user branch
  if (!raw) {
    await db.transaction('rw', [db.settings], async () => {
      await db.settings.put({
        key: 'migration_status',
        value: 'complete',
        updatedAt: Date.now()
      });
      await db.settings.put({
        key: 'migration_receipt',
        value: { timestamp: Date.now(), count: 0, new_user: true },
        updatedAt: Date.now()
      });
    });
    storage?.setItem(MIGRATION_KEY, 'true');
    return {
      status: 'complete',
      new_user: true,
      count: { workouts: 0, routines: 0, bodyweight: 0 }
    };
  }

  // Backup raw payload prior to mutation (INV-03)
  storage?.setItem(BACKUP_KEY, raw);

  let parsed;
  let corruptDetected = false;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    corruptDetected = true;
    storage?.setItem(CORRUPT_BACKUP_KEY, raw);
    parsed = attemptPartialJsonRecovery(raw);
  }

  const {
    workoutRows,
    workoutEntryRows,
    setRows,
    routineRows,
    routineExerciseRows,
    bodyweightRows,
    customExRows,
    lastPerformanceRows,
    settingsRows
  } = transformLegacyData(parsed);

  try {
    await db.transaction('rw', [
      db.workouts,
      db.workoutEntries,
      db.sets,
      db.routines,
      db.routineExercises,
      db.bodyweight,
      db.customExercises,
      db.lastPerformance,
      db.settings,
      db.auditLog,
      db.syncQueue
    ], async (trans) => {
      trans._skipAudit = true;

      if (force) {
        await Promise.all([
          db.workouts.clear(),
          db.workoutEntries.clear(),
          db.sets.clear(),
          db.routines.clear(),
          db.routineExercises.clear(),
          db.bodyweight.clear(),
          db.customExercises.clear(),
          db.lastPerformance.clear(),
          db.settings.clear()
        ]);
      }

      if (workoutRows.length) await db.workouts.bulkAdd(workoutRows);
      if (workoutEntryRows.length) await db.workoutEntries.bulkAdd(workoutEntryRows);
      if (setRows.length) await db.sets.bulkAdd(setRows);
      if (routineRows.length) await db.routines.bulkAdd(routineRows);
      if (routineExerciseRows.length) await db.routineExercises.bulkAdd(routineExerciseRows);
      if (bodyweightRows.length) await db.bodyweight.bulkAdd(bodyweightRows);
      if (customExRows.length) await db.customExercises.bulkAdd(customExRows);
      if (lastPerformanceRows.length) await db.lastPerformance.bulkPut(lastPerformanceRows);
      if (settingsRows.length) await db.settings.bulkPut(settingsRows);

      await db.settings.put({
        key: 'migration_receipt',
        value: {
          timestamp: Date.now(),
          workoutCount: workoutRows.length,
          setCount: setRows.length,
          routineCount: routineRows.length,
          bodyweightCount: bodyweightRows.length,
          corruptDetected
        },
        updatedAt: Date.now()
      });

      await db.settings.put({
        key: 'migration_status',
        value: corruptDetected ? 'corrupt_detected' : 'complete',
        updatedAt: Date.now()
      });
    });
  } catch (txErr) {
    // Transaction aborted atomically, raw state preserved in localStorage
    throw txErr;
  }

  // Set migrated flag
  storage?.setItem(MIGRATION_KEY, 'true');

  // Capacitor native storage mirror (DEC-07)
  if (typeof nativeSave === 'function') {
    try {
      await nativeSave(parsed);
    } catch (_) {}
  }

  return {
    status: corruptDetected ? 'corrupt_detected' : 'complete',
    backupReceiptKey: corruptDetected ? CORRUPT_BACKUP_KEY : BACKUP_KEY,
    count: {
      workouts: workoutRows.length,
      sets: setRows.length,
      routines: routineRows.length,
      bodyweight: bodyweightRows.length
    }
  };
}

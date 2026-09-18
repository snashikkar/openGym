import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createDatabase,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  queryRoutines,
  queryRoutineById
} from '../frontend/src/db/index.js';

describe('Routine Templates Management & Integrity (Journey 2 & INV-05)', () => {
  let db;
  let testDbName;

  beforeEach(async () => {
    testDbName = `test_routine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db = createDatabase(testDbName);
    await db.open();
  });

  afterEach(async () => {
    if (db) {
      await db.delete();
    }
  });

  it('routine templates create via Dexie transaction, populating routines, routineExercises, and auditLog', async () => {
    const routineId = 'r_upper_hypertrophy';
    const exercises = [
      { exerciseId: 'barbell-bench-press' },
      { exerciseId: 'incline-dumbbell-press' },
      { exerciseId: 'cable-row' }
    ];

    const result = await createRoutine(db, {
      id: routineId,
      name: 'Upper Hypertrophy A',
      exercises,
      emoji: '💪',
      prog: 'linear',
      who: 'coach_dave'
    });

    expect(result.id).toBe(routineId);
    expect(result.name).toBe('Upper Hypertrophy A');
    expect(result._deleted).toBe(false);
    expect(result.exercises).toHaveLength(3);

    // Verify persistence in routines table
    const storedRoutine = await db.routines.get(routineId);
    expect(storedRoutine).toBeDefined();
    expect(storedRoutine.name).toBe('Upper Hypertrophy A');
    expect(storedRoutine._deleted).toBe(false);
    expect(storedRoutine.emoji).toBe('💪');

    // Verify prescribed exercises in routineExercises table
    const storedExercises = await db.routineExercises
      .where('routineId')
      .equals(routineId)
      .sortBy('order');
    expect(storedExercises).toHaveLength(3);
    expect(storedExercises[0].exerciseId).toBe('barbell-bench-press');
    expect(storedExercises[0].order).toBe(0);
    expect(storedExercises[1].exerciseId).toBe('incline-dumbbell-press');
    expect(storedExercises[1].order).toBe(1);
    expect(storedExercises[2].exerciseId).toBe('cable-row');
    expect(storedExercises[2].order).toBe(2);

    // Verify audit entry in auditLog
    const routineAudits = await db.auditLog
      .where('entityId')
      .equals(routineId)
      .and(a => a.entity === 'routines' && a.op === 'create')
      .toArray();
    expect(routineAudits).toHaveLength(1);
    expect(routineAudits[0].who).toBe('coach_dave');
    expect(routineAudits[0].txTime).toBeGreaterThan(0);
  });

  it('routine templates edit atomically, updating metadata, exercises, and logging audit entry', async () => {
    const routineId = 'r_lower_strength';
    await createRoutine(db, {
      id: routineId,
      name: 'Lower Strength v1',
      exercises: ['barbell-squat', 'romanian-deadlift'],
      who: 'athlete_sarah'
    });

    const updated = await updateRoutine(db, {
      id: routineId,
      name: 'Lower Strength v2 (Refined)',
      exercises: ['barbell-squat', 'romanian-deadlift', 'standing-calf-raise'],
      emoji: '🦵',
      who: 'athlete_sarah'
    });

    expect(updated.name).toBe('Lower Strength v2 (Refined)');
    expect(updated.emoji).toBe('🦵');
    expect(updated.exercises).toHaveLength(3);
    expect(updated.exercises[2].exerciseId).toBe('standing-calf-raise');

    // Verify audit entry for update
    const updateAudits = await db.auditLog
      .where('entityId')
      .equals(routineId)
      .and(a => a.entity === 'routines' && a.op === 'update')
      .toArray();
    expect(updateAudits.length).toBeGreaterThanOrEqual(1);
    const lastAudit = updateAudits[updateAudits.length - 1];
    expect(lastAudit.who).toBe('athlete_sarah');
    const snapshot = JSON.parse(lastAudit.snapshot);
    expect(snapshot.name).toBe('Lower Strength v2 (Refined)');
  });

  it('soft-deletes routine templates (_deleted: true) via Dexie transactions, preserving foreign key integrity in historical workouts (INV-05)', async () => {
    const routineId = 'r_push_day';
    await createRoutine(db, {
      id: routineId,
      name: 'Push Day Blueprint',
      exercises: ['barbell-bench-press', 'overhead-press'],
      who: 'athlete_sam'
    });

    // Record historical workout session linked to this routine
    const workoutId = 'w_historical_session_99';
    await db.workouts.put({
      id: workoutId,
      d: '2026-09-01',
      routineId: routineId,
      name: 'Push Day Workout',
      start: 1788220800000,
      end: 1788224400000,
      vol: 5000,
      _rev: 1,
      _deleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Soft-delete the routine
    const deleteResult = await deleteRoutine(db, {
      id: routineId,
      who: 'athlete_sam'
    });

    expect(deleteResult.id).toBe(routineId);
    expect(deleteResult._deleted).toBe(true);

    // Verify routine is soft-deleted, not physically purged from table
    const storedRoutine = await db.routines.get(routineId);
    expect(storedRoutine).toBeDefined();
    expect(storedRoutine._deleted).toBe(true);

    // Foreign key integrity in historical workouts is strictly preserved (INV-05)
    const historicalWorkout = await db.workouts.get(workoutId);
    expect(historicalWorkout).toBeDefined();
    expect(historicalWorkout.routineId).toBe(routineId);
    expect(historicalWorkout.vol).toBe(5000);

    // Verify deletion audit entry
    const deleteAudits = await db.auditLog
      .where('entityId')
      .equals(routineId)
      .and(a => a.entity === 'routines' && a.op === 'delete')
      .toArray();
    expect(deleteAudits).toHaveLength(1);
    expect(deleteAudits[0].who).toBe('athlete_sam');

    // Query active routines filters out soft-deleted by default
    const activeRoutines = await queryRoutines(db);
    expect(activeRoutines.find(r => r.id === routineId)).toBeUndefined();

    // Query with includeDeleted: true includes the soft-deleted routine
    const allRoutines = await queryRoutines(db, { includeDeleted: true });
    expect(allRoutines.find(r => r.id === routineId)).toBeDefined();

    // Single query respects includeDeleted flag
    expect(await queryRoutineById(db, routineId)).toBeNull();
    expect(await queryRoutineById(db, routineId, { includeDeleted: true })).toBeDefined();
  });
});

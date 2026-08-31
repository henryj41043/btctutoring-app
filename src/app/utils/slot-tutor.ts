import {Student} from '../models/student.model';
import {ScheduleSlot} from './proration';

/**
 * Per-slot tutor helpers: a schedule slot may name its own tutor (a second
 * tutor covering one subject); absent means the student's assigned (primary)
 * tutor. Mirror of the backend's visibility rule in students.service.
 */

/** The tutor a slot's sessions belong to ('' treated as absent). */
export function effectiveSlotTutorId(slot: ScheduleSlot, student: Student): string | undefined {
  return slot.tutor_id || student.assigned_tutor_id || undefined;
}

/**
 * A student is visible to tutor T iff T is their primary (assigned) tutor OR
 * any live schedule slot names T as its per-slot tutor.
 */
export function studentVisibleToTutor(student: Student, tutorId: string | undefined): boolean {
  if (!tutorId) {
    return false;
  }
  return student.assigned_tutor_id === tutorId
    || (student.schedule ?? []).some(slot => slot?.tutor_id === tutorId);
}

/**
 * Groups slots by their effective tutor id — the unit of series generation
 * and per-tutor availability checking. Slots with no resolvable tutor group
 * under '' (degenerate; callers treat it as the primary).
 */
export function groupSlotsByEffectiveTutor(
  slots: ScheduleSlot[],
  student: Student,
): Map<string, ScheduleSlot[]> {
  const groups = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const tutorId = effectiveSlotTutorId(slot, student) ?? '';
    const list = groups.get(tutorId) ?? [];
    list.push(slot);
    groups.set(tutorId, list);
  }
  return groups;
}
